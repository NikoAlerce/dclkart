// ─── Networking — Host authority ──────────────────────────────────────────────
// Decentraland sincroniza avatares/voz/chat solo. El ESTADO del juego hay que
// sincronizarlo a mano (docs: serverless-multiplayer). Para NPCs simulados (el
// monstruo, los bots de paintball, los power-ups) elegimos UN jugador "host" que
// corre la simulación y la propaga con syncEntity; los demás solo la reciben.
//
// Elección de host (determinística y robusta, sin servidor):
//   host = el address más bajo entre (yo + todos los avatares visibles).
// Re-escaneamos cada 2s, así si el host se va, otro toma la posta automáticamente.

import { engine, PlayerIdentityData } from '@dcl/sdk/ecs'
import { myProfile } from '@dcl/sdk/network'

let myId = ''
let hostId = ''
let scanAccum = 0
const RESCAN_INTERVAL = 2.0

// Rango de enumIds para syncEntity (deben ser únicos y estables, < 8000).
// Karts usan 1-10. Reservamos bloques altos para no chocar.
export const SYNC_IDS = {
  monster: 2000,
  botBase: 2100,     // bots: 2100..2199
  powerupBase: 2300, // power-ups: 2300..2399
  paintballState: 2500,
  match: 2600, // estado de la partida (countdown/rondas/scores de equipo)
  highScore: 2700 // récord histórico (cartel afuera de la arena)
}

export function setupNet() {
  myId = myProfile?.userId ?? ''
  rescan()
  engine.addSystem(netSystem)
}

function rescan() {
  if (myId === '') myId = myProfile?.userId ?? ''
  let lowest = myId
  for (const [entity, idData] of engine.getEntitiesWith(PlayerIdentityData)) {
    const a = idData.address
    if (!a || a.startsWith('bot_')) continue // ignorar bots locales del paintball
    
    // Para el jugador local, usar myId (userId) en lugar de su address de ethereum,
    // garantizando coherencia si son distintos en la preview local (ej: cuentas guest).
    const isMe = entity === engine.PlayerEntity
    const compareVal = isMe && myId ? myId : a
    
    if (lowest === '' || compareVal < lowest) lowest = compareVal
  }
  hostId = lowest
}

function netSystem(dt: number) {
  scanAccum += dt
  if (scanAccum >= RESCAN_INTERVAL) {
    scanAccum = 0
    rescan()
  }
}

/** ¿Este cliente es el host que simula los NPCs? (true también si estás solo) */
export function isHost(): boolean {
  return myId === '' || hostId === myId
}

export function getMyId(): string {
  return myId
}
