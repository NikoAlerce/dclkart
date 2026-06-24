// ─── Paintball mini-game — Módulo principal ───────────────────────────────────
// Fase 1: NPC Referee que invita a jugar.
// Fase 2: Sistema de disparo (raycast), vida (3 hits), respawn, HUD, timer.
// Fase 3 (TODO): sync multiplayer via syncEntity.

import {
  engine, Entity, Transform, AvatarShape, pointerEventsSystem, InputAction,
  inputSystem, PointerEventType, Raycast, RaycastResult,
  RaycastQueryType, ColliderLayer, MeshRenderer, Material,
  MeshCollider, PlayerIdentityData, CameraModeArea, CameraType, GltfContainer
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { WORLD_Y_OFFSET } from './spawnConfig'
import { PaintballState, PB_ZONE } from './paintballState'
import { setupBots, spawnBots, getClosestBot, getBotIndex, creditKill, BotState } from './paintballBots'
import { setupLasers, spawnLaser } from './paintballLasers'
import { setupPaintballFX, spawnMuzzleFlash } from './paintballFX'
import { setupWeaponSystem, createWeapon, removeWeapon, playWeaponRecoil } from './paintballWeapon'
import { setupPowerups, clearPowerups } from './paintballPowerups'
import { PLAYER_PAINT, MONSTER_PAINT } from './paintballColors'
import { pbBus, PB_MSG, PlayerHitMsg, PlayerShotMsg, PlayerKilledMsg, ScoreMsg, PresenceMsg } from './paintballNet'
import { ScoreEntry } from './paintballState'
import { getMyId } from './net'
import { getPlayer } from '@dcl/sdk/players'
import { ARENA_NPC, TEAM_SPAWN_T, TEAM_SPAWN_CT, FFA_SPAWNS, TEAM_COLOR_T, TEAM_COLOR_CT, ARENA_CENTER, ArenaCalibration, applyArenaCalibration, setupSpawnCalibration, ARENA_FLOOR_Y } from './paintballArena'
import { setupMatch, requestStartMatch } from './paintballMatch'
import { setupAudio, playPlayerShoot, playShootAt } from './paintballAudio'
import { setupSigns } from './paintballSigns'
import { setupNav, startNavSampling } from './paintballNav'
import {
  paintballSpawn_0, paintballSpawn_1, paintballSpawn_2, paintballSpawn_3,
  paintballSpawn_4, paintballSpawn_5, paintballSpawn_6, paintballSpawn_7
} from './index'

// ─────────────────────────────────────────────────────────────────────────────
// ESTADO GLOBAL — leído por ui.tsx
// State and Zone moved to paintballState.ts

// Máximo de kills para ganar la ronda
const KILLS_TO_WIN    = 15
// Distancia máxima de disparo
const SHOOT_RANGE     = 80
// Radio de impacto en otro jugador (hit box simplificado)
const HIT_RADIUS      = 2.2
// Altura del centro de masa sobre los pies (apuntar acá, no a los pies)
const AIM_HEIGHT      = 1.1
// Segundos de respawn
const RESPAWN_SECONDS = 4
// Vida del jugador (corazones). 5 = más margen (antes 3 = morías al toque).
const PLAYER_MAX_HP   = 5
// Invulnerabilidad post-respawn (segundos)
const INVUL_SECONDS   = 5.0

// ─────────────────────────────────────────────────────────────────────────────
// NPC REFEREE — ahora al lado de la entrada del mapa de Counter (paintballArena.ts)
// ─────────────────────────────────────────────────────────────────────────────
const NPC_POS = ARENA_NPC

// ─────────────────────────────────────────────────────────────────────────────
// ESTADO INTERNO DEL SISTEMA
// ─────────────────────────────────────────────────────────────────────────────
let timerAccum    = 0
let respawnAccum  = 0
let invulAccum    = 0
let invulActive   = false
let flashAccum    = 0
let hitFlashAccum = 0
let shootCooldown = 0

// Scoreboard compartido: tabla de scores difundidos por cada jugador (con TTL).
const scoreMap = new Map<string, { name: string; score: number; kills: number; team: number; t: number }>()
let scoreBroadcastAccum = 0

// Color de pintura del jugador local (verde en FFA, color de equipo en T vs CT).
let myPaint = PLAYER_PAINT.emissive

// Presencia en la arena: quién está jugando ahora mismo (TTL corto).
const presenceMap = new Map<string, number>() // userId → ttl segundos
let presenceBroadcastAccum = 0

// Entidad raycaster (hijo de la cámara del jugador)
let rayEntity: ReturnType<typeof engine.addEntity> | null = null
let lastEyePos = Vector3.Zero()
let lastFwd = Vector3.Zero()
let lastTargetBot: Entity | null = null
let lastTargetDist = 0
let lastTargetBotPos = Vector3.Zero()

// Entidad para forzar cámara en 1ra persona
let cameraAreaEntity: ReturnType<typeof engine.addEntity> | null = null

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function teleportTo(pos: { x: number; y: number; z: number }) {
  void movePlayerTo({
    newRelativePosition: Vector3.create(pos.x, pos.y, pos.z),
    cameraTarget:        Vector3.create(pos.x, pos.y, pos.z + 5),
  })
}

function getMySpawn() {
  let base
  if (PaintballState.myTeam === 1) base = TEAM_SPAWN_T
  else if (PaintballState.myTeam === 2) base = TEAM_SPAWN_CT
  else base = FFA_SPAWNS[Math.floor(Math.random() * FFA_SPAWNS.length)]

  // Si aún no se calibró el piso, spawneamos MUY arriba para que el avatar caiga
  // con gravedad hasta el primer collider (mejor que aparecer hundido en geometría).
  const yBuffer = ArenaCalibration.ready ? 1.0 : 30.0
  return { x: base.x, y: base.y + yBuffer, z: base.z }
}

function resetRound() {
  PaintballState.health    = PLAYER_MAX_HP
  PaintballState.kills     = 0
  PaintballState.timeLeft  = 300
  PaintballState.respawning = false
  PaintballState.respawnCD  = 0
  PaintballState.shotFlash  = false
  PaintballState.hitFlash   = false
  PaintballState.gameOver   = false
  PaintballState.gameMsg    = ''
  PaintballState.isShooting = false
  PaintballState.lobbyOpen  = false
  PaintballState.waitingForPlayers = false
  PaintballState.isSolo     = false
  PaintballState.announcerBig = false
  PaintballState.score      = 0
  PaintballState.combo      = 0
  PaintballState.comboTimer = 0
  PaintballState.bestCombo  = 0
  PaintballState.killFeed.length = 0
  PaintballState.scoreboard      = []
  PaintballState.myTeam          = 0
  scoreMap.clear()
  PaintballState.rapidFireTimer  = 0
  PaintballState.tripleShotTimer = 0
  PaintballState.shieldTimer     = 0
  timerAccum = 0; respawnAccum = 0; invulAccum = 0
  invulActive = false; shootCooldown = 0
  // Los bots son persistentes/compartidos: NO se limpian al reiniciar una ronda local.
  clearPowerups()
  
  if (cameraAreaEntity) {
    engine.removeEntity(cameraAreaEntity)
    cameraAreaEntity = null
  }
}

// El jugador quiere CONTROL LIBRE de cámara (alternar 3ra/1ra persona con la rueda
// o la tecla V). Por eso NO forzamos primera persona: solo limpiamos cualquier área
// de cámara que hubiera quedado. Dejar el CameraModeArea forzaría 1ra persona y le
// sacaría el control que le gusta (ser "custodio" de su personaje en 3ra persona).
function refreshCameraArea() {
  if (cameraAreaEntity) {
    engine.removeEntity(cameraAreaEntity)
    cameraAreaEntity = null
  }
}

function doRespawn() {
  PaintballState.health     = PLAYER_MAX_HP
  PaintballState.respawning = false
  PaintballState.respawnCD  = 0
  respawnAccum = 0
  invulActive  = true
  invulAccum   = 0
  teleportTo(getMySpawn())
  refreshCameraArea()
}

// Resuelve un impacto local sobre una entidad: si es un bot, avisa al host
// (botDamage); si es un jugador real, le avisa a esa víctima (playerHit PvP).
function hitTarget(entity: Entity) {
  const idx = getBotIndex(entity)
  if (idx >= 0) {
    pbBus.emit(PB_MSG.botDamage, { bot: idx, by: getMyId() })
  } else {
    const id = PlayerIdentityData.getOrNull(entity)
    const isBot = BotState.has(entity)
    if (id && id.address) {
      // Friendly fire OFF: en modo equipos no le pegás a un compañero.
      if (PaintballState.matchMode === 1 && PaintballState.myTeam !== 0) {
        const tt = scoreMap.get(id.address)
        if (tt && tt.team === PaintballState.myTeam) return
      }
      pbBus.emit(PB_MSG.playerHit, {
        target: id.address,
        by: getMyId(),
        r: myPaint.r,
        g: myPaint.g,
        b: myPaint.b
      })
    }
  }
}

// Triple Shot (power-up): cono más ancho, impacta hasta 3 bots de un disparo
function fireTripleShot(eyePos: Vector3, fwd: Vector3) {
  const WIDE_DOT = 0.9
  const WIDE_RADIUS = 3.0
  const candidates: { entity: Entity; pos: Vector3; dot: number }[] = []

  const checkEntity = (entity: Entity, otherTransform: any) => {
    if (otherTransform.scale && otherTransform.scale.x < 0.1) return
    // Apuntar al centro de masa (como el disparo simple)
    const cx = otherTransform.position.x
    const cy = otherTransform.position.y + AIM_HEIGHT
    const cz = otherTransform.position.z
    const dx = cx - eyePos.x
    const dy = cy - eyePos.y
    const dz = cz - eyePos.z
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (dist > SHOOT_RANGE) return
    const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / dist
    if (dot < WIDE_DOT) return
    const perpDist = dist * Math.sqrt(Math.max(0, 1 - dot * dot))
    if (perpDist > WIDE_RADIUS) return
    candidates.push({
      entity,
      pos: Vector3.create(cx, cy, cz),
      dot
    })
  }

  for (const [entity, idData, otherTransform] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
    if (entity === engine.PlayerEntity) continue // no te pegues a vos mismo
    if (idData.address === getMyId()) continue
    checkEntity(entity, otherTransform)
  }
  for (const [entity, , otherTransform] of engine.getEntitiesWith(BotState, Transform)) {
    checkEntity(entity, otherTransform)
  }

  candidates.sort((a, b) => b.dot - a.dot)
  const hits = candidates.slice(0, 3)

  if (hits.length > 0) {
    for (const h of hits) {
      spawnLaser(eyePos, h.pos, myPaint,Vector3.Zero())
      hitTarget(h.entity)
    }
    PaintballState.hitFlash = true
    PaintballState.hitFlashAlpha = 0.6
  } else {
    // Abanico de 3 trazas para feedback visual cuando no impactás a nadie
    const right = Vector3.normalize(Vector3.cross(fwd, Vector3.Up()))
    for (let s = -1; s <= 1; s++) {
      const spread = s * 0.07
      const dir = Vector3.normalize(Vector3.create(fwd.x + right.x * spread, fwd.y, fwd.z + right.z * spread))
      const end = Vector3.create(
        eyePos.x + dir.x * SHOOT_RANGE,
        eyePos.y + dir.y * SHOOT_RANGE,
        eyePos.z + dir.z * SHOOT_RANGE
      )
      spawnLaser(eyePos, end, myPaint,Vector3.Zero())
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SETUP — llamado una vez desde index.ts
// ─────────────────────────────────────────────────────────────────────────────
export function setupPaintball() {
  // Copiar posiciones de los marcadores de spawn puestos en el editor 3D
  if (Transform.has(paintballSpawn_0)) {
    const pos = Transform.get(paintballSpawn_0).position
    ;(TEAM_SPAWN_T as any).x = pos.x
    ;(TEAM_SPAWN_T as any).y = pos.y
    ;(TEAM_SPAWN_T as any).z = pos.z
  }
  if (Transform.has(paintballSpawn_1)) {
    const pos = Transform.get(paintballSpawn_1).position
    ;(TEAM_SPAWN_CT as any).x = pos.x
    ;(TEAM_SPAWN_CT as any).y = pos.y
    ;(TEAM_SPAWN_CT as any).z = pos.z
  }
  const ffaSpawnsList = [
    paintballSpawn_2, paintballSpawn_3, paintballSpawn_4,
    paintballSpawn_5, paintballSpawn_6, paintballSpawn_7
  ]
  for (let i = 0; i < ffaSpawnsList.length; i++) {
    const entity = ffaSpawnsList[i]
    if (Transform.has(entity) && FFA_SPAWNS[i]) {
      const pos = Transform.get(entity).position
      ;(FFA_SPAWNS[i] as any).x = pos.x
      ;(FFA_SPAWNS[i] as any).y = pos.y
      ;(FFA_SPAWNS[i] as any).z = pos.z
    }
  }

  // Establecer la calibración como lista y configurada (evita raycasts fallidos en carga)
  const ys = [
    Transform.has(paintballSpawn_0) ? Transform.get(paintballSpawn_0).position.y : 74.42,
    Transform.has(paintballSpawn_1) ? Transform.get(paintballSpawn_1).position.y : 74.42,
    ...ffaSpawnsList.map(e => Transform.has(e) ? Transform.get(e).position.y : 74.42)
  ]
  ys.sort((a, b) => a - b)
  // Usar el spawn más bajo como referencia del piso mínimo para evitar loops de teletransporte en multinivel
  ArenaCalibration.floorY = ys[0]
  ArenaCalibration.ready = true

  // Ocultar los marcadores en el juego real eliminando sus GltfContainers
  GltfContainer.deleteFrom(paintballSpawn_0)
  GltfContainer.deleteFrom(paintballSpawn_1)
  GltfContainer.deleteFrom(paintballSpawn_2)
  GltfContainer.deleteFrom(paintballSpawn_3)
  GltfContainer.deleteFrom(paintballSpawn_4)
  GltfContainer.deleteFrom(paintballSpawn_5)
  GltfContainer.deleteFrom(paintballSpawn_6)
  GltfContainer.deleteFrom(paintballSpawn_7)

  setupMatch()
  setupAudio()
  setupSigns() // carteles afuera: "DCL PAINTBALL" + récord histórico
  setupSpawnCalibration() // calibra la Y real de cada spawn por raycast (sin esto, bots en el cielo)
  setupNav()
  setupBots()
  setupLasers()
  setupPaintballFX()
  setupWeaponSystem()
  setupPowerups()

  // Iniciar muestreo de navegación solo cuando la calibración de spawns esté lista (evita muestrear el vacío antes de cargar track.glb)
  let navStarted = false
  engine.addSystem(() => {
    if (ArenaCalibration.ready && !navStarted) {
      navStarted = true
      startNavSampling()
    }
  })

  // Bots compartidos: todos los clientes los crean (mismo enumId); el host los simula.
  spawnBots()

  // PvP: si me llega un "te pegué" dirigido a mí, aplico mi propio daño (anti-cheat por honor).
  // Si ese golpe me mata, le aviso al atacante para que se acredite el kill.
  pbBus.on(PB_MSG.playerHit, (m: PlayerHitMsg) => {
    if (m.target !== getMyId()) return
    const wasDown = PaintballState.respawning
    receivePaintballHit(Color4.create(m.r, m.g, m.b, 1))
    if (!wasDown && PaintballState.respawning && m.by) {
      const myName = getPlayer()?.name || 'Player'
      pbBus.emit(PB_MSG.playerKilled, { by: m.by, name: myName })
    }
  })

  // PvP: dibujar disparo de otro jugador
  pbBus.on(PB_MSG.playerShot, (m: PlayerShotMsg) => {
    if (m.id === getMyId()) return
    const color = Color4.create(m.r, m.g, m.b, 1)
    const normalVec = Vector3.create(m.normal.x, m.normal.y, m.normal.z)
    
    // Reproducir sonido en el origen
    playShootAt(Vector3.create(m.from.x, m.from.y, m.from.z))
    
    // Dibujar el trazo láser y decal al final
    spawnLaser(
      Vector3.create(m.from.x, m.from.y, m.from.z),
      Vector3.create(m.to.x, m.to.y, m.to.z),
      color,
      normalVec
    )
  })

  // PvP: maté a un jugador → crédito personal + punto de equipo (modo equipos activo).
  pbBus.on(PB_MSG.playerKilled, (m: PlayerKilledMsg) => {
    if (m.by !== getMyId()) return
    creditKill(m.name, myPaint)
    if (PaintballState.matchPhase === 2 && PaintballState.matchMode === 1 && PaintballState.myTeam !== 0) {
      pbBus.emit(PB_MSG.teamScore, { team: PaintballState.myTeam })
    }
  })

  // Scoreboard compartido: recibir el score difundido por otro jugador.
  pbBus.on(PB_MSG.score, (m: ScoreMsg) => {
    if (!m.id) return
    scoreMap.set(m.id, { name: m.name, score: m.score, kills: m.kills, team: m.team, t: 6.0 })
  })

  // Presencia en arena: ping ambiental para el lobby (incluso fuera de partida).
  pbBus.on(PB_MSG.presence, (m: PresenceMsg) => {
    if (!m.id) return
    if (m.inArena) presenceMap.set(m.id, 6.0)
    else presenceMap.delete(m.id)
  })

  // Sistema de presencia + tabla. Corre SIEMPRE (no solo en partida) para que el
  // lobby muestre cuántos hay peleando antes de entrar.
  engine.addSystem((dt: number) => {
    // Difundir mi presencia cada 2.5s
    presenceBroadcastAccum += dt
    if (presenceBroadcastAccum >= 2.5) {
      presenceBroadcastAccum = 0
      const myId = getMyId()
      if (myId) pbBus.emit(PB_MSG.presence, { id: myId, inArena: PaintballState.inGame && !PaintballState.gameOver })
    }
    // Decay presencia
    for (const [id, t] of presenceMap) {
      const left = t - dt
      if (left <= 0) presenceMap.delete(id)
      else presenceMap.set(id, left)
    }
    PaintballState.playersInArena = presenceMap.size

    // Decay scores + refrescar tabla
    for (const [id, e] of scoreMap) {
      e.t -= dt
      if (e.t <= 0) scoreMap.delete(id)
    }
    const board: ScoreEntry[] = []
    for (const [id, e] of scoreMap) board.push({ id, name: e.name, score: e.score, kills: e.kills })
    board.sort((a, b) => b.score - a.score)
    PaintballState.scoreboard = board.slice(0, 6)
  })

  // ── NPC Referee ───────────────────────────────────────────────────────────
  const npc = engine.addEntity()
  AvatarShape.create(npc, {
    id:        'paintball-referee-niko',
    name:      'Referee Alex',
    bodyShape: 'urn:decentraland:off-chain:base-avatars:BaseFemale',
    skinColor: Color3.fromInts(247, 200, 160),
    hairColor: Color3.fromInts(44,  21,   3),
    eyeColor:  Color3.fromInts(58, 138, 181),
    wearables: [
      'urn:decentraland:off-chain:base-avatars:f_simple_yellow_tshirt',
      'urn:decentraland:off-chain:base-avatars:f_jeans',
      'urn:decentraland:off-chain:base-avatars:bun_shoes',
    ],
    emotes: [],
    talking: false,
  })
  Transform.create(npc, {
    position: NPC_POS,
    rotation: Quaternion.fromEulerDegrees(0, 180, 0),
    scale:    Vector3.One(),
  })
  
  // Agregar collider para que el raycast del pointer down pueda impactarlo
  MeshCollider.setCylinder(npc, ColliderLayer.CL_POINTER)

  pointerEventsSystem.onPointerDown(
    { entity: npc, opts: { button: InputAction.IA_POINTER, hoverText: '🎯  Talk to Referee', maxDistance: 12 } },
    () => { 
      if (!PaintballState.inGame && !PaintballState.lobbyOpen) {
        PaintballState.inviteOpen = !PaintballState.inviteOpen 
      }
    }
  )

  // ── Probe vertical para calibrar el piso real del arena ──────────────────
  // Dispara un raycast desde Y=300 hacia abajo en el centro del arena. El primer
  // hit válido (track.glb) define ArenaCalibration.floorY → todos los spawns y el
  // NPC se reubican a la altura correcta sin tener que adivinar coords.
  const calibProbe = engine.addEntity()
  Transform.create(calibProbe, { position: Vector3.create(ARENA_CENTER.x, 300, ARENA_CENTER.z) })
  Raycast.createOrReplace(calibProbe, {
    direction: { $case: 'globalDirection', globalDirection: Vector3.create(0, -1, 0) },
    maxDistance: 600,
    queryType: RaycastQueryType.RQT_QUERY_ALL,
    continuous: true,
    collisionMask: ColliderLayer.CL_PHYSICS
  })
  let elapsedGlobal = 0
  engine.addSystem((dt: number) => {
    if (ArenaCalibration.ready) return
    if (!RaycastResult.has(calibProbe)) return
    elapsedGlobal += dt
    const forceFallback = elapsedGlobal > 8.0

    const r = RaycastResult.get(calibProbe)
    if (r.hits.length === 0) return

    // Tomar el hit MÁS CERCANO al fallback (no el más alto, que puede ser un
    // techo en un mapa multinivel). Filtrar el avatar y priorizar track.glb.
    let bestY: number | null = null
    let bestDist = Infinity
    for (const h of r.hits) {
      if (!h.position) continue
      if (h.entityId !== undefined) {
        if ((h.entityId as Entity) === engine.PlayerEntity) continue
        
        if (!forceFallback) {
          const gltf = GltfContainer.getOrNull(h.entityId as Entity)
          if (!gltf || !gltf.src || !gltf.src.includes('track.glb')) {
            continue
          }
        }
        if (h.position.y < 70.0) continue // Ignorar pistas o colisiones debajo de la arena
        
        const dist = Math.abs(h.position.y - ARENA_FLOOR_Y)
        if (dist < bestDist) {
          bestDist = dist
          bestY = h.position.y
        }
      }
    }
    if (bestY === null && !forceFallback) return

    const finalY = bestY !== null ? bestY : ARENA_FLOOR_Y
    applyArenaCalibration(finalY)
    
    // Limpiar el probe
    Raycast.deleteFrom(calibProbe)
    RaycastResult.deleteFrom(calibProbe)
    engine.removeEntity(calibProbe)
  })

  // ── Entidad raycaster (usada para detectar disparos) ─────────────────────
  rayEntity = engine.addEntity()
  Transform.create(rayEntity, { position: Vector3.Zero(), scale: Vector3.Zero() })

  // ── Marcadores visuales de spawn (esferas semitransparentes) ─────────────
  for (const [key, pos] of Object.entries({ A: PB_ZONE.spawnA, B: PB_ZONE.spawnB })) {
    const marker = engine.addEntity()
    Transform.create(marker, { position: Vector3.create(pos.x, pos.y + 2, pos.z), scale: Vector3.create(0.5, 2.0, 0.5) })
    MeshRenderer.setCylinder(marker)
    Material.setPbrMaterial(marker, {
      albedoColor:      key === 'A' ? Color4.create(0.1, 0.4, 1.0, 0.7) : Color4.create(1.0, 0.2, 0.1, 0.7),
      emissiveColor:    key === 'A' ? Color3.create(0.1, 0.4, 1.0)      : Color3.create(1.0, 0.2, 0.1),
      emissiveIntensity: 2.0,
    })
    // Colisionador CL_CUSTOM3 para no interferir con el gameplay
    MeshCollider.setBox(marker, ColliderLayer.CL_CUSTOM3)
  }

  // ── Sistema principal del juego ───────────────────────────────────────────
  engine.addSystem((dt: number) => {
    if (!PaintballState.inGame) return

    // ── Leer resultado de raycast de entorno de disparo (1 frame posterior) ──
    if (rayEntity !== null && RaycastResult.has(rayEntity)) {
      const result = RaycastResult.get(rayEntity)
      let hitPos = Vector3.create(
        lastEyePos.x + lastFwd.x * SHOOT_RANGE,
        lastEyePos.y + lastFwd.y * SHOOT_RANGE,
        lastEyePos.z + lastFwd.z * SHOOT_RANGE
      )
      let normal = Vector3.Zero()
      let hasHit = false
      
      if (result.hits.length > 0 && result.hits[0].position) {
        hitPos = result.hits[0].position
        if (result.hits[0].normalHit) {
          normal = Vector3.clone(result.hits[0].normalHit)
        } else {
          normal = Vector3.create(0, 1, 0)
        }
        hasHit = true
      }

      // Verificar si teníamos un bot en la mira (Cover System)
      if (lastTargetBot !== null) {
        let isBlocked = false
        if (hasHit) {
          const hitDist = result.hits[0].length
          // Margen amplio: solo "bloqueado" si hay una pared CLARAMENTE más cerca
          // que el bot (evita falsos positivos con el piso cercano al objetivo).
          if (hitDist < lastTargetDist - 2.0) {
            isBlocked = true
          }
        }
        
        if (isBlocked) {
          // Bloqueado por cobertura: la pintura choca con la pared/objeto
          spawnLaser(lastEyePos, hitPos, myPaint,normal)
          pbBus.emit(PB_MSG.playerShot, {
            id: getMyId(),
            from: { x: lastEyePos.x, y: lastEyePos.y, z: lastEyePos.z },
            to: { x: hitPos.x, y: hitPos.y, z: hitPos.z },
            normal: { x: normal.x, y: normal.y, z: normal.z },
            r: myPaint.r,
            g: myPaint.g,
            b: myPaint.b
          })
        } else {
          // Tiro limpio! Impacto en el bot
          PaintballState.hitFlash = true
          PaintballState.hitFlashAlpha = 0.6

          spawnLaser(lastEyePos, lastTargetBotPos, myPaint,Vector3.Zero())
          hitTarget(lastTargetBot)
          pbBus.emit(PB_MSG.playerShot, {
            id: getMyId(),
            from: { x: lastEyePos.x, y: lastEyePos.y, z: lastEyePos.z },
            to: { x: lastTargetBotPos.x, y: lastTargetBotPos.y, z: lastTargetBotPos.z },
            normal: { x: 0, y: 0, z: 0 },
            r: myPaint.r,
            g: myPaint.g,
            b: myPaint.b
          })
        }
      } else {
        // Disparo normal al entorno (no había ningún bot en el cono)
        spawnLaser(lastEyePos, hitPos, myPaint,normal)
        pbBus.emit(PB_MSG.playerShot, {
          id: getMyId(),
          from: { x: lastEyePos.x, y: lastEyePos.y, z: lastEyePos.z },
          to: { x: hitPos.x, y: hitPos.y, z: hitPos.z },
          normal: { x: normal.x, y: normal.y, z: normal.z },
          r: myPaint.r,
          g: myPaint.g,
          b: myPaint.b
        })
      }

      // Resetear
      lastTargetBot = null
      Raycast.deleteFrom(rayEntity)
      RaycastResult.deleteFrom(rayEntity)
    }

    // ── Game over → no procesar nada más ──────────────────────────────────
    if (PaintballState.gameOver) return

    // ── Timer de ronda ────────────────────────────────────────────────────
    timerAccum += dt
    if (timerAccum >= 1) {
      timerAccum -= 1
      PaintballState.timeLeft = Math.max(0, PaintballState.timeLeft - 1)
      if (PaintballState.timeLeft === 0) {
        PaintballState.gameOver = true
        PaintballState.gameMsg  = `⏱  Time's up — ${PaintballState.kills} kills`
        return
      }
    }

    // ── Combo: decae si pasás demasiado tiempo sin eliminar ───────────────
    if (PaintballState.comboTimer > 0) {
      PaintballState.comboTimer -= dt
      if (PaintballState.comboTimer <= 0) {
        PaintballState.combo = 0
        PaintballState.comboTimer = 0
      }
    }

    // ── Kill feed: desvanecer entradas viejas ─────────────────────────────
    for (let i = PaintballState.killFeed.length - 1; i >= 0; i--) {
      PaintballState.killFeed[i].t -= dt
      if (PaintballState.killFeed[i].t <= 0) PaintballState.killFeed.splice(i, 1)
    }

    // ── Scoreboard: difundir mi score (solo mientras estoy en partida) ─────
    // El refresco de la tabla + presencia corre siempre, en presenceSystem.
    scoreBroadcastAccum += dt
    if (scoreBroadcastAccum >= 1.5) {
      scoreBroadcastAccum = 0
      const myId = getMyId()
      if (myId) {
        pbBus.emit(PB_MSG.score, {
          id: myId,
          name: getPlayer()?.name || 'Player',
          score: PaintballState.score,
          kills: PaintballState.kills,
          team: PaintballState.myTeam
        })
      }
    }

    // ── Cooldown de disparo ───────────────────────────────────────────────
    if (shootCooldown > 0) {
      shootCooldown -= dt
      if (shootCooldown < 0.35) PaintballState.isShooting = false // Termina la animación de recoil
    }

    // ── Flash de "fuiste golpeado" (Desvanecimiento suave) ───────────────
    if (PaintballState.shotFlash) {
      PaintballState.shotFlashAlpha -= dt * 2.0 // se desvanece en 0.5s
      if (PaintballState.shotFlashAlpha <= 0) {
        PaintballState.shotFlash = false
        PaintballState.shotFlashAlpha = 0
      }
    }

    // ── Flash de "golpeaste" y Hitmarker (Desvanecimiento suave) ─────────
    if (PaintballState.hitFlash) {
      PaintballState.hitFlashAlpha -= dt * 3.0 // se desvanece en ~0.33s
      if (PaintballState.hitFlashAlpha <= 0) {
        PaintballState.hitFlash = false
        PaintballState.hitFlashAlpha = 0
      }
    }

    // ── Timer de Announcer UT ─────────────────────────────────────────────
    if (PaintballState.announcerTimer > 0) {
      PaintballState.announcerTimer -= dt
    }

    // ── Invulnerabilidad post-respawn ─────────────────────────────────────
    if (invulActive) {
      invulAccum += dt
      if (invulAccum >= INVUL_SECONDS) { invulActive = false; invulAccum = 0 }
    }

    // ── Countdown de respawn ──────────────────────────────────────────────
    if (PaintballState.respawning) {
      respawnAccum += dt
      PaintballState.respawnCD = Math.max(0, RESPAWN_SECONDS - Math.floor(respawnAccum))
      if (respawnAccum >= RESPAWN_SECONDS) doRespawn()
      return  // no disparar mientras estás muerto
    }

    // Posición actual del jugador
    const myTransform = Transform.getOrNull(engine.PlayerEntity)
    if (!myTransform) return

    // ── TARGET RADAR: Actualizar dirección del bot más cercano ───────────
    const closest = getClosestBot(myTransform.position)
    if (closest) {
      const cameraTransform = Transform.getOrNull(engine.CameraEntity)
      if (cameraTransform) {
        // Vector desde jugador a bot en el plano XZ
        const toBot = Vector3.subtract(closest.pos, myTransform.position)
        toBot.y = 0
        const toBotNorm = Vector3.normalize(toBot)
        
        // Vector forward y right de la cámara proyectados en XZ
        const camFwd = Vector3.rotate(Vector3.Forward(), cameraTransform.rotation)
        camFwd.y = 0
        const camFwdNorm = Vector3.normalize(camFwd)
        
        const camRight = Vector3.rotate(Vector3.Right(), cameraTransform.rotation)
        camRight.y = 0
        const camRightNorm = Vector3.normalize(camRight)
        
        const dotFwd = Vector3.dot(camFwdNorm, toBotNorm)
        const dotRight = Vector3.dot(camRightNorm, toBotNorm)
        
        let directionStr = 'AHEAD ⬆️'
        if (dotFwd > 0.707) {
          directionStr = 'AHEAD ⬆️'
        } else if (dotFwd < -0.707) {
          directionStr = 'BEHIND ⬇️'
        } else if (dotRight > 0) {
          directionStr = 'RIGHT ➡️'
        } else {
          directionStr = 'LEFT ⬅️'
        }
        
        PaintballState.radarMsg = `📡 TARGET: ${closest.name} - ${Math.round(closest.dist)}m [${directionStr}]`
      } else {
        PaintballState.radarMsg = `📡 TARGET: ${closest.name} - ${Math.round(closest.dist)}m`
      }
    } else {
      PaintballState.radarMsg = ''
    }

    // ── DISPARO: botón primario (Click izquierdo) ─────────────────────
    const fired = inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN)
    if (fired && shootCooldown <= 0 && rayEntity !== null) {
      // Rapid Fire (power-up) acelera la cadencia
      shootCooldown = PaintballState.rapidFireTimer > 0 ? 0.16 : 0.5
      PaintballState.isShooting = true
      playWeaponRecoil()
      playPlayerShoot()

      // Spawnear destello del cañón (Muzzle Flash) del jugador
      spawnMuzzleFlash(engine.CameraEntity, myPaint,false)

      const cameraTransform = Transform.getOrNull(engine.CameraEntity)

      const eyePos = cameraTransform ? cameraTransform.position : Vector3.create(
        myTransform.position.x,
        myTransform.position.y + 1.6,   // altura de ojos
        myTransform.position.z
      )

      // Dirección "adelante" usando la cámara real (Pitch + Yaw)
      const fwd = cameraTransform
        ? Vector3.rotate(Vector3.Forward(), cameraTransform.rotation)
        : Vector3.rotate(Vector3.Forward(), myTransform.rotation)

      if (PaintballState.tripleShotTimer > 0) {
        // ── TRIPLE SHOT: cono más ancho, impacta hasta 3 bots al instante ──
        fireTripleShot(eyePos, fwd)
      } else {
        // ── Disparo simple: detección conal + raycast de cobertura ──
        lastTargetBot = null
        lastTargetDist = 0
        lastTargetBotPos = Vector3.Zero()

        const checkEntityForShot = (entity: Entity, otherTransform: any) => {
          const isBot = BotState.has(entity)
          if (isBot && !(PaintballState.matchPhase === 2 && PaintballState.matchBots)) return false

          // Saltear entidades ocultas (bots parqueados/muertos tienen scale 0)
          if (otherTransform.scale && otherTransform.scale.x < 0.1) return false
          // CLAVE: apuntar al CENTRO DE MASA (≈1.1m sobre los pies), no a los pies.
          // Si usás los pies, al apuntar al cuerpo el cono falla y los bots parecen
          // invencibles (era el bug). También evita que la cobertura choque contra
          // el piso debajo del bot.
          const cx = otherTransform.position.x
          const cy = otherTransform.position.y + AIM_HEIGHT
          const cz = otherTransform.position.z
          const dx = cx - eyePos.x
          const dy = cy - eyePos.y
          const dz = cz - eyePos.z
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (dist > SHOOT_RANGE) return false

          // Verificar que está dentro del cono de visión (producto punto con forward)
          const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / dist
          if (dot < 0.96) return false // cono de ~16°

          // Verificar distancia perpendicular (radio de hit box)
          const perpDist = dist * Math.sqrt(Math.max(0, 1 - dot * dot))
          if (perpDist <= HIT_RADIUS) {
            lastTargetBot = entity
            lastTargetDist = dist
            lastTargetBotPos = Vector3.create(cx, cy, cz)
            return true
          }
          return false
        }

        for (const [entity, idData, otherTransform] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
          // NUNCA detectar tu propio avatar (en 3ra persona el disparo sale de la
          // cámara y tu avatar queda en el medio del cono → te matabas solo).
          if (entity === engine.PlayerEntity) continue
          if (idData.address === getMyId()) continue
          if (checkEntityForShot(entity, otherTransform)) break
        }
        if (!lastTargetBot) {
          for (const [entity, , otherTransform] of engine.getEntitiesWith(BotState, Transform)) {
            if (checkEntityForShot(entity, otherTransform)) break
          }
        }

        // Lanzar SIEMPRE el raycast para verificar colisión con entorno/cobertura en el siguiente frame
        lastEyePos = Vector3.clone(eyePos)
        lastFwd = Vector3.clone(fwd)

        Raycast.createOrReplace(rayEntity, {
          direction: { $case: 'globalDirection', globalDirection: fwd },
          maxDistance: SHOOT_RANGE,
          queryType:   RaycastQueryType.RQT_HIT_FIRST,
          collisionMask: ColliderLayer.CL_PHYSICS,
          originOffset: eyePos,
          continuous:  false,
        })
      }
    }
    
    // ── MONSTER HAZARD (Riesgo Neutral) ─────────────────────────────────
    // Si el Flowerman (arbolesEntity) está a menos de 4m del jugador, pierde 1 vida
    const monsterDistX = -104.2 - myTransform.position.x
    const monsterDistZ = 73.2 - myTransform.position.z
    const distToMonster = Math.sqrt(monsterDistX*monsterDistX + monsterDistZ*monsterDistZ)
    
    if (distToMonster < 4.0 && !invulActive && !PaintballState.respawning) {
      receivePaintballHit(MONSTER_PAINT.emissive)
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// API PÚBLICA — llamada desde ui.tsx al presionar botones
// ─────────────────────────────────────────────────────────────────────────────

// Entra a la arena con el modo dado (lo comparten "iniciar" y "unirse").
function enterArena(mode: number) {
  resetRound()
  PaintballState.isSolo    = true
  PaintballState.matchMode = mode

  // Asignar equipo (modo equipos): al equipo con menos jugadores.
  if (mode === 1) {
    let t = 0
    let ct = 0
    for (const [, e] of scoreMap) {
      if (e.team === 1) t++
      else if (e.team === 2) ct++
    }
    PaintballState.myTeam = t <= ct ? 1 : 2
    myPaint = PaintballState.myTeam === 1 ? TEAM_COLOR_T : TEAM_COLOR_CT
  } else {
    PaintballState.myTeam = 0
    myPaint = PLAYER_PAINT.emissive
  }

  PaintballState.inGame    = true
  PaintballState.inviteOpen = false
  PaintballState.lobbyOpen  = false
  invulActive = true  // invulnerable los primeros segundos
  teleportTo(getMySpawn())
  createWeapon()
  refreshCameraArea()
}

/** INICIA una partida nueva: define el modo (0=FFA, 1=equipos) y con/sin bots.
 * Solo debería llamarse cuando NO hay partida en curso (fase 0 idle o 3 results). */
export function startPaintball(mode: number = 0) {
  // El host fija modo + bots de ESTA partida; los que se unan después los heredan.
  requestStartMatch(mode, PaintballState.botsEnabled)
  enterArena(mode)
}

/** SE UNE a la partida ya en curso (countdown o activa). No cambia modo ni bots:
 * hereda lo que eligió quien la inició (evita conflictos FFA-vs-Team / bots-vs-no). */
export function joinPaintball() {
  enterArena(PaintballState.matchMode)
}

/** Sale del juego y vuelve al spawn del mundo */
export function exitPaintball() {
  PaintballState.inGame    = false
  PaintballState.gameOver  = false
  PaintballState.inviteOpen = false
  resetRound()
  removeWeapon()
  teleportTo(ARENA_NPC)
}

/** Registra que el jugador fue impactado. `color` tiñe el flash de daño. */
export function receivePaintballHit(color?: Color4) {
  if (!PaintballState.inGame || PaintballState.respawning || PaintballState.gameOver) return
  if (invulActive) return  // invulnerable
  if (PaintballState.shieldTimer > 0) return  // escudo (power-up) absorbe el golpe

  PaintballState.health--
  PaintballState.shotFlash = true
  PaintballState.shotFlashAlpha = 0.45 // Alpha inicial para desvanecimiento suave
  PaintballState.shotFlashColor = color
    ? Color4.create(color.r, color.g, color.b, 1)
    : Color4.create(0.9, 0.05, 0.05, 1)

  // Romper el combo al recibir daño
  PaintballState.combo = 0
  PaintballState.comboTimer = 0

  if (PaintballState.health <= 0) {
    PaintballState.health     = 0
    PaintballState.respawning = true
    respawnAccum = 0
    PaintballState.respawnCD  = RESPAWN_SECONDS
    teleportTo(getMySpawn())
  }
}
