// ─── Partida: lobby, countdown, rondas y modos (FFA / T vs CT) ─────────────────
// Estado sincronizado en un singleton (host-authoritative). El que inicia define
// modo + bots; los que entran durante el countdown heredan esa config.

import { engine, Entity, Schemas } from '@dcl/sdk/ecs'
import { syncEntity } from '@dcl/sdk/network'
import { PaintballState } from './paintballState'
import { isHost, SYNC_IDS } from './net'
import { pbBus, PB_MSG, StartMatchMsg, TeamScoreMsg } from './paintballNet'

export const PBMatch = engine.defineComponent('pbMatch', {
  phase: Schemas.Int, // 0 idle, 1 countdown, 2 active, 3 results
  mode: Schemas.Int, // 0 ffa, 1 team
  timer: Schemas.Float,
  scoreT: Schemas.Int,
  scoreCT: Schemas.Int,
  winner: Schemas.Int, // 0 none, 1 T, 2 CT
  bots: Schemas.Int // 0 sin bots, 1 con bots
})

// Countdown SIEMPRE de 30s: ventana para que se sumen otros jugadores.
const COUNTDOWN = 30
const ROUND_SECONDS = 300
const TEAM_SCORE_CAP = 30

let matchEntity: Entity

export function setupMatch() {
  matchEntity = engine.addEntity()
  PBMatch.create(matchEntity, { phase: 0, mode: 0, timer: 0, scoreT: 0, scoreCT: 0, winner: 0, bots: 1 })
  syncEntity(matchEntity, [PBMatch.componentId], SYNC_IDS.match)

  // Pedido de arrancar (host decide). El que inicia fija modo + bots.
  pbBus.on(PB_MSG.startMatch, (m: StartMatchMsg) => {
    if (!isHost()) return
    const st = PBMatch.getMutable(matchEntity)
    if (st.phase === 0 || st.phase === 3) {
      st.phase = 1
      st.mode = m.mode
      st.bots = m.bots ? 1 : 0
      st.timer = COUNTDOWN
      st.scoreT = 0
      st.scoreCT = 0
      st.winner = 0
    }
  })

  // Punto para un equipo (solo en fase activa de modo equipos)
  pbBus.on(PB_MSG.teamScore, (m: TeamScoreMsg) => {
    if (!isHost()) return
    const st = PBMatch.getMutable(matchEntity)
    if (st.phase !== 2 || st.mode !== 1) return
    if (m.team === 1) st.scoreT++
    else if (m.team === 2) st.scoreCT++
  })

  engine.addSystem(matchSystem)
}

function matchSystem(dt: number) {
  const st = PBMatch.getOrNull(matchEntity)
  if (!st) return

  // Reflejar a PaintballState para la UI (en todos los clientes)
  PaintballState.matchPhase = st.phase
  PaintballState.matchMode = st.mode
  PaintballState.matchTimer = st.timer
  PaintballState.teamScoreT = st.scoreT
  PaintballState.teamScoreCT = st.scoreCT
  PaintballState.matchWinner = st.winner
  PaintballState.matchBots = st.bots === 1

  if (!isHost()) return

  const m = PBMatch.getMutable(matchEntity)
  if (m.phase === 1) {
    m.timer -= dt
    if (m.timer <= 0) {
      m.phase = 2
      m.timer = ROUND_SECONDS
    }
  } else if (m.phase === 2) {
    m.timer -= dt
    let over = m.timer <= 0
    if (m.mode === 1 && (m.scoreT >= TEAM_SCORE_CAP || m.scoreCT >= TEAM_SCORE_CAP)) over = true
    if (over) {
      m.winner = m.scoreT > m.scoreCT ? 1 : m.scoreCT > m.scoreT ? 2 : 0
      m.phase = 3
      m.timer = 10
    }
  } else if (m.phase === 3) {
    m.timer -= dt
    if (m.timer <= 0) {
      m.phase = 0
      m.timer = 0
    }
  }
}

/** Pide arrancar una partida. bots = con/sin bots. */
export function requestStartMatch(mode: number, bots: boolean) {
  pbBus.emit(PB_MSG.startMatch, { mode, bots })
}
