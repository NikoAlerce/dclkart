// ─── Efectos de sonido del paintball ──────────────────────────────────────────
// Usa AudioSource (SDK7). Pool de entidades emisoras reposicionables para solapar
// sonidos (createOrReplace con playing:true retriggerea el clip).
// Archivos en assets/sounds/: shoot.mp3, impact.mp3, footstep.mp3 (si faltan, no
// suena nada pero corre sin errores).

import { engine, Transform, AudioSource, Entity } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { PaintballState } from './paintballState'

const SND_SHOOT = 'assets/sounds/shoot.mp3'
const SND_IMPACT = 'assets/sounds/impact.mp3'
const SND_STEP = 'assets/sounds/footstep.mp3'

const POOL = 10
const pool: Entity[] = []
let cursor = 0

export function setupAudio() {
  for (let i = 0; i < POOL; i++) {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(0, 0, 0) })
    pool.push(e)
  }
  engine.addSystem(footstepSystem)
}

function playAt(src: string, pos: Vector3, volume: number, global: boolean) {
  if (pool.length === 0) return
  const e = pool[cursor]
  cursor = (cursor + 1) % POOL
  Transform.getMutable(e).position = Vector3.clone(pos)
  AudioSource.createOrReplace(e, { audioClipUrl: src, playing: true, loop: false, volume, global })
}

/** Disparo del jugador local: global (siempre audible). */
export function playPlayerShoot() {
  const p = Transform.getOrNull(engine.PlayerEntity)
  playAt(SND_SHOOT, p ? p.position : Vector3.Zero(), 0.5, true)
}

/** Disparo de un bot (u otro jugador): spatial en su posición. */
export function playShootAt(pos: Vector3) {
  playAt(SND_SHOOT, pos, 0.45, false)
}

/** Impacto/salpicadura: spatial en el punto de impacto. */
export function playImpactAt(pos: Vector3) {
  playAt(SND_IMPACT, pos, 0.55, false)
}

// ── Pasos: pacing por distancia recorrida en el plano (XZ) ─────────────────────
let lastPos: Vector3 | null = null
let stepAccum = 0
const STEP_DISTANCE = 2.2

function footstepSystem(_dt: number) {
  // Solo dentro del paintball (antes sonaban pasos por todo el World).
  if (!PaintballState.inGame) { lastPos = null; return }
  const t = Transform.getOrNull(engine.PlayerEntity)
  if (!t) return
  const p = t.position
  if (!lastPos) { lastPos = Vector3.clone(p); return }
  const dx = p.x - lastPos.x
  const dz = p.z - lastPos.z
  const d = Math.sqrt(dx * dx + dz * dz)
  lastPos = Vector3.clone(p)
  if (d > 6) { stepAccum = 0; return } // teletransporte → ignorar
  stepAccum += d
  if (stepAccum >= STEP_DISTANCE) {
    stepAccum = 0
    playAt(SND_STEP, p, 0.35, true)
  }
}
