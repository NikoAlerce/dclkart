// ─── Paintball — Mensajería multiplayer (eventos transitorios) ────────────────
// El estado continuo (posición de los bots) va por syncEntity. Los eventos
// puntuales (impactos, muertes, disparos) van por MessageBus. MessageBus está
// marcado @deprecated en SDK7 pero sigue siendo el primitivo documentado para
// esto (docs: serverless-multiplayer); lo aislamos acá por si hay que migrar a
// BinaryMessageBus en el futuro.

import { MessageBus } from '@dcl/sdk/message-bus'

export const pbBus = new MessageBus()

export const PB_MSG = {
  botDamage: 'pbBotDmg', // tirador → host: "le pegué al bot N"
  botKilled: 'pbBotKill', // host → todos: "el bot N murió, lo mató X"
  botShot: 'pbBotShot', // host → todos: dibujar el disparo de un bot (+ daño a la víctima)
  playerHit: 'pbPlayerHit', // atacante → víctima: "te pegué" (PvP)
  playerKilled: 'pbPlayerKill', // víctima → atacante: "me mataste" (acredita el kill PvP)
  powerupTaken: 'pbPwrTaken', // recolector → host: "agarré el power-up del slot N"
  playerShot: 'pbPlayerShot', // jugador → todos: dibujar su disparo (tracer/splat)
  score: 'pbScore', // cada jugador en partida difunde su score (scoreboard)
  presence: 'pbPresence', // todos los clientes difunden si están en arena (lobby)
  startMatch: 'pbStartMatch', // jugador → host: arrancar countdown con un modo
  teamScore: 'pbTeamScore' // atacante → host: sumar punto a un equipo
}

export type Vec = { x: number; y: number; z: number }

export type BotDamageMsg = { bot: number; by: string }
export type BotKilledMsg = { bot: number; by: string; name: string; pos: Vec; r: number; g: number; b: number }
export type BotShotMsg = { bot: number; from: Vec; to: Vec; r: number; g: number; b: number; hit: string; normal: Vec }
export type PlayerHitMsg = { target: string; by: string; r: number; g: number; b: number }
export type PlayerKilledMsg = { by: string; name: string }
export type PlayerShotMsg = { id: string; from: Vec; to: Vec; normal: Vec; r: number; g: number; b: number }
export type PowerupTakenMsg = { slot: number; by: string }
export type ScoreMsg = { id: string; name: string; score: number; kills: number; team: number }
export type PresenceMsg = { id: string; inArena: boolean }
export type StartMatchMsg = { mode: number; bots: boolean } // mode: 0 ffa, 1 team; bots: con/sin bots
export type TeamScoreMsg = { team: number } // 1 = T, 2 = CT
