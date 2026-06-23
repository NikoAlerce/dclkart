import { engine, Entity, Transform, AvatarShape, PlayerIdentityData, Raycast, RaycastResult, RaycastQueryType, ColliderLayer, GltfContainer, Schemas, MeshRenderer, Material, Animator } from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { receivePaintballHit } from './paintball'
import { PaintballState, COMBO_WINDOW } from './paintballState'
import { spawnLaser } from './paintballLasers'
import { spawnBotExplosion, spawnMuzzleFlash } from './paintballFX'
import { PaintColor, nextBotPaint } from './paintballColors'
import { isHost, getMyId, SYNC_IDS } from './net'
import { pbBus, PB_MSG, BotDamageMsg, BotKilledMsg, BotShotMsg } from './paintballNet'
import { FFA_SPAWNS, TEAM_SPAWN_T, TEAM_SPAWN_CT, ARENA_FLOOR_Y, ArenaCalibration } from './paintballArena'
import { isNavReady, findPath } from './paintballNav'
import { playShootAt } from './paintballAudio'

// ─── Bots compartidos (host-authoritative) ────────────────────────────────────
// Todos los clientes crean los mismos bots con un enumId estable y syncEntity sobre
// el Transform (igual patrón que los karts). Solo el HOST corre la IA y escribe el
// Transform; los demás lo reciben. La apariencia es determinística por índice (no se
// sincroniza AvatarShape). Daño, muertes y disparos viajan por MessageBus.

type BotData = {
  entity: Entity
  paint: PaintColor
  health: number
  respawnCD: number
  shootCD: number
  moveTimer: number
  targetPos: Vector3
  isJumping: boolean
  jumpTime: number
  jumpCooldown: number
  shootRayEntity: Entity
  moveRayEntity: Entity // raycast horizontal para evitar atravesar paredes
  visualEntity: Entity // AvatarShape va acá (top-level, NO sincronizada) y copia el Transform del bot
  wallTurnDir: number // sentido de giro al pegar contra una pared (+1/-1)
  wallStuckTimer: number
  stuckX: number // detección de "trabado": última posición de referencia + timer
  stuckZ: number
  stuckT: number
  name: string
  lastShot?: {
    from: Vector3
    to: Vector3
    dist: number
    targetAddr: string
  }
  patrolTarget: Vector3
  patrolWait: number
  alertState: 'patrol' | 'combat'
  loseTargetTimer: number
  // Navmesh (A*)
  pathGoal?: Vector3
  navPath: Vector3[]
  navIdx: number
  navCD: number
  lastMoveDir?: Vector3
}

// Vida del bot sincronizada → en un cambio de host, el nuevo host adopta la vida
// actual (en vez de resetearla a 3).
export const BotState = engine.defineComponent('pbBotState', { health: Schemas.Int })

export const BotDebugInfo: {
  [botId: number]: {
    y: number
    groundY: number | null
    hits: { entity: number; y: number; src?: string }[]
  }
} = {}

const bots: BotData[] = []
const BOT_COUNT = 4
const BOT_MAX_HEALTH = 2
const BOT_SPEED = 6.0
const BOT_SHOOT_RANGE = 32

// Área de descarte para bots ocultos/muertos: bajo tierra, en el centro del arena.
// NO usamos -9999 porque a esa distancia el motor descarga el AvatarShape y al
// volver no se vuelve a renderizar. Acá queda cerca de la escena, fuera de vista.
const BOT_PARK = Vector3.create(0, 4, 400)

let _botLogTimer = 0  // timer para imprimir posiciones

// Puntos de aparición de los bots: ahora dentro del mapa de Counter (calibrar en
// paintballArena.ts). Mezcla de spawns FFA + las dos bases de equipo.
export const BOT_SPAWN_POINTS = [
  ...FFA_SPAWNS,
  TEAM_SPAWN_T,
  TEAM_SPAWN_CT
]

const TOPS = [
  'urn:decentraland:off-chain:base-avatars:m_sweater',
  'urn:decentraland:off-chain:base-avatars:tshirt_sport',
  'urn:decentraland:off-chain:base-avatars:black_jacket'
]
const PANTS = [
  'urn:decentraland:off-chain:base-avatars:m_jeans',
  'urn:decentraland:off-chain:base-avatars:baggy_pants',
  'urn:decentraland:off-chain:base-avatars:m_gymshorts'
]
const HAIRS = [
  'urn:decentraland:off-chain:base-avatars:coolhair',
  'urn:decentraland:off-chain:base-avatars:spiky',
  'urn:decentraland:off-chain:base-avatars:dreads',
  'urn:decentraland:off-chain:base-avatars:casual_hair_01',
  'urn:decentraland:off-chain:base-avatars:tall_front_01'
]

export function setupBots() {
  engine.addSystem(botSystem)
  engine.addSystem(botVisualSystem)

  // ── Handlers de red ─────────────────────────────────────────────────────────
  // Daño a un bot: solo el host (autoridad de vida) lo procesa.
  pbBus.on(PB_MSG.botDamage, (m: BotDamageMsg) => {
    if (!isHost()) return
    applyBotDamage(m.bot, m.by)
  })

  // Bot muerto: todos los clientes muestran la explosión; el que lo mató suma score.
  pbBus.on(PB_MSG.botKilled, (m: BotKilledMsg) => {
    const color = Color4.create(m.r, m.g, m.b, 1)
    spawnBotExplosion(Vector3.create(m.pos.x, m.pos.y, m.pos.z), color)
    if (m.by === getMyId()) creditKill(m.name, color)
  })

  // Disparo de un bot: todos dibujan el trazo; la víctima aplica su daño.
  pbBus.on(PB_MSG.botShot, (m: BotShotMsg) => {
    const color = Color4.create(m.r, m.g, m.b, 1)
    const ent = botEntityById(m.bot)
    if (ent !== null) spawnMuzzleFlash(ent, color, true)
    playShootAt(Vector3.create(m.from.x, m.from.y, m.from.z))
    const hitNormal = m.normal ? Vector3.create(m.normal.x, m.normal.y, m.normal.z) : Vector3.Zero()
    spawnLaser(
      Vector3.create(m.from.x, m.from.y, m.from.z),
      Vector3.create(m.to.x, m.to.y, m.to.z),
      color,
      hitNormal
    )
    if (m.hit !== '' && m.hit === getMyId()) receivePaintballHit(color)
  })
}

/** Crea los bots compartidos. Lo llaman TODOS los clientes (mismo enumId estable). */
export function spawnBots() {
  if (bots.length > 0) return // ya creados (persistentes)

  for (let i = 0; i < BOT_COUNT; i++) {
    const botEntity = engine.addEntity()
    const shootRayEntity = engine.addEntity()
    const moveRayEntity = engine.addEntity()

    // Posición inicial determinística (el host la sobrescribe con la IA)
    const spawnPt = BOT_SPAWN_POINTS[i % BOT_SPAWN_POINTS.length]
    const pos = Vector3.create(spawnPt.x, spawnPt.y + 2, spawnPt.z)
    const paint = nextBotPaint()

    Transform.create(botEntity, { position: pos, scale: Vector3.One() })
    Transform.create(shootRayEntity, { position: Vector3.clone(pos) })
    Transform.create(moveRayEntity, { position: Vector3.clone(pos) })

    // Raycast continuo hacia adelante para detectar paredes (evitar atravesarlas)
    Raycast.createOrReplace(moveRayEntity, {
      direction: { $case: 'localDirection', localDirection: Vector3.Forward() },
      maxDistance: 1.5,
      queryType: RaycastQueryType.RQT_HIT_FIRST,
      continuous: true,
      collisionMask: ColliderLayer.CL_PHYSICS,
      originOffset: Vector3.create(0, 0.5, 0)
    })

    // ── Entidad VISUAL (top-level, NO sincronizada) ──────────────────────────
    // El modelo GLB va acá (entidad propia, NO la sincronizada con syncEntity, para no
    // pelear con el sistema de red). botVisualSystem le copia el Transform del botEntity
    // cada frame.
    const visualEntity = engine.addEntity()
    Transform.create(visualEntity, { position: pos, scale: Vector3.One() })
    const emColor = Color3.create(paint.emissive.r, paint.emissive.g, paint.emissive.b)
    GltfContainer.create(visualEntity, {
      src: 'assets/models/enemybot.glb',
      invisibleMeshesCollisionMask: ColliderLayer.CL_NONE,
      visibleMeshesCollisionMask:   ColliderLayer.CL_NONE
    })
    Animator.create(visualEntity, {
      states: [
        { clip: 'Armature|Running_Reload_inplace|baselayer', playing: true, loop: true, speed: 1.0 }
      ]
    })

    // Marcador flotante (esfera emisiva = indicador de objetivo, color de pintura del bot)
    const marker = engine.addEntity()
    Transform.create(marker, { parent: visualEntity, position: Vector3.create(0, 2.3, 0), scale: Vector3.create(0.28, 0.28, 0.28) })
    MeshRenderer.setSphere(marker)
    Material.setPbrMaterial(marker, { albedoColor: paint.emissive, emissiveColor: emColor, emissiveIntensity: 3.0 })

    BotState.create(botEntity, { health: BOT_MAX_HEALTH })

    // Raycast hacia abajo desde APENAS arriba de los pies (+2.2) para seguir el piso
    // irregular como la física del jugador: el primer hit hacia abajo es el suelo bajo
    // el bot (o un escalón ≤2m). Origen bajo = NO agarra techos. maxDistance corto.
    Raycast.createOrReplace(botEntity, {
      direction: { $case: 'globalDirection', globalDirection: Vector3.Down() },
      maxDistance: 5.0,
      queryType: RaycastQueryType.RQT_QUERY_ALL,
      continuous: true,
      collisionMask: ColliderLayer.CL_PHYSICS,
      originOffset: Vector3.create(0, 2.2, 0)
    })

    // Sincronizar posición + vida del bot. Igual que los karts: todos crean la
    // entidad con el mismo enumId; el host es quien la maneja, el resto la recibe.
    syncEntity(botEntity, [Transform.componentId, BotState.componentId], SYNC_IDS.botBase + i)

    const initialPatrolPt = BOT_SPAWN_POINTS[i % BOT_SPAWN_POINTS.length]

    bots.push({
      entity: botEntity,
      paint: paint,
      health: BOT_MAX_HEALTH,
      respawnCD: 0,
      shootCD: 3.0 + Math.random() * 2.0,
      targetPos: Vector3.Zero(),
      moveTimer: 0,
      isJumping: false,
      jumpTime: 0,
      jumpCooldown: 2.0 + Math.random() * 3.0,
      shootRayEntity: shootRayEntity,
      moveRayEntity: moveRayEntity,
      visualEntity: visualEntity,
      wallTurnDir: i % 2 === 0 ? 1 : -1,
      wallStuckTimer: 0,
      stuckX: 0, stuckZ: 0, stuckT: 0,
      name: 'Bot ' + (i + 1),
      patrolTarget: initialPatrolPt,
      patrolWait: Math.random() * 2.0,
      alertState: 'patrol',
      loseTargetTimer: 0,
      navPath: [],
      navIdx: 0,
      navCD: 0
    })
  }
}

export function clearBots() {
  for (const bot of bots) {
    engine.removeEntity(bot.entity)
    engine.removeEntity(bot.shootRayEntity)
    engine.removeEntity(bot.moveRayEntity)
    engine.removeEntity(bot.visualEntity)
  }
  bots.length = 0
}

// ── Render desacoplado de la red: la entidad visual (GLB) copia el
// Transform del bot cada frame. Corre en TODOS los clientes (no solo el host), así
// todos ven a los bots moviéndose desde la posición sincronizada.
function botVisualSystem() {
  const BOT_SCALE = 1.4
  for (const bot of bots) {
    const src = Transform.getOrNull(bot.entity)
    const vis = Transform.getMutableOrNull(bot.visualEntity)
    if (!src || !vis) continue
    // Copiar posición + rotación del bot lógico
    vis.position.x = src.position.x
    vis.position.y = src.position.y
    vis.position.z = src.position.z
    vis.rotation = src.rotation

    const phase = PaintballState.matchPhase
    const botsActive = phase === 2 && PaintballState.matchBots
    const bs = BotState.getOrNull(bot.entity)
    const isAtPark = Math.abs(src.position.x - 0) < 2.0 && Math.abs(src.position.z - 400) < 2.0
    const isAlive = !!(botsActive && bs && bs.health > 0 && !isAtPark)

    // Ajustar escala según si está vivo o muerto (para ocultarlo)
    const targetScale = isAlive ? BOT_SCALE : 0.0
    vis.scale = Vector3.create(targetScale, targetScale, targetScale)

    // if (botsActive) {
    //   console.log(`[BOT_VISUAL] Bot ${bot.name} | isAlive: ${isAlive} | targetScale: ${targetScale} | pos: (${src.position.x.toFixed(1)}, ${src.position.y.toFixed(1)}, ${src.position.z.toFixed(1)}) | health: ${bs ? bs.health : 'null'} | isAtPark: ${isAtPark}`)
    // }

    // Sincronizar animación con estado vivo
    const animator = Animator.getMutableOrNull(bot.visualEntity)
    if (animator) {
      const clip = animator.states.find(s => s.clip === 'Armature|Running_Reload_inplace|baselayer')
      if (clip) {
        clip.playing = isAlive
      }
    }
  }
}

/** Índice del bot para una entidad, o -1 si no es un bot. */
export function getBotIndex(entity: Entity): number {
  for (let i = 0; i < bots.length; i++) {
    if (bots[i].entity === entity) return i
  }
  return -1
}

function botEntityById(id: number): Entity | null {
  return bots[id] ? bots[id].entity : null
}

// Cambia la vida del bot en el dato local Y en el componente sincronizado.
function setBotHealth(bot: BotData, h: number) {
  bot.health = h
  const bs = BotState.getMutableOrNull(bot.entity)
  if (bs) bs.health = h
}

// ── Daño autoritativo (solo host) ──────────────────────────────────────────────
function applyBotDamage(botId: number, by: string) {
  const bot = bots[botId]
  if (!bot || bot.health <= 0) return

  setBotHealth(bot, bot.health - 1)
  if (bot.health <= 0) {
    bot.respawnCD = 4.0
    const pos = Transform.get(bot.entity).position
    const msg: BotKilledMsg = {
      bot: botId,
      by,
      name: bot.name,
      pos: { x: pos.x, y: pos.y, z: pos.z },
      r: bot.paint.emissive.r,
      g: bot.paint.emissive.g,
      b: bot.paint.emissive.b
    }
    // Esconder el bot: scale 0 en la entidad LÓGICA (para que el radar/disparos lo
    // ignoren) + parquearlo bajo tierra. El AvatarShape (entidad visual aparte) lo
    // sigue manteniendo SU escala en 1 → no se rompe.
    const botT = Transform.getMutable(bot.entity)
    botT.scale = Vector3.Zero()
    botT.position = Vector3.clone(BOT_PARK)
    pbBus.emit(PB_MSG.botKilled, msg)
  }
}

// ── Crédito del kill (corre en el cliente del que mató) ────────────────────────
export function creditKill(botName: string, color: Color4) {
  PaintballState.kills++

  // Combo
  if (PaintballState.comboTimer > 0) PaintballState.combo++
  else PaintballState.combo = 1
  PaintballState.comboTimer = COMBO_WINDOW
  if (PaintballState.combo > PaintballState.bestCombo) PaintballState.bestCombo = PaintballState.combo

  // Score: 100 base × multiplicador de combo
  const points = 100 * PaintballState.combo
  PaintballState.score += points

  // Announcer según el combo
  const c = PaintballState.combo
  PaintballState.announcerTimer = 1.8
  PaintballState.announcerBig = c >= 4
  if (c >= 7) PaintballState.announcerMsg = 'GODLIKE!'
  else if (c === 6) PaintballState.announcerMsg = 'UNSTOPPABLE!'
  else if (c === 5) PaintballState.announcerMsg = 'RAMPAGE!'
  else if (c === 4) PaintballState.announcerMsg = 'MULTI KILL!'
  else if (c === 3) PaintballState.announcerMsg = 'TRIPLE SPLAT!'
  else if (c === 2) PaintballState.announcerMsg = 'DOUBLE SPLAT!'
  else PaintballState.announcerMsg = 'SPLAT!'

  // Kill feed
  PaintballState.killFeed.unshift({ text: `💥  ${botName}  +${points}`, color, t: 4.0 })
  if (PaintballState.killFeed.length > 4) PaintballState.killFeed.length = 4

  if (PaintballState.kills >= 15) { // KILLS_TO_WIN
    PaintballState.gameOver = true
    PaintballState.gameMsg = '🏆  You won the round!'
  }
}

// ── Jugadores presentes (avatares remotos + el local) ──────────────────────────
type PlayerRef = { pos: Vector3; address: string }

function collectPlayers(): PlayerRef[] {
  const out: PlayerRef[] = []
  const me = Transform.getOrNull(engine.PlayerEntity)
  if (me) out.push({ pos: me.position, address: getMyId() })
  for (const [, idData, tr] of engine.getEntitiesWith(PlayerIdentityData, Transform)) {
    if (idData.address.startsWith('bot_')) continue
    out.push({ pos: tr.position, address: idData.address })
  }
  return out
}

function nearestPlayer(players: PlayerRef[], botPos: Vector3): { pos: Vector3; address: string; dist: number } | null {
  let best: { pos: Vector3; address: string; dist: number } | null = null
  for (const p of players) {
    const dx = p.pos.x - botPos.x
    const dy = p.pos.y - botPos.y
    const dz = p.pos.z - botPos.z
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (!best || d < best.dist) best = { pos: p.pos, address: p.address, dist: d }
  }
  return best
}

let lastBotsActive = false
let lastLogPhase = -1
// Cooldown GLOBAL entre disparos de cualquier bot: escalona los tiros para que no te
// disparen los 4 al mismo tiempo desde todos lados. ~0.8s entre tiros de todo el equipo.
let botGlobalShootCD = 0

function botSystem(dt: number) {
  const isHostVal = isHost()
  const phase = PaintballState.matchPhase

  if (phase !== lastLogPhase) {
    console.log(`[BOT_SYSTEM] Phase changed: ${lastLogPhase} -> ${phase}. isHost: ${isHostVal}`)
    lastLogPhase = phase
  }

  // Log periódico de posiciones de bots (cada 5s)
  _botLogTimer -= dt
  if (_botLogTimer <= 0) {
    _botLogTimer = 5
    for (let i = 0; i < bots.length; i++) {
      const tr = Transform.getOrNull(bots[i].entity)
      if (tr && tr.scale.x > 0.01) {
        const p = tr.position
        console.log(`[BOT_POS] Bot ${i} → X:${p.x.toFixed(1)} Y:${p.y.toFixed(1)} Z:${p.z.toFixed(1)} state:${bots[i].alertState} hp:${bots[i].health}`)
      }
    }
    // También imprimir posición del jugador para comparar
    const me = Transform.getOrNull(engine.PlayerEntity)
    if (me) console.log(`[BOT_POS] PLAYER → X:${me.position.x.toFixed(1)} Y:${me.position.y.toFixed(1)} Z:${me.position.z.toFixed(1)}`)
  }

  if (!isHostVal) return

  // ── Gating de bots ───────────────────────────────────────────────────────────
  // Los bots juegan según la ELECCIÓN del jugador en el menú (matchBots, sincronizado),
  // NO según cuántos jugadores haya. El usuario decide con/sin bots, sin importar si
  // está solo o acompañado.
  const players = collectPlayers()
  const botsActive = phase === 2 && PaintballState.matchBots

  // Flanco de subida: al activarse, resetear vida/estado y mostrar los bots en spawns.
  if (botsActive && !lastBotsActive) {
    for (let i = 0; i < bots.length; i++) {
      const bot = bots[i]
      const sp = BOT_SPAWN_POINTS[i % BOT_SPAWN_POINTS.length]
      setBotHealth(bot, BOT_MAX_HEALTH)
      bot.respawnCD = 0
      bot.alertState = 'patrol'
      bot.patrolTarget = BOT_SPAWN_POINTS[Math.floor(Math.random() * BOT_SPAWN_POINTS.length)]
      bot.navPath = []; bot.navIdx = 0
      const t = Transform.getMutable(bot.entity)
      t.position = Vector3.create(sp.x, sp.y + 2, sp.z)
      t.scale = Vector3.One()
    }
  }
  lastBotsActive = botsActive

  // Si los bots no deben jugar (no es fase activa, o hay 2+ jugadores), ocultarlos.
  if (!botsActive) {
    for (const bot of bots) {
      const t = Transform.getMutableOrNull(bot.entity)
      if (t && t.scale.x > 0.01) {
        t.scale = Vector3.Zero()
        t.position = Vector3.clone(BOT_PARK)
      }
    }
    return
  }

  if (botGlobalShootCD > 0) botGlobalShootCD -= dt

  for (const bot of bots) {
    // ── Resolver el disparo del bot (Cover System) → emitir botShot ──
    if (bot.lastShot && RaycastResult.has(bot.shootRayEntity)) {
      const result = RaycastResult.get(bot.shootRayEntity)
      const shot = bot.lastShot
      bot.lastShot = undefined

      let hitPos = shot.to
      let isBlocked = false
      let hitNormal = Vector3.Zero()

      if (result.hits.length > 0 && result.hits[0].position) {
        const hit = result.hits[0]
        if (hit.length < shot.dist - 1.5) {
          isBlocked = true
        }
        if (hit.position) {
          hitPos = Vector3.clone(hit.position)
        }
        if (hit.normalHit) {
          hitNormal = Vector3.clone(hit.normalHit)
        }
      }

      // ~7% de impacto si no fue bloqueado por cobertura (antes 20% = te acribillaban)
      const hitAddr = !isBlocked && Math.random() > 0.93 ? shot.targetAddr : ''
      const msg: BotShotMsg = {
        bot: getBotIndex(bot.entity),
        from: { x: shot.from.x, y: shot.from.y, z: shot.from.z },
        to: { x: hitPos.x, y: hitPos.y, z: hitPos.z },
        r: bot.paint.emissive.r,
        g: bot.paint.emissive.g,
        b: bot.paint.emissive.b,
        hit: hitAddr,
        normal: { x: hitNormal.x, y: hitNormal.y, z: hitNormal.z }
      }
      pbBus.emit(PB_MSG.botShot, msg)

      Raycast.deleteFrom(bot.shootRayEntity)
      RaycastResult.deleteFrom(bot.shootRayEntity)
    }

    // El host adopta la vida sincronizada (clave en un cambio de host)
    bot.health = BotState.get(bot.entity).health

    // Manejo de Respawn
    if (bot.health <= 0) {
      bot.respawnCD -= dt
      if (bot.respawnCD <= 0) {
        setBotHealth(bot, BOT_MAX_HEALTH)
        const spawnPt = BOT_SPAWN_POINTS[Math.floor(Math.random() * BOT_SPAWN_POINTS.length)]
        const mutableTransform = Transform.getMutable(bot.entity)
        mutableTransform.position = Vector3.create(
          spawnPt.x + (Math.random() - 0.5) * 4,
          spawnPt.y + 2,
          spawnPt.z + (Math.random() - 0.5) * 4
        )
        mutableTransform.scale = Vector3.One()

        bot.alertState = 'patrol'
        bot.patrolTarget = BOT_SPAWN_POINTS[Math.floor(Math.random() * BOT_SPAWN_POINTS.length)]
        bot.patrolWait = Math.random() * 2.0
        bot.moveTimer = 0
      }
      continue
    }

    const botTransform = Transform.getMutable(bot.entity)
    const botPos = botTransform.position

    // ── Anti-trabado: si casi no se movió en ~3s, re-targetear + re-path + empujón ──
    const movedSq = (botPos.x - bot.stuckX) ** 2 + (botPos.z - bot.stuckZ) ** 2
    if (movedSq > 2.25) { // se movió >1.5m → ok, resetear referencia
      bot.stuckX = botPos.x; bot.stuckZ = botPos.z; bot.stuckT = 0
    } else {
      bot.stuckT += dt
      if (bot.stuckT > 3.0) {
        bot.stuckT = 0; bot.stuckX = botPos.x; bot.stuckZ = botPos.z
        bot.navPath = []; bot.navIdx = 0; bot.pathGoal = undefined
        bot.patrolTarget = BOT_SPAWN_POINTS[Math.floor(Math.random() * BOT_SPAWN_POINTS.length)]
        bot.moveTimer = 0
        botPos.x += (Math.random() - 0.5) * 1.5
        botPos.z += (Math.random() - 0.5) * 1.5
      }
    }

    // ── Jugador más cercano (de TODOS) como objetivo ──
    const np = nearestPlayer(players, botPos)
    const playerPos = np ? np.pos : botPos
    const distToPlayer = np ? np.dist : Infinity
    const targetAddr = np ? np.address : ''

    // ── Altura: seguir el PISO IRREGULAR con el raycast hacia abajo ─────────────
    // Tomamos el hit MÁS ALTO (track.glb, o cualquier no-árbol) que esté por debajo del
    // origen del ray (pies+2.2). Eso es el suelo justo bajo el bot → sigue rampas y
    // escalones suave, sin agarrar techos (el ray arranca a la altura del bot) y sin
    // perseguir un nivel donde no hay piso (lo que causaba el hundirse/saltar).
    let groundY: number | null = null
    const floorRay = RaycastResult.getOrNull(bot.entity)
    if (floorRay && floorRay.hits.length > 0) {
      const rayTop = botPos.y + 2.2 // origen del ray (originOffset)
      for (const hit of floorRay.hits) {
        if (!hit.position || isNaN(hit.position.y)) continue
        if (hit.position.y > rayTop + 0.5) continue // por las dudas, ignorar lo de arriba
        const gltf = hit.entityId !== undefined ? GltfContainer.getOrNull(hit.entityId as Entity) : null
        const isTree = gltf && gltf.src && gltf.src.includes('arboles.glb')
        if (isTree) continue

        // FILTRAR HITS VIEJOS (TELETRANSPORTE): si el hit está horizontalmente muy lejos
        // de la posición actual del bot, es de un raycast anterior a la teleportación.
        const dx = hit.position.x - botPos.x
        const dz = hit.position.z - botPos.z
        if (dx * dx + dz * dz > 25.0) continue // más de 5 metros de distancia horizontal

        if (groundY === null || hit.position.y > groundY) groundY = hit.position.y
      }
    }
    if (groundY !== null) {
      const diff = groundY - botPos.y
      if (Math.abs(diff) > 12) botPos.y = groundY         // recién spawneó muy lejos
      else botPos.y += diff * Math.min(1, dt * 10)        // sigue el terreno, suave
    }
    // Sin hit (raro): mantenemos Y (no cae al vacío).

    BotDebugInfo[getBotIndex(bot.entity)] = { y: botPos.y, groundY, hits: [] }

    // Máquina de Estados (Patrulla vs Combate)
    // Rangos moderados: solo entran en combate los bots razonablemente cerca, así no
    // te enfrentan los 6 a la vez desde todo el mapa (era una picadora de carne).
    if (bot.alertState === 'combat') {
      if (distToPlayer > 65) {
        bot.loseTargetTimer -= dt
        if (bot.loseTargetTimer <= 0) {
          bot.alertState = 'patrol'
          bot.patrolTarget = BOT_SPAWN_POINTS[Math.floor(Math.random() * BOT_SPAWN_POINTS.length)]
          bot.patrolWait = 0.5
          bot.moveTimer = 0
        }
      } else {
        bot.loseTargetTimer = 4.0
      }
    } else {
      if (distToPlayer < 45) {
        bot.alertState = 'combat'
        bot.loseTargetTimer = 4.0
        bot.moveTimer = 0
      }
    }

    // Movimiento
    bot.moveTimer -= dt
    if (bot.moveTimer <= 0) {
      bot.moveTimer = 1.0 + Math.random() * 2.0

      if (bot.alertState === 'combat') {
        // En combate el objetivo va al NIVEL del jugador (playerPos.y) → el A* rutea
        // hacia el piso correcto y el bot no queda atrapado en el nivel de abajo.
        if (distToPlayer > 15) {
          bot.targetPos = Vector3.create(playerPos.x, playerPos.y, playerPos.z)
        } else if (distToPlayer < 6) {
          const dirX = botPos.x - playerPos.x
          const dirZ = botPos.z - playerPos.z
          const mag = Math.sqrt(dirX * dirX + dirZ * dirZ)
          if (mag > 0.1) {
            bot.targetPos = Vector3.create(botPos.x + (dirX / mag) * 8, playerPos.y, botPos.z + (dirZ / mag) * 8)
          }
        } else {
          const dirX = playerPos.x - botPos.x
          const dirZ = playerPos.z - botPos.z
          const mag = Math.sqrt(dirX * dirX + dirZ * dirZ)
          if (mag > 0.1) {
            const perpX = -dirZ / mag
            const perpZ = dirX / mag
            const strafeDir = Math.random() > 0.5 ? 1 : -1
            bot.targetPos = Vector3.create(botPos.x + perpX * 8 * strafeDir, playerPos.y, botPos.z + perpZ * 8 * strafeDir)
          }
        }
      } else {
        const tx = bot.patrolTarget.x - botPos.x
        const tz = bot.patrolTarget.z - botPos.z
        const tDist = Math.sqrt(tx * tx + tz * tz)

        if (tDist < 3.0) {
          bot.patrolWait -= dt
          if (bot.patrolWait <= 0) {
            bot.patrolWait = 2.0 + Math.random() * 3.0
            bot.patrolTarget = BOT_SPAWN_POINTS[Math.floor(Math.random() * BOT_SPAWN_POINTS.length)]
          }
          bot.targetPos = Vector3.clone(botPos)
        } else {
          bot.targetPos = Vector3.create(bot.patrolTarget.x, botPos.y, bot.patrolTarget.z)
        }
      }
    }

    // ── Navmesh A*: convertir el objetivo de alto nivel (targetPos) en el
    // próximo waypoint del camino. Si no hay navmesh, va directo (steering simple).
    let steer = bot.targetPos
    if (isNavReady()) {
      bot.navCD -= dt
      const goalMoved =
        !bot.pathGoal ||
        Math.abs(bot.pathGoal.x - bot.targetPos.x) + Math.abs(bot.pathGoal.z - bot.targetPos.z) > 4
      if (bot.navCD <= 0 || goalMoved) {
        bot.navCD = 0.6 + Math.random() * 0.4
        bot.pathGoal = Vector3.clone(bot.targetPos)
        bot.navPath = findPath(botPos, bot.targetPos)
        bot.navIdx = 0
      }
      if (bot.navPath.length > 0) {
        while (bot.navIdx < bot.navPath.length) {
          const wp = bot.navPath[bot.navIdx]
          const ddx = wp.x - botPos.x
          const ddz = wp.z - botPos.z
          if (ddx * ddx + ddz * ddz < 6.25) bot.navIdx++ // ≈2.5m
          else break
        }
        if (bot.navIdx < bot.navPath.length) steer = bot.navPath[bot.navIdx]
      }
    }

    // Mover hacia el steer (waypoint o objetivo directo)
    const tx = steer.x - botPos.x
    const tz = steer.z - botPos.z
    const tDist = Math.sqrt(tx * tx + tz * tz)

    if (tDist > 0.5) {
      const currentSpeed = bot.isJumping ? BOT_SPEED * 1.8 : BOT_SPEED
      const moveStep = currentSpeed * dt
      
      const walkLookTarget = Vector3.create(steer.x, botPos.y, steer.z)
      
      if (bot.alertState === 'combat' && distToPlayer < BOT_SHOOT_RANGE && np) {
        const aimLookTarget = Vector3.create(playerPos.x, botPos.y, playerPos.z)
        botTransform.rotation = Quaternion.fromLookAt(botPos, aimLookTarget)
      } else {
        botTransform.rotation = Quaternion.fromLookAt(botPos, walkLookTarget)
      }

      const ndx = tx / tDist
      const ndz = tz / tDist

      // Si tenemos guardada la última dirección de movimiento, tirar el raycast en esa dirección.
      // Si no (ej: primer frame), tirar en la dirección directa.
      const rayDir = bot.lastMoveDir ? bot.lastMoveDir : Vector3.create(ndx, 0, ndz)
      const rLen = Math.sqrt(rayDir.x * rayDir.x + rayDir.z * rayDir.z)
      const finalRayDir = rLen > 0.01 ? Vector3.create(rayDir.x / rLen, 0, rayDir.z / rLen) : Vector3.create(ndx, 0, ndz)

      // Actualizar posición de la entidad raycast
      const mTrans = Transform.getMutable(bot.moveRayEntity)
      mTrans.position.x = botPos.x
      mTrans.position.y = botPos.y
      mTrans.position.z = botPos.z

      Raycast.createOrReplace(bot.moveRayEntity, {
        direction: { $case: 'globalDirection', globalDirection: finalRayDir },
        maxDistance: 1.4,
        queryType: RaycastQueryType.RQT_HIT_FIRST,
        continuous: false,
        collisionMask: ColliderLayer.CL_PHYSICS,
        originOffset: Vector3.create(0, 1.1, 0) // a media altura: NO choca con escalones/rampas bajas
      })

      // Verificar colisión frontal. CLAVE: solo bloquea si es una PARED VERTICAL
      // (normal casi horizontal). Si la normal apunta hacia arriba (rampa/escalón/piso),
      // NO bloquea → el bot sube rampas en vez de chocar "paredes invisibles".
      let isBlocked = false
      let hitNormal = Vector3.Zero()
      if (RaycastResult.has(bot.moveRayEntity)) {
        const moveRes = RaycastResult.get(bot.moveRayEntity)
        const h0 = moveRes.hits[0]
        if (h0 && h0.length < 1.2) {
          const n = h0.normalHit
          const isVerticalWall = !n || Math.abs(n.y) < 0.6 // normal horizontal = pared real
          if (isVerticalWall) {
            isBlocked = true
            if (n) hitNormal = Vector3.clone(n)
          }
        }
      }
      
      if (!isBlocked) {
        botPos.x += ndx * moveStep
        botPos.z += ndz * moveStep
        bot.wallStuckTimer = 0
        bot.lastMoveDir = Vector3.create(ndx, 0, ndz)
      } else {
        // Deslizar usando proyección de la normal del muro
        const dot = ndx * hitNormal.x + ndz * hitNormal.z
        let sdx = ndx - dot * hitNormal.x
        let sdz = ndz - dot * hitNormal.z

        const sLen = Math.sqrt(sdx * sdx + sdz * sdz)
        if (sLen > 0.001) {
          sdx /= sLen
          sdz /= sLen
        } else {
          // Deslizamiento de respaldo si el choque es perfectamente perpendicular
          sdx = -hitNormal.z
          sdz = hitNormal.x
        }

        botPos.x += sdx * moveStep * 0.85
        botPos.z += sdz * moveStep * 0.85
        bot.lastMoveDir = Vector3.create(sdx, 0, sdz)

        bot.wallStuckTimer += dt
        if (bot.wallStuckTimer > 1.5) {
          if (bot.alertState !== 'combat') bot.patrolWait = 0
          bot.wallStuckTimer = 0
        }
      }
    } else if (bot.alertState === 'combat' && distToPlayer < BOT_SHOOT_RANGE) {
      const aimLookTarget = Vector3.create(playerPos.x, botPos.y, playerPos.z)
      botTransform.rotation = Quaternion.fromLookAt(botPos, aimLookTarget)
    }

    // Disparo (gateado por el cooldown global → no disparan todos juntos)
    bot.shootCD -= dt
    if (bot.alertState === 'combat' && bot.shootCD <= 0 && botGlobalShootCD <= 0 && distToPlayer < BOT_SHOOT_RANGE && np) {
      bot.shootCD = 3.2 + Math.random() * 2.0
      botGlobalShootCD = 0.8

      const botEye = Vector3.create(botPos.x, botPos.y + 1.6, botPos.z)
      const missOffset = Vector3.create((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2)
      const laserTarget = Vector3.create(playerPos.x + missOffset.x, playerPos.y + 1.0 + missOffset.y, playerPos.z + missOffset.z)
      const dir = Vector3.normalize(Vector3.subtract(laserTarget, botEye))

      // Actualizar posición de la entidad de raycast de disparo
      const sTrans = Transform.getMutable(bot.shootRayEntity)
      sTrans.position.x = botPos.x
      sTrans.position.y = botPos.y
      sTrans.position.z = botPos.z

      Raycast.createOrReplace(bot.shootRayEntity, {
        direction: { $case: 'globalDirection', globalDirection: dir },
        maxDistance: 150.0,
        queryType: RaycastQueryType.RQT_HIT_FIRST,
        collisionMask: ColliderLayer.CL_PHYSICS,
        originOffset: botEye,
        continuous: false
      })

      bot.lastShot = { from: botEye, to: laserTarget, dist: distToPlayer, targetAddr }
    }
  }
}

export function getClosestBot(playerPos: Vector3): { entity: Entity; name: string; dist: number; pos: Vector3 } | null {
  const phase = PaintballState.matchPhase
  const botsActive = phase === 2 && PaintballState.matchBots
  if (!botsActive) return null

  let closestBot: { entity: Entity; name: string; dist: number; pos: Vector3 } | null = null
  let minDist = Infinity

  for (const bot of bots) {
    const botTransform = Transform.getOrNull(bot.entity)
    if (!botTransform) continue
    if (botTransform.scale.x < 0.1) continue // muerto/oculto (sincronizado)

    const dx = botTransform.position.x - playerPos.x
    const dy = botTransform.position.y - playerPos.y
    const dz = botTransform.position.z - playerPos.z
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

    if (dist < minDist) {
      minDist = dist
      closestBot = {
        entity: bot.entity,
        name: bot.name,
        dist,
        pos: Vector3.clone(botTransform.position)
      }
    }
  }

  return closestBot
}
