import { engine, Transform, GltfContainer, ColliderLayer, MeshCollider, LightSource, MeshRenderer, Material, Raycast, RaycastResult, RaycastQueryType } from '@dcl/sdk/ecs'
import { Vector3, Color3, Color4, Quaternion } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { kartMovementSystem, turboParticleSystem } from './kartSystem'
import { scanAndConvertKarts, spawnedModelEntities } from './kart'
import { setupUi } from './ui'
import { RaceState } from './raceState'
import { setupWindParticles } from './windParticles'
import { SPAWN_POSITION, SPAWN_PLATFORM, SPAWN_CAMERA_TARGET } from './spawnConfig'


export function main() {
  // 1. Instanciar la Pista de Carreras GLB (Parte 1: Track)
  const trackEntity = engine.addEntity()
  spawnedModelEntities.add(trackEntity)
  GltfContainer.create(trackEntity, {
    src: 'assets/models/track.glb',
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS,
    visibleMeshesCollisionMask:   ColliderLayer.CL_PHYSICS
  })
  Transform.create(trackEntity, {
    position: Vector3.create(-88, 10, -72),
    rotation: Quaternion.create(0.0000, 0.0000, 0.0000, 1.0000),
    scale: Vector3.create(1.000, 1.000, 1.000)
  })

  // Guardar coordenadas en RaceState para la UI
  RaceState.trackX = -88
  RaceState.trackY = 10
  RaceState.trackZ = -72

  // Actualizar dinámicamente las coordenadas registradas de la pista desde su Transform
  engine.addSystem(() => {
    if (Transform.has(trackEntity)) {
      const pos = Transform.get(trackEntity).position
      RaceState.trackX = pos.x
      RaceState.trackY = pos.y
      RaceState.trackZ = pos.z
    }
  })

  // 1.5 Instanciar la Pista de Carreras GLB (Parte 2: Flowerman)
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

  // 1.6 Instanciar la Pista de Carreras GLB (Parte 3: Arboles)
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

  // 1.8 Plataforma física invisible en la zona de Spawn
  // Evita que el jugador caiga al vacío (y=0) mientras el modelo GLB de la pista (5.8MB) se descarga y parsea.
  const spawnPlatform = engine.addEntity()
  Transform.create(spawnPlatform, {
    position: SPAWN_PLATFORM,
    scale:    Vector3.create(700, 0.5, 700)   // piso invisible enorme: caminás por toda la escena sin caerte
  })
  MeshCollider.setBox(spawnPlatform)

  // 1.9 Sistema de Spawn Inicial Seguro
  // Teletransporta al jugador a la posición de spawn elegida en el editor al iniciar la escena.
  // Realiza múltiples intentos espaciados en el tiempo para asegurar el éxito,
  // superando cualquier retraso de carga o anulación por parte del cliente de Decentraland.
  let spawnAttempts = 0
  let timeSinceLastSpawnAttempt = 0
  engine.addSystem((dt) => {
    if (spawnAttempts >= 5) return // Dejar de intentar después de 5 veces
    if (!Transform.has(engine.PlayerEntity)) return

    timeSinceLastSpawnAttempt += dt
    const playerTransform = Transform.get(engine.PlayerEntity)
    const distToSpawn = Vector3.distance(playerTransform.position, SPAWN_POSITION)

    // Si el jugador ya está prácticamente en el punto de spawn (menos de 2 metros), el spawn fue exitoso.
    // Tolerancia ajustada de 5→2m: con spawn determinístico el jugador cae casi exacto, así que una
    // tolerancia amplia ya no es necesaria y antes dejaba pasar spawns desviados sin corregir.
    if (distToSpawn < 2.0) {
      spawnAttempts = 5
      console.log(`[SPAWN] Jugador posicionado correctamente en el spawn point.`)
      return
    }

    if (timeSinceLastSpawnAttempt >= 1.0 || spawnAttempts === 0) {
      timeSinceLastSpawnAttempt = 0
      spawnAttempts++
      console.log(`[SPAWN] Intento ${spawnAttempts}/5 de posicionar al jugador en el spawn point: ${SPAWN_POSITION.x}, ${SPAWN_POSITION.y}, ${SPAWN_POSITION.z}`)
      movePlayerTo({
        newRelativePosition: Vector3.create(SPAWN_POSITION.x, SPAWN_POSITION.y + 0.1, SPAWN_POSITION.z),
        cameraTarget: SPAWN_CAMERA_TARGET
      }).catch((err) => {
        console.error(`[SPAWN] Error en el teletransporte inicial:`, err)
      })
    }
  })


  // 2. Escanear el mapa y convertir los autos/naves del Creator Hub en vehículos funcionales
  scanAndConvertKarts()

  // 3. Registrar los sistemas de física
  engine.addSystem(kartMovementSystem)
  engine.addSystem(turboParticleSystem)

  // 3.5 Sistema de rescate si el jugador se cae al vacío a pie
  let lastTeleportTime = 0
  engine.addSystem(() => {
    if (RaceState.isOccupied) return
    if (!Transform.has(engine.PlayerEntity)) return
    const playerTransform = Transform.get(engine.PlayerEntity)
    if (playerTransform.position.y < 3.0) {
      const now = Date.now()
      if (now - lastTeleportTime > 3000) {
        lastTeleportTime = now
        console.log(`[RESPAWN] Jugador detectado fuera de la pista a pie (Y < 3.0). Teletransportando a largada...`)
        movePlayerTo({
          newRelativePosition: Vector3.create(SPAWN_POSITION.x, SPAWN_POSITION.y + 0.1, SPAWN_POSITION.z),
          cameraTarget: SPAWN_CAMERA_TARGET
        }).catch(() => {})
      }
    }
  })

  // 4. Registrar UI
  setupUi()

  // 5. Inicializar partículas mágicas flotantes alrededor del jugador
  setupWindParticles()

  // 5.5 [HELPER] Logger de posición en vivo: reporta la posición del jugador cada
  // ~1s al editor-server (puerto 9000). Sirve para capturar coordenadas exactas
  // caminando en Bevy hasta el lugar deseado. (No afecta producción: el fetch falla
  // silenciosamente si el server no está.)
  let posLogTimer = 0
  engine.addSystem((dt) => {
    posLogTimer += dt
    if (posLogTimer < 1.0) return
    posLogTimer = 0
    if (!Transform.has(engine.PlayerEntity)) return
    const p = Transform.get(engine.PlayerEntity).position
    const msg = `POS_LIVE X=${p.x.toFixed(2)} Y=${p.y.toFixed(2)} Z=${p.z.toFixed(2)}`
    fetch(`http://localhost:9000/api/diagnostics?log=${encodeURIComponent(msg)}`).catch(() => {})
  })

  // 5.7 [HELPER] Sondas de altura: raycast hacia abajo en el spawn y en los extremos
  // de la fila de karts para conocer la altura REAL del suelo (parking lot) e ignorar
  // la plataforma invisible. Reporta la malla más baja "de pista" encontrada.
  const probePoints: { name: string; x: number; z: number }[] = [
    { name: 'SPAWN', x: -187.2, z: -20.4 },
    { name: 'KART_IZQ', x: -200.5, z: -26 },
    { name: 'KART_DER', x: -173.5, z: -26 }
  ]
  const probeEntities = probePoints.map((p) => {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(p.x, 40, p.z) })
    Raycast.createOrReplace(e, {
      direction: { $case: 'globalDirection', globalDirection: Vector3.create(0, -1, 0) },
      maxDistance: 80,
      queryType: RaycastQueryType.RQT_QUERY_ALL,
      continuous: false,
      collisionMask: ColliderLayer.CL_PHYSICS
    })
    return { e, name: p.name }
  })
  let probesDone = false
  engine.addSystem(() => {
    if (probesDone) return
    let allReady = true
    for (const { e } of probeEntities) {
      if (!RaycastResult.getOrNull(e)) { allReady = false; break }
    }
    if (!allReady) return
    probesDone = true
    for (const { e, name } of probeEntities) {
      const r = RaycastResult.get(e)
      const hits = [...r.hits].filter((h) => h.position).sort((a, b) => (a.position!.y) - (b.position!.y))
      for (const h of hits) {
        const msg = `PROBE_${name} hitY=${h.position!.y.toFixed(2)} mesh=${h.meshName || '?'}`
        fetch(`http://localhost:9000/api/diagnostics?log=${encodeURIComponent(msg)}`).catch(() => {})
      }
    }
  })

  // 6. Diagnóstico de coordenadas en consola
  let diagTime = 0
  engine.addSystem((dt) => {
    if (diagTime < 0) return
    diagTime += dt
    if (diagTime > 5) {
      diagTime = -1 // Solo ejecutar una vez
      
      const startMsg = "--- INICIO DE DIAGNOSTICO DE GLTFs EN LA ESCENA ---"
      console.log(`[DIAGNOSTICO] ${startMsg}`)
      fetch(`http://localhost:9000/api/diagnostics?log=${encodeURIComponent(startMsg)}`).catch(() => {})

      const pPos = Transform.has(engine.PlayerEntity) ? Transform.get(engine.PlayerEntity).position : undefined
      const pMsg = `Jugador parado en: X=${pPos?.x.toFixed(2)}, Y=${pPos?.y.toFixed(2)}, Z=${pPos?.z.toFixed(2)}`
      console.log(`[DIAGNOSTICO] ${pMsg}`)
      fetch(`http://localhost:9000/api/diagnostics?log=${encodeURIComponent(pMsg)}`).catch(() => {})

      for (const [entity, gltf] of engine.getEntitiesWith(GltfContainer)) {
        const pos = Transform.has(entity) ? Transform.get(entity).position : undefined
        const msg = `Entity=${entity} GLTF=${gltf.src} Posicion=${pos ? `X=${pos.x.toFixed(2)}, Y=${pos.y.toFixed(2)}, Z=${pos.z.toFixed(2)}` : 'N/A'}`
        console.log(`[DIAGNOSTICO] ${msg}`)
        fetch(`http://localhost:9000/api/diagnostics?log=${encodeURIComponent(msg)}`).catch(() => {})
      }

      const endMsg = "--- FIN DE DIAGNOSTICO ---"
      console.log(`[DIAGNOSTICO] ${endMsg}`)
      fetch(`http://localhost:9000/api/diagnostics?log=${encodeURIComponent(endMsg)}`).catch(() => {})
    }
  })
}
