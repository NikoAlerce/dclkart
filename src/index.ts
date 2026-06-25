import { engine, Transform, GltfContainer, ColliderLayer, Raycast, RaycastResult, RaycastQueryType, MeshRenderer, Material, VideoPlayer, VideoEvent, Entity, pointerEventsSystem, InputAction } from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { movePlayerTo, triggerEmote } from '~system/RestrictedActions'
import { kartMovementSystem, turboParticleSystem } from './kartSystem'
import { scanAndConvertKarts, spawnedModelEntities } from './kart'
import { setupUi } from './ui'
import { RaceState } from './raceState'
import { setupWindParticles } from './windParticles'
import { setupAtmosphere } from './atmosphere'
import { setupMonster } from './monster'
import { SPAWN_POSITION, SPAWN_CAMERA_TARGET, WORLD_Y_OFFSET } from './spawnConfig'
import { ScreenState } from './screenState'
import { setupStreaming, isStreamActive, LIVEKIT_SRC } from './streaming'
import { Playlist } from './playlist'
import { setupPaintball } from './paintball'
import { setupGraffiti } from './graffiti'
import { setupGraffitiPanels } from './graffitiPanels'
import { setupGraffitiMission } from './graffitiMission'
import { setupNet } from './net'


// ── Paintball Spawn Markers (para el editor 3D) ─────────────────────────────
export let paintballSpawn_0: Entity
export let paintballSpawn_1: Entity
export let paintballSpawn_2: Entity
export let paintballSpawn_3: Entity
export let paintballSpawn_4: Entity
export let paintballSpawn_5: Entity
export let paintballSpawn_6: Entity
export let paintballSpawn_7: Entity
export let trackEntity: Entity

export function main() {
  // 0. Networking: elección de host para sincronizar NPCs (monstruo, bots, power-ups)
  setupNet()

  // 1. Track GLB
  trackEntity = engine.addEntity()
  spawnedModelEntities.add(trackEntity)
  GltfContainer.create(trackEntity, {
    src: 'assets/models/track.glb',
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS,
    visibleMeshesCollisionMask:   ColliderLayer.CL_PHYSICS
  })
  Transform.create(trackEntity, {
    position: Vector3.create(-88.00, 10.00, 38.19),
    rotation: Quaternion.create(0.0000, 0.0000, 0.0000, 1.0000),
    scale: Vector3.create(1.000, 1.000, 1.000)
  })
  // El editor 3D edita la Y "a nivel piso" (literal en Vector3.create); el offset
  // global se aplica acá en runtime para no romper el parser/writer del editor.
  Transform.getMutable(trackEntity).position.y += WORLD_Y_OFFSET

  RaceState.trackX = -88
  RaceState.trackY = 10 + WORLD_Y_OFFSET
  RaceState.trackZ = -72

  engine.addSystem(() => {
    if (Transform.has(trackEntity)) {
      const pos = Transform.get(trackEntity).position
      RaceState.trackX = pos.x
      RaceState.trackY = pos.y
      RaceState.trackZ = pos.z
    }
  })

  // 1.1 Lago (agua): mesh separado de track.glb, cargado SIN colisión (CL_NONE) para que
  // NO se pueda caminar/conducir sobre el agua. Misma Transform que el track → calza exacto
  // donde estaba (mismo X-flip, escala y posición). Conserva el material reflectivo.
  const lakeEntity = engine.addEntity()
  spawnedModelEntities.add(lakeEntity)
  GltfContainer.create(lakeEntity, {
    src: 'assets/models/lake.glb',
    invisibleMeshesCollisionMask: ColliderLayer.CL_NONE,
    visibleMeshesCollisionMask:   ColliderLayer.CL_NONE
  })
  Transform.create(lakeEntity, {
    position: Vector3.create(-88.00, 10.00, 38.19),
    rotation: Quaternion.create(0.0000, 0.0000, 0.0000, 1.0000),
    scale: Vector3.create(1.000, 1.000, 1.000)
  })
  Transform.getMutable(lakeEntity).position.y += WORLD_Y_OFFSET

  // 1.5 Flowerman
  const flowermanEntity = engine.addEntity()
  spawnedModelEntities.add(flowermanEntity)
  GltfContainer.create(flowermanEntity, {
    src: 'assets/models/flowerman.glb',
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS,
    visibleMeshesCollisionMask:   ColliderLayer.CL_PHYSICS
  })
  Transform.create(flowermanEntity, {
    position: Vector3.create(-104.23, 16.44, 73.22),
    rotation: Quaternion.create(-0.0328, -0.1809, 0.0060, 0.9829),
    scale: Vector3.create(1.000, 1.000, 1.000)
  })
  Transform.getMutable(flowermanEntity).position.y += WORLD_Y_OFFSET

  // 1.6 Arboles
  const arbolesEntity = engine.addEntity()
  spawnedModelEntities.add(arbolesEntity)
  GltfContainer.create(arbolesEntity, {
    src: 'assets/models/arboles.glb',
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS,
    visibleMeshesCollisionMask:   ColliderLayer.CL_PHYSICS
  })
  Transform.create(arbolesEntity, {
    position: Vector3.create(-85.71, 10.00, 38.19),
    rotation: Quaternion.create(0.0000, 0.0000, 0.0000, 1.0000),
    scale: Vector3.create(1.000, 1.000, 1.000)
  })
  Transform.getMutable(arbolesEntity).position.y += WORLD_Y_OFFSET

  // 1.6.1 Campo de batalla de paintball ya está incluido dentro de track.glb

  // 1.6.2 Couch 1
  const couch1 = engine.addEntity()
  spawnedModelEntities.add(couch1)
  GltfContainer.create(couch1, {
    src: 'assets/models/couch1.glb',
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS,
    visibleMeshesCollisionMask:   ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER
  })
  Transform.create(couch1, {
    position: Vector3.create(-212.22, 15.91, 113.59),
    rotation: Quaternion.create(0.0000, -0.5869, 0.0000, 0.8096),
    scale: Vector3.create(6.308, 6.308, 6.308)
  })
  Transform.getMutable(couch1).position.y += WORLD_Y_OFFSET
  
  pointerEventsSystem.onPointerDown(
    {
      entity: couch1,
      opts: { button: InputAction.IA_POINTER, hoverText: 'Sentarse' }
    },
    function () {
      const pos = Transform.get(couch1).position
      movePlayerTo({
        newRelativePosition: Vector3.create(pos.x, pos.y + 0.5, pos.z)
      }).then(() => {
        // Esperamos 500ms para asegurar que el movimiento haya finalizado y no cancele el emote
        let timer = 0
        const emoteSystem = (dt: number) => {
          timer += dt
          if (timer >= 0.5) {
            triggerEmote({ predefinedEmote: 'sit' }).catch(() => {})
            engine.removeSystem(emoteSystem)
          }
        }
        engine.addSystem(emoteSystem)
      }).catch(() => {})
    }
  )

  // 1.6.3 Couch 2
  const couch2 = engine.addEntity()
  spawnedModelEntities.add(couch2)
  GltfContainer.create(couch2, {
    src: 'assets/models/couch2.glb',
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS,
    visibleMeshesCollisionMask:   ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER
  })
  Transform.create(couch2, {
    position: Vector3.create(-220.04, 17.13, 101.73),
    rotation: Quaternion.create(0.0000, -0.4530, 0.0000, 0.8915),
    scale: Vector3.create(3.946, 3.946, 3.946)
  })
  Transform.getMutable(couch2).position.y += WORLD_Y_OFFSET
  
  pointerEventsSystem.onPointerDown(
    {
      entity: couch2,
      opts: { button: InputAction.IA_POINTER, hoverText: 'Sentarse' }
    },
    function () {
      const pos = Transform.get(couch2).position
      movePlayerTo({
        newRelativePosition: Vector3.create(pos.x, pos.y + 0.5, pos.z)
      }).then(() => {
        let timer = 0
        const emoteSystem = (dt: number) => {
          timer += dt
          if (timer >= 0.5) {
            triggerEmote({ predefinedEmote: 'sit' }).catch(() => {})
            engine.removeSystem(emoteSystem)
          }
        }
        engine.addSystem(emoteSystem)
      }).catch(() => {})
    }
  )

  // (de_dust2_2020 viejo deshabilitado — descomentar para volver al anterior)
  // const deDust2Entity = engine.addEntity()
  // GltfContainer.create(deDust2Entity, { src: 'assets/models/de_dust2_2020.glb',
  //   invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS, visibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS })
  // Transform.create(deDust2Entity, { position: Vector3.create(-163.68, 39.77 + WORLD_Y_OFFSET, 352.07),
  //   rotation: Quaternion.create(0.0066, 0, 0, 1), scale: Vector3.create(91.188, 91.188, 91.188) })

  // 1.7 Screen (pantalla)
  const screenEntity = engine.addEntity()
  spawnedModelEntities.add(screenEntity)
  GltfContainer.create(screenEntity, {
    src: 'assets/models/screen.glb',
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS,
    visibleMeshesCollisionMask:   ColliderLayer.CL_PHYSICS
  })
  Transform.create(screenEntity, {
    position: Vector3.create(-275.56, 13.68, 140.93),
    rotation: Quaternion.create(0.0000, -0.5451, 0.0000, 0.8384),
    scale: Vector3.create(106.967, 106.968, 106.967)
  })
  Transform.getMutable(screenEntity).position.y += WORLD_Y_OFFSET

  // 1.7.1 Video en loop sobre la cara negra ("pantalla") del screen.
  // Plano HIJO del screen, ubicado sobre la cara negra usando su centro/escala LOCALES
  // del GLB (la escala del padre ×11.7 lo agranda al tamaño real). Material BASIC (unlit)
  // para que el video se vea a brillo pleno como una pantalla, sin depender de la luz.
  const screenVideo = engine.addEntity()
  Transform.create(screenVideo, {
    parent:   screenEntity,
    // Ubicado en el centro del marco de la nueva TV (Z=-0.008 al frente, Y=0.2684 en el centro, rotado 180 para mirar al frente)
    // Reducido a 0.42x0.32 para calzar perfectamente dentro del bisel/marco de la TV sin recortarse.
    position: Vector3.create(0.0, 0.2684, -0.008),
    rotation: Quaternion.fromEulerDegrees(0, 180, 0),
    scale:    Vector3.create(-0.42, 0.32, 1.0)
  })
  MeshRenderer.setPlane(screenVideo)

  // Plano negro "alas": un toque DETRÁS del video (más cerca de Z=0, ej: Z=-0.006).
  const screenBlack = engine.addEntity()
  Transform.create(screenBlack, {
    parent:   screenEntity,
    position: Vector3.create(0.0, 0.2684, -0.006),
    rotation: Quaternion.fromEulerDegrees(0, 180, 0),
    scale:    Vector3.create(0.42, 0.32, 1.0)
  })
  MeshRenderer.setPlane(screenBlack)
  Material.setBasicMaterial(screenBlack, { diffuseColor: Color4.create(0, 0, 0, 1) })

  // ── Playlist de la pantalla. El estado vive en src/playlist.ts (MUTABLE) y lo edita
  // el panel de admin in-world: controles estilo Winamp v2
  //   prev · next · jump · mute · shuffle · save/load playlist. ──
  const FRAME_W = 0.42, FRAME_H = 0.32
  const buildOrder = (): number[] => {
    const a = Playlist.tracks.map((_, i) => i)
    if (Playlist.shuffle) {                       // aleatorio (Fisher-Yates) o secuencial
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const tmp = a[i]; a[i] = a[j]; a[j] = tmp
      }
    }
    return a
  }
  let order    = buildOrder()
  let orderPos = 0

  VideoPlayer.create(screenVideo, {
    src:     Playlist.tracks[order[0]].url,
    playing: true,
    loop:    false
  })
  Material.setBasicMaterial(screenVideo, {
    texture: Material.Texture.Video({ videoPlayerEntity: screenVideo })
  })

  // Redimensiona el plano al aspecto del video para que encaje en el marco SIN estirar.
  const applyAspect = (idx: number) => {
    const a = Playlist.tracks[idx]?.aspect || (FRAME_W / FRAME_H)
    let w = FRAME_W, h = FRAME_W / a
    if (h > FRAME_H) { h = FRAME_H; w = FRAME_H * a }
    ScreenState.sx = -w
    ScreenState.sy = h
    const t = Transform.getMutable(screenVideo)
    t.scale.x = -w
    t.scale.y = h
  }
  applyAspect(order[0])
  Playlist.currentIndex = order[0]

  // Siguiente índice. Con shuffle APAGADO → secuencial relativo al track actual
  // (currentIndex + 1). Con shuffle PRENDIDO → bolsa barajada (re-barajando al agotarse).
  const nextIndex = (): number => {
    if (!Playlist.shuffle) {
      return (Playlist.currentIndex + 1) % Playlist.tracks.length
    }
    orderPos++
    if (orderPos >= order.length) {
      const last = order[order.length - 1]
      order = buildOrder()
      if (Playlist.shuffle && order.length > 1 && order[0] === last) {
        const tmp = order[0]; order[0] = order[1]; order[1] = tmp
      }
      orderPos = 0
    }
    return order[orderPos]
  }

  // ── Historia de reproducción (para el botón "Anterior") ────────────────────
  const history: number[] = []

  // Reproduce idx SIN agregar al historial (uso interno: prev y restart).
  // IMPORTANTE: no llamar antes de que armed/videoClock sean declarados.
  const _playRaw = (idx: number) => {
    const safe = Math.max(0, Math.min(idx, Playlist.tracks.length - 1))
    const vp = VideoPlayer.getMutable(screenVideo)
    vp.src      = Playlist.tracks[safe].url
    vp.playing  = !Playlist.paused
    vp.position = 0      // arrancar desde el inicio: NO heredar el seek del track anterior
    Playlist.currentIndex = safe
    applyAspect(safe)
    armed = false        // declarados más abajo, accedidos vía closure
    videoClock = 0
    pendingSeek = -1     // cancelar cualquier seek pendiente al cambiar de track
    stallClock = 0       // reiniciar el detector de congelamiento para el track nuevo
    lastVideoOff = 0
  }

  // Reproduce idx guardando el track actual en el historial (next/jump).
  const playTrack = (idx: number) => {
    history.push(Playlist.currentIndex)
    if (history.length > 100) history.shift()
    _playRaw(idx)
  }

  const advanceVideo = () => playTrack(nextIndex())

  const goToPrev = () => {
    // Shuffle apagado → anterior secuencial (currentIndex - 1).
    if (!Playlist.shuffle) {
      const n = Playlist.tracks.length
      _playRaw((Playlist.currentIndex - 1 + n) % n)
      return
    }
    // Shuffle prendido → retroceder por el historial real de reproducción.
    if (history.length > 0) {
      _playRaw(history.pop()!)
    } else {
      _playRaw(Playlist.currentIndex)   // sin historial: reinicia el track actual
    }
  }

  // Avance + WATCHDOG. La playlist es dueña de la pantalla; CEDE solo al STREAM nativo
  // (Cast/OBS) y reanuda al terminar. Reacciona a todos los cambios del panel de admin.
  const LOAD_TIMEOUT = 35
  let armed      = false
  let videoClock = 0
  let lastShuffle  = Playlist.shuffle
  let lastLen      = Playlist.tracks.length
  let lastSkip     = Playlist.skipToken
  let lastPrev     = Playlist.prevToken
  let lastLoad     = Playlist.loadToken
  let pendingSeek      = -1   // posición buscada, esperando que el video confirme el salto
  let pendingSeekClock = 0
  // Detector de CONGELAMIENTO: si el video arrancó pero el offset deja de avanzar (se trabó
  // a mitad), saltamos al siguiente. El watchdog viejo solo cubría "nunca arrancó" y "llegó
  // al final" → un freeze en el medio quedaba colgado para siempre.
  const STALL_TIMEOUT  = 7
  let lastVideoOff     = 0
  let stallClock       = 0

  engine.addSystem((dt: number) => {
    // STREAM nativo activo (admin activó Cast/OBS) → la pantalla muestra el vivo. Cedemos.
    if (isStreamActive()) {
      const vp = VideoPlayer.getMutable(screenVideo)
      if (vp.src !== LIVEKIT_SRC) {
        vp.src = LIVEKIT_SRC; vp.playing = true
        ScreenState.sx = -FRAME_W; ScreenState.sy = FRAME_H
        const t = Transform.getMutable(screenVideo); t.scale.x = -FRAME_W; t.scale.y = FRAME_H
      }
      armed = false; videoClock = 0; return
    }
    // Stream terminó (quedó el src de livekit) → reanudar la playlist.
    if (VideoPlayer.getOrNull(screenVideo)?.src === LIVEKIT_SRC) { advanceVideo(); return }

    // Playlist reemplazada por completo (LOAD JSON) → reconstruir orden y saltar al inicio.
    if (Playlist.loadToken !== lastLoad) {
      lastLoad = Playlist.loadToken
      lastLen  = Playlist.tracks.length
      order = buildOrder(); orderPos = 0
      playTrack(0)
      return
    }

    // Cambios del panel de admin: aleatorio toggled o tracks agregados/eliminados.
    if (Playlist.shuffle !== lastShuffle || Playlist.tracks.length !== lastLen) {
      lastShuffle = Playlist.shuffle; lastLen = Playlist.tracks.length
      order = buildOrder(); orderPos = 0
    }

    // Saltar a track específico (doble-click en la lista).
    if (Playlist.jumpTo >= 0) {
      const idx = Playlist.jumpTo
      Playlist.jumpTo = -1
      lastSkip = Playlist.skipToken   // evitar doble avance
      playTrack(idx)
      return
    }

    // Siguiente (skip) pedido desde el panel.
    if (Playlist.skipToken !== lastSkip) { lastSkip = Playlist.skipToken; advanceVideo(); return }

    // Anterior (prev) pedido desde el panel.
    if (Playlist.prevToken !== lastPrev) { lastPrev = Playlist.prevToken; goToPrev(); return }

    // Pausa / play desde el panel.
    const svp = VideoPlayer.getMutable(screenVideo)
    if (Playlist.paused) { if (svp.playing) svp.playing = false; videoClock = 0; return }
    if (!svp.playing) svp.playing = true

    // Volumen / mute desde el panel.
    const targetVol = Playlist.muted ? 0 : Playlist.volume
    if (svp.volume !== targetVol) svp.volume = targetVol

    // Buscar (seek) a una posición específica desde el panel.
    if (Playlist.seekTo >= 0) {
      const targetSec = Playlist.seekTo
      Playlist.seekTo = -1
      svp.position = targetSec
      pendingSeek = targetSec; pendingSeekClock = 0
    }

    // Watchdog normal.
    videoClock += dt
    let len = 0, off = 0
    if (VideoEvent.has(screenVideo)) {
      const evs = Array.from(VideoEvent.get(screenVideo))
      const ev = evs[evs.length - 1]
      if (ev) { len = ev.videoLength; off = ev.currentOffset }
    }
    // currentTime: tras un seek mostramos el target (optimista) hasta que el video confirme
    // el salto (off se acerca) o pase un timeout — así los clicks rápidos encadenan bien.
    if (pendingSeek >= 0) {
      pendingSeekClock += dt
      if (Math.abs(off - pendingSeek) < 1.5 || pendingSeekClock > 2) {
        pendingSeek = -1
        Playlist.currentTime = off
      } else {
        Playlist.currentTime = pendingSeek
      }
    } else {
      Playlist.currentTime = off
    }
    Playlist.duration = len

    // ── Detector de congelamiento ──────────────────────────────────────────
    // Si está reproduciendo (no pausado, sin seek pendiente) y el offset NO avanza
    // por STALL_TIMEOUT segundos sin haber llegado al final → el video se trabó: saltar.
    if (len > 0 && pendingSeek < 0 && !Playlist.paused && off < len - 0.3) {
      if (off > lastVideoOff + 0.05) {
        lastVideoOff = off
        stallClock = 0
      } else {
        stallClock += dt
        if (stallClock > STALL_TIMEOUT) {
          stallClock = 0
          advanceVideo()   // congelado a mitad → siguiente track
          return
        }
      }
    }

    if (len > 0 && off < len * 0.5) armed = true
    if (armed && len > 0 && off >= len - 0.3) {
      advanceVideo()                     // fin normal del video
    } else if (len > 0 && off >= len - 0.3 && videoClock > 2) {
      advanceVideo()                     // arrancó pegado al final (glitch) → no esperar 35s
    } else if (!armed && videoClock > LOAD_TIMEOUT) {
      advanceVideo()                     // nunca arrancó → saltar al siguiente
    }
  })

  // 1.8 Ground probe: un raycast continuo en la zona de spawn para teletransportar al jugador.
  // Los KARTS ya NO se snapean a una altura global: cada uno respeta su spawnPos.y del editor
  // (WYSIWYG — donde lo ubicás en el editor sentado sobre el piso, ahí queda en Bevy). Esto
  // permite tener karts en zonas de distinta altura de terreno sin que se hundan ni floten.
  let actualGroundY: number | null = null  // zona spawn → para teletransportar al jugador

  function makeGroundProbe(x: number, z: number) {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(x, 40 + WORLD_Y_OFFSET, z) })
    Raycast.createOrReplace(e, {
      direction:     { $case: 'globalDirection', globalDirection: Vector3.create(0, -1, 0) },
      maxDistance:   80,
      queryType:     RaycastQueryType.RQT_QUERY_ALL,
      continuous:    true,
      collisionMask: ColliderLayer.CL_PHYSICS
    })
    return e
  }

  // Punto de aparición con DISPERSIÓN: en vez de mandar a todos al mismo punto exacto
  // (donde se encimaban jugadores/autos y glitcheaba), esparce ±SPAWN_SCATTER en XZ.
  // La Y sale del piso calibrado (groundY) para no caer al vacío.
  const SPAWN_SCATTER = 3.5
  function scatteredSpawn(groundY: number | null): Vector3 {
    const jx = SPAWN_POSITION.x + (Math.random() - 0.5) * 2 * SPAWN_SCATTER
    const jz = SPAWN_POSITION.z + (Math.random() - 0.5) * 2 * SPAWN_SCATTER
    const y  = groundY !== null ? groundY + 1.5 : SPAWN_POSITION.y
    return Vector3.create(jx, y, jz)
  }

  const spawnProbeEnt = makeGroundProbe(SPAWN_POSITION.x, SPAWN_POSITION.z)

  function topHit(e: ReturnType<typeof engine.addEntity>): number | null {
    const r = RaycastResult.getOrNull(e)
    if (!r || r.hits.length === 0) return null
    const valid = r.hits
      // Ignorar al jugador y cualquier superficie muy por encima del piso del estacionamiento
      // (ej: la plataforma del lomo del monstruo si justo está pasando por el spawn) → así el
      // spawn nunca te tira arriba del monstruo.
      .filter(h => h.position && h.entityId !== engine.PlayerEntity && h.position!.y < SPAWN_POSITION.y + 6)
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
          newRelativePosition: scatteredSpawn(actualGroundY),
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
      movePlayerTo({
        newRelativePosition: scatteredSpawn(actualGroundY),
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
    if (RaceState.justExitedKartTimer > 0) return // espera a que termine el teleport de salida del kart
    if (!Transform.has(engine.PlayerEntity)) return
    const playerTransform = Transform.get(engine.PlayerEntity)
    if (playerTransform.position.y < 2.0 + WORLD_Y_OFFSET) {
      const now = Date.now()
      if (now - lastTeleportTime > 3000) {
        lastTeleportTime = now
        movePlayerTo({
          newRelativePosition: scatteredSpawn(actualGroundY),
          cameraTarget: SPAWN_CAMERA_TARGET
        }).catch(() => {})
      }
    }
  })

  // 4. UI
  setupUi()

  // 4.5 Streaming nativo (Admin Tools por código): panel admin in-world para DCL Cast/OBS.
  // La playlist cede al stream cuando hay uno activo. Solo funciona en el World deployado.
  setupStreaming()

  // 5. Atmósfera: partículas de viento, niebla de suelo, luciérnagas
  setupWindParticles()
  setupAtmosphere()

  // 6. Monstruo gigante que deambula por el escenario.
  // Le pasamos arbolesEntity para que sus sensores IGNOREN los árboles (los atraviesa),
  // mientras el avatar sí colisiona con ellos (arboles.glb tiene CL_PHYSICS).
  setupMonster(arbolesEntity, screenVideo)

  // 8. Marcadores de spawn de Paintball para colocar en el editor 3D
  paintballSpawn_0 = engine.addEntity()
  GltfContainer.create(paintballSpawn_0, { src: 'assets/models/paintballspawn0.glb' })
  Transform.create(paintballSpawn_0, {
    position: Vector3.create(-149.87, 56.72, 383.97),
    scale: Vector3.create(0.500, 0.500, 0.500),
    rotation: Quaternion.create(0.0000, 0.0000, 0.0000, 1.0000)
  })

  paintballSpawn_1 = engine.addEntity()
  GltfContainer.create(paintballSpawn_1, { src: 'assets/models/paintballspawn1.glb' })
  Transform.create(paintballSpawn_1, {
    position: Vector3.create(-4.89, 65.87, 496.49),
    scale: Vector3.create(0.500, 0.500, 0.500),
    rotation: Quaternion.create(0.0000, 0.0000, 0.0000, 1.0000)
  })

  paintballSpawn_2 = engine.addEntity()
  GltfContainer.create(paintballSpawn_2, { src: 'assets/models/paintballspawn2.glb' })
  Transform.create(paintballSpawn_2, {
    position: Vector3.create(-64.59, 74.42, 350.40),
    scale: Vector3.create(0.500, 0.500, 0.500),
    rotation: Quaternion.create(0.0000, 0.0000, 0.0000, 1.0000)
  })

  paintballSpawn_3 = engine.addEntity()
  GltfContainer.create(paintballSpawn_3, { src: 'assets/models/paintballspawn3.glb' })
  Transform.create(paintballSpawn_3, {
    position: Vector3.create(25.00, 74.42, 360.00),
    scale: Vector3.create(0.50, 0.50, 0.50),
    rotation: Quaternion.create(0.0000, 0.0000, 0.0000, 1.0000)
  })

  paintballSpawn_4 = engine.addEntity()
  GltfContainer.create(paintballSpawn_4, { src: 'assets/models/paintballspawn4.glb' })
  Transform.create(paintballSpawn_4, {
    position: Vector3.create(-15.00, 68.45, 364.10),
    scale: Vector3.create(0.500, 0.500, 0.500),
    rotation: Quaternion.create(0.0000, 0.0000, 0.0000, 1.0000)
  })

  paintballSpawn_5 = engine.addEntity()
  GltfContainer.create(paintballSpawn_5, { src: 'assets/models/paintballspawn5.glb' })
  Transform.create(paintballSpawn_5, {
    position: Vector3.create(-87.08, 63.78, 455.24),
    scale: Vector3.create(0.500, 0.500, 0.500),
    rotation: Quaternion.create(0.0000, 0.0000, 0.0000, 1.0000)
  })

  paintballSpawn_6 = engine.addEntity()
  GltfContainer.create(paintballSpawn_6, { src: 'assets/models/paintballspawn6.glb' })
  Transform.create(paintballSpawn_6, {
    position: Vector3.create(-136.38, 84.91, 486.66),
    scale: Vector3.create(0.500, 0.500, 0.500),
    rotation: Quaternion.create(0.0000, 0.0000, 0.0000, 1.0000)
  })

  paintballSpawn_7 = engine.addEntity()
  GltfContainer.create(paintballSpawn_7, { src: 'assets/models/paintballspawn7.glb' })
  Transform.create(paintballSpawn_7, {
    position: Vector3.create(-16.35, 74.42, 395.87),
    scale: Vector3.create(0.500, 0.500, 0.500),
    rotation: Quaternion.create(0.0000, 0.0000, 0.0000, 1.0000)
  })

  // Aplicar el offset vertical global a todos los marcadores en runtime (el editor los lee y guarda sin offset)
  Transform.getMutable(paintballSpawn_0).position.y += WORLD_Y_OFFSET
  Transform.getMutable(paintballSpawn_1).position.y += WORLD_Y_OFFSET
  Transform.getMutable(paintballSpawn_2).position.y += WORLD_Y_OFFSET
  Transform.getMutable(paintballSpawn_3).position.y += WORLD_Y_OFFSET
  Transform.getMutable(paintballSpawn_4).position.y += WORLD_Y_OFFSET
  Transform.getMutable(paintballSpawn_5).position.y += WORLD_Y_OFFSET
  Transform.getMutable(paintballSpawn_6).position.y += WORLD_Y_OFFSET
  Transform.getMutable(paintballSpawn_7).position.y += WORLD_Y_OFFSET

  // 8. Mini-juego: Paintball — NPC Referee cerca del spawn que invita a jugar.
  setupPaintball()

  // 8.5 Graffiti / Aerosol: pintar en cualquier superficie, sincronizado (v1 en-sesión, FIFO).
  setupGraffitiPanels() // paredes pintables persistentes (backend PNG) — antes de setupGraffiti
  setupGraffiti()
  // 8.6 Side-game "Tag the City": NPC cerca del spawn → misión de taguear spots en el dust.
  setupGraffitiMission()

  // 7. Montado en el lomo: el avatar deja de colisionar con los árboles Y con el track
  // (que incluye los EDIFICIOS de la arena). El monstruo los atraviesa; así el rider también
  // y NO se cae al chocar una pared mientras lo lleva. Al bajar (ridingMonster=false) vuelven.
  // Es por-cliente: solo afecta al que está montando. En multiplayer el host conserva su
  // track sólido → el monstruo sigue copiando el terreno para todos.
  // (Trade-off solo/host: mientras montás, el sensor de piso del monstruo no lee el track y
  //  mantiene su última altura. Para que además trepe la arena MIENTRAS lo montás haría falta
  //  separar en Blender los edificios en su propio GLB/collision-layer.)
  let lastRiding = false
  engine.addSystem(() => {
    const riding = RaceState.ridingMonster
    if (riding === lastRiding) return
    lastRiding = riding
    const mask = riding ? ColliderLayer.CL_NONE : ColliderLayer.CL_PHYSICS
    for (const ent of [arbolesEntity, trackEntity]) {
      const g = GltfContainer.getMutableOrNull(ent)
      if (!g) continue
      g.visibleMeshesCollisionMask   = mask
      g.invisibleMeshesCollisionMask = mask
    }
  })
}
