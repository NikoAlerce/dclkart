import { engine, Transform, GltfContainer, ColliderLayer, Raycast, RaycastResult, RaycastQueryType } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { kartMovementSystem, turboParticleSystem } from './kartSystem'
import { scanAndConvertKarts, spawnedModelEntities } from './kart'
import { setupUi } from './ui'
import { RaceState } from './raceState'
import { setupWindParticles } from './windParticles'
import { setupMonster } from './monster'
import { SPAWN_POSITION, SPAWN_CAMERA_TARGET } from './spawnConfig'


export function main() {
  // 1. Track GLB
  const trackEntity = engine.addEntity()
  spawnedModelEntities.add(trackEntity)
  GltfContainer.create(trackEntity, {
    src: 'assets/models/track.glb',
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS,
    visibleMeshesCollisionMask:   ColliderLayer.CL_PHYSICS
  })
  Transform.create(trackEntity, {
    position: Vector3.create(-88.00, 10.00, -72.00),
    rotation: Quaternion.create(0.0000, 0.0000, 0.0000, 1.0000),
    scale: Vector3.create(1.000, 1.000, 1.000)
  })

  RaceState.trackX = -88
  RaceState.trackY = 10
  RaceState.trackZ = -72

  engine.addSystem(() => {
    if (Transform.has(trackEntity)) {
      const pos = Transform.get(trackEntity).position
      RaceState.trackX = pos.x
      RaceState.trackY = pos.y
      RaceState.trackZ = pos.z
    }
  })

  // 1.5 Flowerman
  const flowermanEntity = engine.addEntity()
  spawnedModelEntities.add(flowermanEntity)
  GltfContainer.create(flowermanEntity, {
    src: 'assets/models/flowerman.glb',
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS,
    visibleMeshesCollisionMask:   ColliderLayer.CL_PHYSICS
  })
  Transform.create(flowermanEntity, {
    position: Vector3.create(-88, 10, -72),
    scale:    Vector3.create(1, 1, 1)
  })

  // 1.6 Arboles
  const arbolesEntity = engine.addEntity()
  spawnedModelEntities.add(arbolesEntity)
  GltfContainer.create(arbolesEntity, {
    src: 'assets/models/arboles.glb',
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS,
    visibleMeshesCollisionMask:   ColliderLayer.CL_PHYSICS
  })
  Transform.create(arbolesEntity, {
    position: Vector3.create(-88, 10, -72),
    scale:    Vector3.create(1, 1, 1)
  })

  // 1.8 Ground probe: un raycast continuo en la zona de spawn para teletransportar al jugador.
  // Los KARTS ya NO se snapean a una altura global: cada uno respeta su spawnPos.y del editor
  // (WYSIWYG — donde lo ubicás en el editor sentado sobre el piso, ahí queda en Bevy). Esto
  // permite tener karts en zonas de distinta altura de terreno sin que se hundan ni floten.
  let actualGroundY: number | null = null  // zona spawn → para teletransportar al jugador

  function makeGroundProbe(x: number, z: number) {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(x, 40, z) })
    Raycast.createOrReplace(e, {
      direction:     { $case: 'globalDirection', globalDirection: Vector3.create(0, -1, 0) },
      maxDistance:   80,
      queryType:     RaycastQueryType.RQT_QUERY_ALL,
      continuous:    true,
      collisionMask: ColliderLayer.CL_PHYSICS
    })
    return e
  }

  const spawnProbeEnt = makeGroundProbe(SPAWN_POSITION.x, SPAWN_POSITION.z)

  function topHit(e: ReturnType<typeof engine.addEntity>): number | null {
    const r = RaycastResult.getOrNull(e)
    if (!r || r.hits.length === 0) return null
    const valid = r.hits
      .filter(h => h.position && h.entityId !== engine.PlayerEntity)
      .sort((a, b) => b.position!.y - a.position!.y)  // más alto = superficie caminable
    return valid.length > 0 ? valid[0].position!.y : null
  }

  let probesActive = true
  engine.addSystem(function groundSnapSystem() {
    if (!probesActive) return

    if (actualGroundY === null) actualGroundY = topHit(spawnProbeEnt)
    if (actualGroundY === null) return

    probesActive = false

    // Corregir posición del jugador si está en la zona de spawn
    if (Transform.has(engine.PlayerEntity)) {
      const p = Transform.get(engine.PlayerEntity).position
      const dx = p.x - SPAWN_POSITION.x
      const dz = p.z - SPAWN_POSITION.z
      if (Math.sqrt(dx*dx + dz*dz) < 15) {
        movePlayerTo({
          newRelativePosition: Vector3.create(SPAWN_POSITION.x, actualGroundY + 1.5, SPAWN_POSITION.z),
          cameraTarget: SPAWN_CAMERA_TARGET
        }).catch(() => {})
      }
    }

    engine.removeEntity(spawnProbeEnt)
  })

  // 1.9 Spawn inicial: teletransporta al jugador al punto de spawn.
  // El check de éxito es solo en XZ — la altura final la determina la física del GLB.
  let spawnAttempts = 0
  let timeSinceLastSpawnAttempt = 0
  engine.addSystem((dt) => {
    if (spawnAttempts >= 5) return
    if (!Transform.has(engine.PlayerEntity)) return

    timeSinceLastSpawnAttempt += dt
    const pos = Transform.get(engine.PlayerEntity).position
    const dx = pos.x - SPAWN_POSITION.x
    const dz = pos.z - SPAWN_POSITION.z
    if (Math.sqrt(dx*dx + dz*dz) < 5.0) {
      spawnAttempts = 5
      return
    }

    if (timeSinceLastSpawnAttempt >= 1.0 || spawnAttempts === 0) {
      timeSinceLastSpawnAttempt = 0
      spawnAttempts++
      const spawnY = actualGroundY !== null ? actualGroundY + 1.5 : SPAWN_POSITION.y
      movePlayerTo({
        newRelativePosition: Vector3.create(SPAWN_POSITION.x, spawnY, SPAWN_POSITION.z),
        cameraTarget: SPAWN_CAMERA_TARGET
      }).catch(() => {})
    }
  })

  // 2. Karts
  scanAndConvertKarts()

  // 3. Física
  engine.addSystem(kartMovementSystem)
  engine.addSystem(turboParticleSystem)

  // 3.5 Rescate: si el jugador cae al vacío a pie, volver al spawn
  let lastTeleportTime = 0
  engine.addSystem(() => {
    if (RaceState.isOccupied) return
    if (RaceState.ridingMonster) return   // montado: la posición es local, no rescatar al spawn
    if (!Transform.has(engine.PlayerEntity)) return
    const playerTransform = Transform.get(engine.PlayerEntity)
    if (playerTransform.position.y < 2.0) {
      const now = Date.now()
      if (now - lastTeleportTime > 3000) {
        lastTeleportTime = now
        const spawnY = actualGroundY !== null ? actualGroundY + 1.5 : SPAWN_POSITION.y
        movePlayerTo({
          newRelativePosition: Vector3.create(SPAWN_POSITION.x, spawnY, SPAWN_POSITION.z),
          cameraTarget: SPAWN_CAMERA_TARGET
        }).catch(() => {})
      }
    }
  })

  // 4. UI
  setupUi()

  // 5. Partículas de viento
  setupWindParticles()

  // 6. Monstruo gigante que deambula por el escenario
  setupMonster()
}
