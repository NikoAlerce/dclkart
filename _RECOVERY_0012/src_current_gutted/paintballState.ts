import { Vector3, Color4 } from '@dcl/sdk/math'
import { TEAM_SPAWN_T, TEAM_SPAWN_CT, ARENA_CENTER } from './paintballArena'

export type KillFeedEntry = { text: string; color: Color4; t: number }
export type ScoreEntry = { id: string; name: string; score: number; kills: number }

// ─────────────────────────────────────────────────────────────────────────────
// ESTADO GLOBAL — leído por ui.tsx
// ─────────────────────────────────────────────────────────────────────────────
export const PaintballState = {
  inviteOpen:  false,   // modal de invitación visible
  inGame:      false,   // jugador en partida activa
  health:      3,       // vidas restantes (0-3)
  kills:       0,       // kills de la ronda
  timeLeft:    300,     // segundos restantes (5 min)
  respawning:  false,   // mostrando countdown de respawn
  respawnCD:   0,       // segundos para el respawn
  shotFlash:   false,   // flash de "fuiste golpeado"
  shotFlashAlpha: 0.0,
  shotFlashColor: Color4.create(0.9, 0.05, 0.05, 1), // color del atacante
  hitFlash:    false,   // flash de "golpeaste a alguien"
  hitFlashAlpha: 0.0,
  radarMsg:    '',      // mensaje de radar del bot más cercano
  gameOver:    false,   // ronda terminada
  gameMsg:     '',      // mensaje final ("¡Ganaste!" / "Game Over")
  lobbyOpen:   false,   // lobby de espera
  waitingForPlayers: false, // flag si estamos esperando en el lobby
  isSolo:      false,   // jugando contra bots
  isShooting:  false,   // animar retroceso del arma en UI
  announcerMsg: '',     // mensaje UT (DOUBLE KILL!)
  announcerTimer: 0,    // timer del mensaje
  announcerBig:  false, // resaltar announcer (combos altos)

  // ── Score & Combo ──
  score:       0,       // puntaje acumulado de la ronda
  combo:       0,       // multiplicador de combo actual (0 = sin combo)
  comboTimer:  0,       // segundos restantes para mantener el combo
  bestCombo:   0,       // mejor combo de la ronda

  // ── Kill feed ──
  killFeed:    [] as KillFeedEntry[],

  // ── Scoreboard / presencia compartida (todos los jugadores activos) ──
  scoreboard:  [] as ScoreEntry[],
  playersInArena: 0,   // cuántos jugadores están en partida ahora mismo
  botsEnabled: true,   // ELECCIÓN del jugador en el menú: jugar con bots (true) o sin (false)
  matchBots:   false,  // reflejado de la partida sincronizada: ¿esta partida tiene bots?

  // ── Estado de la partida (lobby/countdown/rondas, sincronizado por host) ──
  matchPhase:  0,      // 0 idle, 1 countdown, 2 active, 3 results
  matchMode:   0,      // 0 ffa, 1 team
  matchTimer:  0,      // segundos restantes de la fase actual
  teamScoreT:  0,      // puntaje Terroristas
  teamScoreCT: 0,      // puntaje Counter-Terroristas
  matchWinner: 0,      // 0 none, 1 T, 2 CT
  myTeam:      0,      // 0 ninguno, 1 T, 2 CT

  // ── Power-ups activos (segundos restantes) ──
  rapidFireTimer:  0,
  tripleShotTimer: 0,
  shieldTimer:     0,
}

// Duración de power-ups (segundos)
export const POWERUP_DURATION = { rapid: 9, triple: 9, shield: 6 }
// Ventana del combo (segundos sin kill antes de resetear)
export const COMBO_WINDOW = 4.0

// ─────────────────────────────────────────────────────────────────────────────
// ZONA PAINTBALL — coordenadas del campo (área del bosque ampliada)
// ─────────────────────────────────────────────────────────────────────────────
export const PB_ZONE = {
  spawnA: TEAM_SPAWN_T,
  spawnB: TEAM_SPAWN_CT,
  center: ARENA_CENTER
}
