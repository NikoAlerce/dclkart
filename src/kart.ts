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

// ─── Estacionamiento del avatar ───────────────────────────────────────────────
// El avatar se teletransporta aquí al subirse. Alto (Y=100) para que
// el collider del avatar no interfiera con la pista.
const PARKING_SPOT = Vector3.create(472, 100, 248)

// ─── Mapas globales ───────────────────────────────────────────────────────────
// entity → enumId de red
export const kartEntityToId  = new Map<number, number>()
// entity → entidad hija que tiene el MeshCollider (para delete/restore)
export const kartColliderMap = new Map<number, number>()

export function createKart(config: KartConfig): number {
  const kartEntity = engine.addEntity()

  // ── Entidad padre: física y movimiento ──────────────────────────────────
  Transform.create(kartEntity, {
    position: config.spawnPos,
    rotation: Quaternion.fromEulerDegrees(0, config.spawnRotY, 0),
    scale:    Vector3.create(1, 1, 1)
  })

  // ── Modelo visual (hijo con corrección de orientación) ──────────────────
  const kartModel = engine.addEntity()
  GltfContainer.create(kartModel, {
    src: config.modelPath,
    invisibleMeshesCollisionMask: ColliderLayer.CL_NONE,
    visibleMeshesCollisionMask:   ColliderLayer.CL_NONE
  })
  Transform.create(kartModel, {
    parent:   kartEntity,
    position: Vector3.create(0, 0.4, 0),
    rotation: Quaternion.fromEulerDegrees(0, -90, 0),
    scale:    Vector3.create(1.25, 1.25, 1.25)
  })

  // ── Caja de colisión con tamaño real del kart ───────────────────────────
  // El kart visual mide aprox. 2.5m largo × 1.5m ancho × 0.9m alto.
  // Usamos una entidad hija con esa escala para que el jugador no lo atraviese
  // y para que los raycasts de otros karts rebotan correctamente.
  const kartCollider = engine.addEntity()
  Transform.create(kartCollider, {
    parent:   kartEntity,
    position: Vector3.create(0, 0.45, 0),          // centro de masa del kart
    scale:    Vector3.create(1.5, 0.9, 2.5)        // ancho, alto, largo
  })
  MeshCollider.setBox(kartCollider, ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER)

  // ── Datos de físicas iniciales ──────────────────────────────────────────
  KartData.create(kartEntity, {
    currentSpeed:   0,
    maxSpeed:       32,
    acceleration:   20,
    friction:       0.8,
    turnSpeed:      75,
    isOccupied:     false,
    isDrifting:     false,
    driftTime:      0,
    driftDirection: 0,
    boostTime:      0,
    lastSafeX:    config.spawnPos.x,
    lastSafeY:    config.spawnPos.y,
    lastSafeZ:    config.spawnPos.z,
    lastSafeRotY: config.spawnRotY,
    modelEntity:  kartModel
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
    { entity: kartCollider, opts: { button: InputAction.IA_POINTER, hoverText: 'Subirse al Kart' } },
    () => {
      const kartData  = KartData.getMutable(kartEntity)
      const ownership = KartOwner.getMutable(kartEntity)

      // Si ya está ocupado (otro jugador lo está usando), nada
      if (ownership.ownerId !== '') return
      if (kartData.isOccupied) return

      // Reclamar el kart: sincronizado para que todos vean que está ocupado
      const myId = myProfile?.userId ?? 'local'
      ownership.ownerId   = myId
      kartData.isOccupied = true
      RaceState.startCountdown()

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
          kartTransform.position.x + bwd.x * 7.0,
          kartTransform.position.y + 3.2,
          kartTransform.position.z + bwd.z * 7.0
        ),
        rotation: kartTransform.rotation
      })
      VirtualCamera.create(cameraPivot, {})
      MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: cameraPivot })
      kartData.cameraPivotEntity = cameraPivot

      // ── PASO 3a: Sensor de PISO ───────────────────────────────────────────
      const floorSensor = engine.addEntity()
      Transform.create(floorSensor, {
        parent:   kartEntity,
        position: Vector3.create(0, 4.0, 0)
      })
      Raycast.createOrReplace(floorSensor, {
        direction:     { $case: 'globalDirection', globalDirection: Vector3.create(0, -1, 0) },
        maxDistance:   20.0,
        queryType:     RaycastQueryType.RQT_QUERY_ALL,
        continuous:    true,
        collisionMask: ColliderLayer.CL_PHYSICS
      })
      kartData.floorSensorEntity = floorSensor

      // ── PASO 3b: Sensor de PARED (y choque con otros karts) ──────────────
      const wallSensor = engine.addEntity()
      Transform.create(wallSensor, {
        parent:   kartEntity,
        position: Vector3.create(0, 0.5, 1.0)
      })
      Raycast.createOrReplace(wallSensor, {
        direction:     { $case: 'localDirection', localDirection: Vector3.create(0, 0, 1) },
        maxDistance:   2.5,
        queryType:     RaycastQueryType.RQT_QUERY_ALL,
        continuous:    true,
        collisionMask: ColliderLayer.CL_PHYSICS   // detecta paredes Y otros karts
      })
      kartData.wallSensorEntity = wallSensor

      // ── PASO 4: Chispas de drift ─────────────────────────────────────────
      const sparkEntity = engine.addEntity()
      Transform.create(sparkEntity, {
        parent:   kartEntity,
        position: Vector3.create(0, 0.15, -0.9)
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
