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
import { KartData } from './components'
import { RaceState } from './raceState'

// ─── Coordenada del "Estacionamiento" ────────────────────────────────────────
// El avatar real se teletransporta aquí al subirse y queda inerte.
// Lo ponemos alto (Y=100) para que el collider invisible del avatar no bloquee la pista.
const PARKING_SPOT = Vector3.create(472, 100, 248)

export function createKart(spawnPosition: Vector3) {
  const kartEntity = engine.addEntity()

  // ── Entidad padre: física y movimiento ──────────────────────────────────
  Transform.create(kartEntity, {
    position: spawnPosition,
    rotation: Quaternion.fromEulerDegrees(0, 50, 0),
    scale: Vector3.create(1, 1, 1)
  })

  // ── Modelo visual (hijo con corrección de orientación) ──────────────────
  const kartModel = engine.addEntity()
  GltfContainer.create(kartModel, {
    src: 'assets/models/kart.glb',
    invisibleMeshesCollisionMask: ColliderLayer.CL_NONE,
    visibleMeshesCollisionMask: ColliderLayer.CL_NONE
  })
  Transform.create(kartModel, {
    parent: kartEntity,
    position: Vector3.create(0, 0.4, 0),              // 0.4m arriba: no se hunde en el asfalto
    rotation: Quaternion.fromEulerDegrees(0, -90, 0), // Corrección: eje +X del GLB → +Z del padre
    scale: Vector3.create(1.25, 1.25, 1.25)
  })

  // Collider solo para puntero (sin física nativa: DCL no puede empujar el kart)
  MeshCollider.setBox(kartEntity, ColliderLayer.CL_POINTER)

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
    // Checkpoint inicial = posición de spawn
    lastSafeX:    spawnPosition.x,
    lastSafeY:    spawnPosition.y,
    lastSafeZ:    spawnPosition.z,
    lastSafeRotY: 50,  // Rotación inicial del kart
    modelEntity:  kartModel
  })

  // ── Glow Base (Estética Premium) ──────────────────────────────────────────
  LightSource.create(kartEntity, {
    color: Color3.create(0.2, 0.8, 1.0), // Glow neon cyan
    intensity: 2, // Bajamos la intensidad para no quemar la textura del kart
    range: 10
  })

  // ── Evento: subirse al kart ─────────────────────────────────────────────
  pointerEventsSystem.onPointerDown(
    { entity: kartEntity, opts: { button: InputAction.IA_POINTER, hoverText: 'Subirse al Kart' } },
    () => {
      const kartData = KartData.getMutable(kartEntity)
      if (kartData.isOccupied) return
      kartData.isOccupied = true
      RaceState.startCountdown()

      const kartTransform = Transform.get(kartEntity)

      // ── PASO 1: Ocultar el Avatar y Bloquear Controles ────────────────────
      // Como no podemos mover físicamente el avatar fotograma a fotograma (DCL lo impide),
      // el avatar se quedará quieto en la largada. Lo ocultamos poniéndole una "caja de invisibilidad".
      InputModifier.createOrReplace(engine.PlayerEntity, {
        mode: InputModifier.Mode.Standard({ disableAll: true })
      })
      
      const hideAreaEntity = engine.addEntity()
      Transform.create(hideAreaEntity, {
        parent: engine.PlayerEntity,
        position: Vector3.Zero()
      })
      AvatarModifierArea.create(hideAreaEntity, {
        area: Vector3.create(4, 4, 4),
        modifiers: [AvatarModifierType.AMT_HIDE_AVATARS],
        excludeIds: []
      })
      kartData.hideAreaEntity = hideAreaEntity
      
      // ── PASO 1.5: Guardar la posición actual como checkpoint seguro ─────────
      // NO reposicionamos el kart: arranca exactamente donde está parado.
      const currentPos = Transform.get(kartEntity)
      kartData.currentSpeed = 0
      kartData.lastSafeX = currentPos.position.x
      kartData.lastSafeY = currentPos.position.y
      kartData.lastSafeZ = currentPos.position.z
      const euler = Quaternion.toEulerAngles(currentPos.rotation)
      kartData.lastSafeRotY = euler.y
      
      // Remover el collider del puntero para que no moleste el hover mientras manejás
      MeshCollider.deleteFrom(kartEntity)

      // ── PASO 2: Cámara virtual "banda elástica" ──────────────────────────
      // La cámara NO tiene parent. Vive suelta en el mundo.
      // kartMovementSystem la persigue al kart con lerp cada frame,
      // eliminando la rigidez del "rigid parenting" que sacudía la pantalla.
      const bwd = Vector3.rotate(Vector3.Backward(), kartTransform.rotation)
      const cameraPivot = engine.addEntity()
      Transform.create(cameraPivot, {
        // Sin parent → posición en espacio mundial
        position: Vector3.create(
          kartTransform.position.x + bwd.x * 7.0,
          kartTransform.position.y + 3.2,
          kartTransform.position.z + bwd.z * 7.0
        ),
        rotation: kartTransform.rotation   // Inicialmente mira en la misma dirección que el kart
      })
      VirtualCamera.create(cameraPivot, {})
      MainCamera.createOrReplace(engine.CameraEntity, { virtualCameraEntity: cameraPivot })
      kartData.cameraPivotEntity = cameraPivot

      // ── PASO 3a: Sensor de PISO (hijo, rayo hacia abajo) ─────────────────
      // Entidad separada porque una entidad solo puede tener UN Raycast.
      // Posicionada 4m arriba del kart: el rayo nunca clipea en rampas.
      const floorSensor = engine.addEntity()
      Transform.create(floorSensor, {
        parent: kartEntity,
        position: Vector3.create(0, 4.0, 0)
      })
      Raycast.createOrReplace(floorSensor, {
        direction: { $case: 'globalDirection', globalDirection: Vector3.create(0, -1, 0) },
        maxDistance: 20.0,
        queryType: RaycastQueryType.RQT_QUERY_ALL,
        continuous: true,
        collisionMask: ColliderLayer.CL_PHYSICS
      })
      kartData.floorSensorEntity = floorSensor

      // ── PASO 3b: Sensor de PARED (hijo, rayo hacia adelante) ─────────────
      // localDirection: el rayo siempre apunta en el +Z LOCAL del sensor,
      // que al ser hijo del kart = dirección de avance del kart en el mundo.
      const wallSensor = engine.addEntity()
      Transform.create(wallSensor, {
        parent: kartEntity,
        position: Vector3.create(0, 0.5, 1.0)  // trompa del kart, 0.5m del suelo
      })
      Raycast.createOrReplace(wallSensor, {
        direction: { $case: 'localDirection', localDirection: Vector3.create(0, 0, 1) },
        maxDistance: 2.5,
        queryType: RaycastQueryType.RQT_QUERY_ALL, // Para no perder checkpoints detrás de otros objetos
        continuous: true,
        collisionMask: ColliderLayer.CL_PHYSICS
      })
      kartData.wallSensorEntity = wallSensor

      // Inicializar checkpoint con la posición actual del kart
      kartData.lastSafeX    = kartTransform.position.x
      kartData.lastSafeY    = kartTransform.position.y
      kartData.lastSafeZ    = kartTransform.position.z
      kartData.lastSafeRotY = 50

      // ── PASO 4: Chispas de drift (ParticleSystem + LightSource) ──────────
      // Una sola entidad hija en la cola del kart.
      // ParticleSystem: PSS_WORLD (1) → chispas quedan fijas en el suelo al moverse.
      // PSB_ADD (1) → blend aditivo = brillo máximo, como sparks reales.
      // LightSource: luz puntual que pulsa en sincronía con las chispas.
      const sparkEntity = engine.addEntity()
      Transform.create(sparkEntity, {
        parent: kartEntity,
        position: Vector3.create(0, 0.15, -0.9)   // cola del kart, a nivel del suelo
      })
      ParticleSystem.create(sparkEntity, {
        active: false,
        rate: 0,
        maxParticles: 120,
        lifetime: 0.35,
        gravity: -2,
        simulationSpace: 1,          // 1 = PSS_WORLD: las chispas quedan en el suelo
        initialVelocitySpeed: { start: 1.5, end: 5.0 },
        initialSize: { start: 0.03, end: 0.09 },
        sizeOverTime: { start: 0.0, end: 0.01 },
        faceTravelDirection: true,
        blendMode: 1,                // 1 = PSB_ADD: aditivo = máximo brillo
        billboard: true,
        initialColor: {
          start: Color4.create(1, 0.85, 0.2, 1),
          end: Color4.create(1, 1,    0.5, 1)
        }
      })
      LightSource.create(sparkEntity, {
        active: false,
        color: { r: 1, g: 0.85, b: 0.2 },   // amarillo inicial (cambia con driftTime)
        intensity: 0,
        range: 4.0,
        shadow: false
      })
      kartData.sparkEntity = sparkEntity

      // Fase 3 (arte): aquí se emparentará el .glb del piloto al kartEntity.
    }
  )

  return kartEntity
}
