import {
  engine, Transform, GltfContainer, ColliderLayer,
  MeshCollider, Raycast, RaycastQueryType,
  pointerEventsSystem, InputAction, InputModifier,
  AvatarModifierArea, AvatarModifierType,
  VirtualCamera, MainCamera,
  ParticleSystem, LightSource
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { syncEntity } from '@dcl/sdk/network'
import { myProfile } from '@dcl/sdk/network'
import { KartData, KartOwner } from './components'
import { RaceState } from './raceState'
import type { KartConfig } from './kartConfig'
import { DEFAULT_PHYSICS, KART_CONFIGS, PHYS_SCALE_CAP } from './kartConfig'
import { getMyOwnerId } from './net'
import { GraffitiState } from './graffitiState'

// ─── Estacionamiento del avatar ───────────────────────────────────────────────
// El avatar se teletransporta aquí al subirse. Alto (Y=100) para que
// el collider del avatar no interfiera con la pista.
const PARKING_SPOT = Vector3.create(-88, 100, -72)

// ─── Mapas globales ───────────────────────────────────────────────────────────
// entity → enumId de red
export const kartEntityToId  = new Map<number, number>()
// entity → entidad hija que tiene el MeshCollider (para delete/restore)
export const kartColliderMap = new Map<number, number>()
export const spawnedModelEntities = new Set<number>()

export function createKart(config: KartConfig): number {
  const kartEntity = engine.addEntity()

  // ── Entidad padre: física y movimiento ──────────────────────────────────
  Transform.create(kartEntity, {
    position: config.spawnPos,
    rotation: Quaternion.fromEulerDegrees(0, config.spawnRotY + 90, 0),
    scale:    Vector3.create(1, 1, 1)
  })

  const scaleMult = config.scale ?? 1.0
  // Factor para la FÍSICA (velocidad/aceleración): proporcional al tamaño pero topeado
  // (ver PHYS_SCALE_CAP) para que las naves enormes no queden incontrolables. La
  // geometría sigue usando scaleMult (tamaño real).
  const physScale = Math.min(scaleMult, PHYS_SCALE_CAP)

  // ── Modelo visual (hijo con corrección de orientación) ──────────────────
  const kartModel = engine.addEntity()
  spawnedModelEntities.add(kartModel)
  GltfContainer.create(kartModel, {
    src: config.modelPath,
    invisibleMeshesCollisionMask: ColliderLayer.CL_NONE,
    visibleMeshesCollisionMask:   ColliderLayer.CL_NONE
  })
  Transform.create(kartModel, {
    parent:   kartEntity,
    position: Vector3.Zero(),
    rotation: Quaternion.fromEulerDegrees(0, -90, 0),
    scale:    Vector3.create(scaleMult, scaleMult, scaleMult)
  })

  // ── Caja de colisión con tamaño real del kart ───────────────────────────
  // El kart visual mide aprox. 2.5m largo × 1.5m ancho × 0.9m alto.
  // Usamos una entidad hija con esa escala para que el jugador no lo atraviese
  // y para que los raycasts de otros karts rebotan correctamente.
  const kartCollider = engine.addEntity()
  Transform.create(kartCollider, {
    parent:   kartEntity,
    position: Vector3.create(0, 0.45 * scaleMult, 0),          // centro de masa del kart
    scale:    Vector3.create(1.5 * scaleMult, 0.9 * scaleMult, 2.5 * scaleMult)        // ancho, alto, largo
  })
  // Solo FÍSICA: pensada con offset Y=0.45·scale (origen en ruedas). El clic va aparte.
  MeshCollider.setBox(kartCollider, ColliderLayer.CL_PHYSICS)

  // ── Caja de CLIC para subirse (separada de la física) ───────────────────
  // El modelo (hijo en Zero) está centrado en el origen del kart; los GLB grandes y
  // escalados dejaban el viejo target de clic (offset Y=0.45·scale) flotando MUY por
  // encima del modelo → imposible de clickear. Esta caja va CENTRADA en el modelo
  // (Y=0) y generosa, solo CL_POINTER, así no afecta la física ni la colisión.
  const kartClicker = engine.addEntity()
  Transform.create(kartClicker, {
    parent:   kartEntity,
    position: Vector3.Zero(),
    scale:    Vector3.create(2.0 * scaleMult, 1.6 * scaleMult, 3.0 * scaleMult)
  })
  MeshCollider.setBox(kartClicker, ColliderLayer.CL_POINTER)

  // ── Datos de físicas iniciales ──────────────────────────────────────────
  // Usa los parámetros del config si están definidos, si no los defaults estándar.
  //
  // FÍSICA ESCALADA POR TAMAÑO: velocidad y aceleración (magnitudes LINEALES, m/s y
  // m/s²) se multiplican por physScale (= tamaño, topeado en PHYS_SCALE_CAP) para que
  // un vehículo N× más grande se mueva N× más rápido → mantiene el MISMO feel que a
  // escala 1 (mismos "largos de carrocería" por segundo; el radio de giro crece
  // proporcional porque turnSpeed —angular, °/s— queda constante). friction es
  // adimensional (no escala).
  KartData.create(kartEntity, {
    currentSpeed:   0,
    maxSpeed:       (config.maxSpeed     ?? DEFAULT_PHYSICS.maxSpeed)     * physScale,
    acceleration:   (config.acceleration ?? DEFAULT_PHYSICS.acceleration) * physScale,
    friction:       config.friction     ?? DEFAULT_PHYSICS.friction,
    turnSpeed:      config.turnSpeed    ?? DEFAULT_PHYSICS.turnSpeed,
    isOccupied:     false,
    isDrifting:     false,
    driftTime:      0,
    driftDirection: 0,
    boostTime:      0,
    lastSafeX:    config.spawnPos.x,
    lastSafeY:    config.spawnPos.y,
    lastSafeZ:    config.spawnPos.z,
    lastSafeRotY: config.spawnRotY + 90,
    modelEntity:  kartModel,
    scale:        scaleMult,
    vehicleType:  config.vehicleType ?? 'kart',
    shipVertSpeed: 0,
    modelYawOffset: config.modelYawOffset ?? -90,
    groundOffsetY: config.groundOffsetY ?? 0.5
  })

  // ── KartOwner: libre al inicio ───────────────────────────────────────────
  KartOwner.create(kartEntity, { ownerId: '' })

  // ── Sincronización multijugador ──────────────────────────────────────────
  // Transform: todos los jugadores ven el kart moverse en tiempo real.
  // KartOwner: todos saben quién está manejando (para bloquear el clic).
  // enumId = config.id  →  debe ser único y estable (hardcodeado en kartConfig.ts).
  syncEntity(
    kartEntity,
    [Transform.componentId, KartOwner.componentId],
    config.id
  )

  // Guardar referencia del collider en un mapa para poder restaurarlo al salir
  kartEntityToId.set(kartEntity, config.id)
  // Mapa secundario: kart entity → collider entity
  kartColliderMap.set(kartEntity, kartCollider)

  // ── Evento: subirse al kart (registrado en la entidad collider) ───────────
  pointerEventsSystem.onPointerDown(
    { entity: kartClicker, opts: { button: InputAction.IA_POINTER, hoverText: 'Subirse al Kart' } },
    () => {
      if (GraffitiState.sprayMode) return // pintando con aerosol → el clic no sube al kart
      const kartData  = KartData.getMutable(kartEntity)
      const ownership = KartOwner.getMutable(kartEntity)

      // Si ya está ocupado (otro jugador lo está usando), nada
      if (ownership.ownerId !== '') return
      if (kartData.isOccupied) return

      // Reclamar el kart: sincronizado para que todos vean que está ocupado.
      // Usamos address (getMyOwnerId) → consistente entre clientes. Si dos reclaman
      // a la vez, syncEntity converge a UN ownerId; el que no coincida se baja solo
      // (ver chequeo de "propiedad perdida" en kartMovementSystem).
      const myId = getMyOwnerId()
      ownership.ownerId   = myId
      kartData.isOccupied = true
      RaceState.isOccupied = true

      const kartTransform = Transform.get(kartEntity)

      // ── PASO 1: Ocultar Avatar y bloquear controles ──────────────────────
      InputModifier.createOrReplace(engine.PlayerEntity, {
        mode: InputModifier.Mode.Standard({ disableAll: true })
      })

      const hideAreaEntity = engine.addEntity()
      Transform.create(hideAreaEntity, {
        parent:   engine.PlayerEntity,
        position: Vector3.Zero()
      })
      AvatarModifierArea.create(hideAreaEntity, {
        area:      Vector3.create(4, 4, 4),
        modifiers: [AvatarModifierType.AMT_HIDE_AVATARS],
        excludeIds: []
      })
      kartData.hideAreaEntity = hideAreaEntity

      // ── PASO 1.5: Registrar posición actual como checkpoint seguro ───────
      kartData.currentSpeed = 0
      kartData.lastSafeX    = kartTransform.position.x
      kartData.lastSafeY    = kartTransform.position.y
      kartData.lastSafeZ    = kartTransform.position.z
      const euler           = Quaternion.toEulerAngles(kartTransform.rotation)
      kartData.lastSafeRotY = euler.y

      // Quitar collider mientras manejás (el raycast de pared no se rebota contra sí mismo)
      MeshCollider.deleteFrom(kartCollider)

      // ── PASO 2: Cámara virtual banda elástica ────────────────────────────
      const bwd = Vector3.rotate(Vector3.Backward(), kartTransform.rotation)
      const cameraPivot = engine.addEntity()
      Transform.create(cameraPivot, {
        position: Vector3.create(
          kartTransform.position.x + bwd.x * 7.0 * scaleMult,
          kartTransform.position.y + 3.2 * scaleMult,
          kartTransform.position.z + bwd.z * 7.0 * scaleMult
        ),
        rotation: kartTransform.rotation
      })
      VirtualCamera.create(cameraPivot, {})
      MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: cameraPivot })
      kartData.cameraPivotEntity = cameraPivot

      // ── PASO 3a: Sensor de PISO ───────────────────────────────────────────
      // Colocamos el sensor a 1.5 * scaleMult de altura y adelantado (0.5 * scaleMult).
      // Al estar elevado pero apuntando hacia abajo, tolera que el kart se hunda temporalmente en bajadas/rampas,
      // pero por su ángulo y máscara de normales en kartSystem.ts no colisionará con la parte inferior de puentes.
      const floorSensor = engine.addEntity()
      Transform.create(floorSensor, {
        parent:   kartEntity,
        position: Vector3.create(0, 1.5 * scaleMult, 0.5 * scaleMult)
      })
      Raycast.createOrReplace(floorSensor, {
        direction:     { $case: 'globalDirection', globalDirection: Vector3.create(0, -1, 0) },
        maxDistance:   12.0 * scaleMult,
        queryType:     RaycastQueryType.RQT_QUERY_ALL,
        continuous:    true,
        collisionMask: ColliderLayer.CL_PHYSICS
      })
      kartData.floorSensorEntity = floorSensor

      // ── PASO 3b: Sensor de PARED (Triple: Centro, Izquierda y Derecha para detectar árboles y postes angostos) ──
      // Centro
      const wallSensor = engine.addEntity()
      Transform.create(wallSensor, {
        parent:   kartEntity,
        position: Vector3.create(0, 0.5 * scaleMult, 1.0 * scaleMult)
      })
      Raycast.createOrReplace(wallSensor, {
        direction:     { $case: 'localDirection', localDirection: Vector3.create(0, 0, 1) },
        maxDistance:   1.2 * scaleMult,
        queryType:     RaycastQueryType.RQT_QUERY_ALL,
        continuous:    true,
        collisionMask: ColliderLayer.CL_PHYSICS
      })
      kartData.wallSensorEntity = wallSensor

      // Izquierda
      const wallSensorLeft = engine.addEntity()
      Transform.create(wallSensorLeft, {
        parent:   kartEntity,
        position: Vector3.create(-0.5 * scaleMult, 0.5 * scaleMult, 1.0 * scaleMult)
      })
      Raycast.createOrReplace(wallSensorLeft, {
        direction:     { $case: 'localDirection', localDirection: Vector3.create(0, 0, 1) },
        maxDistance:   1.2 * scaleMult,
        queryType:     RaycastQueryType.RQT_QUERY_ALL,
        continuous:    true,
        collisionMask: ColliderLayer.CL_PHYSICS
      })
      kartData.wallSensorLeftEntity = wallSensorLeft

      // Derecha
      const wallSensorRight = engine.addEntity()
      Transform.create(wallSensorRight, {
        parent:   kartEntity,
        position: Vector3.create(0.5 * scaleMult, 0.5 * scaleMult, 1.0 * scaleMult)
      })
      Raycast.createOrReplace(wallSensorRight, {
        direction:     { $case: 'localDirection', localDirection: Vector3.create(0, 0, 1) },
        maxDistance:   1.2 * scaleMult,
        queryType:     RaycastQueryType.RQT_QUERY_ALL,
        continuous:    true,
        collisionMask: ColliderLayer.CL_PHYSICS
      })
      kartData.wallSensorRightEntity = wallSensorRight

      // ── PASO 4: Chispas de drift ─────────────────────────────────────────
      const sparkEntity = engine.addEntity()
      Transform.create(sparkEntity, {
        parent:   kartEntity,
        position: Vector3.create(0, 0.15 * scaleMult, -0.9 * scaleMult)
      })
      ParticleSystem.create(sparkEntity, {
        active:       false,
        rate:         0,
        maxParticles: 120,
        lifetime:     0.35,
        gravity:      -2,
        simulationSpace:           1,
        initialVelocitySpeed:      { start: 1.5, end: 5.0 },
        initialSize:               { start: 0.03, end: 0.09 },
        sizeOverTime:              { start: 0.0,  end: 0.01 },
        faceTravelDirection:       true,
        blendMode:                 1,
        billboard:                 true,
        initialColor: {
          start: Color4.create(1, 0.85, 0.2, 1),
          end:   Color4.create(1, 1,    0.5, 1)
        }
      })
      LightSource.create(sparkEntity, {
        active:    false,
        color:     { r: 1, g: 0.85, b: 0.2 },
        intensity: 0,
        range:     4.0,
        shadow:    false
      })
      kartData.sparkEntity = sparkEntity
    }
  )

  return kartEntity
}

// ─── Escáner Automático para Creator Hub ─────────────────────────────────────
export function scanAndConvertKarts() {
  // 1. Spawneamos siempre los karts desde KART_CONFIGS (con las posiciones exactas del editor)
  console.log(`[SCANNER] Spawneando karts desde KART_CONFIGS...`)
  for (const config of KART_CONFIGS) {
    createKart(config)
  }

  // 2. Buscamos y eliminamos cualquier entidad estática duplicada cargada desde el Creator Hub (main.crdt)
  function cleanupCreatorHubKarts() {
    let deletedCount = 0
    for (const [entity, gltf] of engine.getEntitiesWith(GltfContainer)) {
      const src = gltf.src.toLowerCase()
      if (
        src.includes('kart') ||
        src.includes('nave') ||
        src.includes('track.glb') ||
        src.includes('flowerman.glb') ||
        src.includes('arboles.glb') ||
        src.includes('trees.glb')
      ) {
        if (!spawnedModelEntities.has(entity)) {
          engine.removeEntity(entity)
          deletedCount++
        }
      }
    }
    if (deletedCount > 0) {
      console.log(`[SCANNER] Se eliminaron ${deletedCount} entidades estáticas duplicadas del Creator Hub (main.crdt).`)
    }
    engine.removeSystem(cleanupCreatorHubKarts)
  }

  // Agregamos el sistema para que limpie en el primer frame
  engine.addSystem(cleanupCreatorHubKarts)
}
