// ─── Power-ups del paintball (pool sincronizado, host-authoritative) ───────────
// NOTA: reconstruido tras pérdida de datos. Pool de slots con enumId estable; el
// host activa/desactiva (kind + anchor); cada cliente anima su hijo local y detecta
// si SU jugador lo recoge → aplica efecto local + avisa al host (powerupTaken).

import { engine, Transform, MeshRenderer, Material, TextShape, Billboard, Schemas, Entity } from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { isHost, getMyId, SYNC_IDS } from './net'
import { pbBus, PB_MSG, PowerupTakenMsg } from './paintballNet'
import { PaintballState } from './paintballState'
import { WORLD_Y_OFFSET } from './spawnConfig'

export const PowerupSlot = engine.defineComponent('pbPowerupSlot', {
  kind: Schemas.Int,     // 0 rapidFire, 1 tripleShot, 2 shield
  active: Schemas.Boolean
})

const MAX_SLOTS = 3
const EFFECT_SECONDS = 10
const PICKUP_RADIUS = 2.2

// kind → icono + color
const KINDS = [
  { icon: '⚡', color: Color3.create(1.0, 0.9, 0.1) },
  { icon: '✦', color: Color3.create(0.3, 1.0, 0.5) },
  { icon: '\u{1F6E1}', color: Color3.create(0.3, 0.6, 1.0) }
]

type SlotData = {
  root: Entity
  visual: Entity
  sphere: Entity
  halo: Entity
  icon: Entity
  slot: number
  bob: number
  lastKind: number
  takenLocally: boolean
}

const slots: SlotData[] = []

const SPAWN_ANCHORS = [
  Vector3.create(-145.0, 13.5 + WORLD_Y_OFFSET, 25.0),
  Vector3.create(-55.0, 13.5 + WORLD_Y_OFFSET, 85.0),
  Vector3.create(-100.0, 15.5 + WORLD_Y_OFFSET, 55.0),
  Vector3.create(-120.0, 13.5 + WORLD_Y_OFFSET, -10.0),
  Vector3.create(-80.0, 15.5 + WORLD_Y_OFFSET, 140.0),
  Vector3.create(-30.0, 13.5 + WORLD_Y_OFFSET, 30.0)
]

let spawnTimer = 6.0

export function setupPowerups() {
  for (let s = 0; s < MAX_SLOTS; s++) {
    const root = engine.addEntity()
    Transform.create(root, { position: Vector3.create(0, -100, 0), scale: Vector3.Zero() })
    PowerupSlot.create(root, { kind: 0, active: false })

    // Hijo local animado (no sincronizado)
    const visual = engine.addEntity()
    Transform.create(visual, { parent: root, position: Vector3.Zero(), scale: Vector3.One() })

    const sphere = engine.addEntity()
    Transform.create(sphere, { parent: visual, position: Vector3.Zero(), scale: Vector3.create(0.5, 0.5, 0.5) })
    MeshRenderer.setSphere(sphere)

    const halo = engine.addEntity()
    Transform.create(halo, {
      parent: visual,
      rotation: Quaternion.fromEulerDegrees(90, 0, 0),
      scale: Vector3.create(2.4, 0.08, 2.4)
    })
    MeshRenderer.setCylinder(halo)

    const icon = engine.addEntity()
    Transform.create(icon, { parent: visual, position: Vector3.create(0, 2.6, 0), scale: Vector3.One() })
    TextShape.create(icon, { text: '', fontSize: 5, textColor: Color4.White(), outlineWidth: 0.15, outlineColor: Color3.fromInts(0, 0, 0) })
    Billboard.create(icon)

    // Sincronizar posición + estado del slot. Todos lo crean con el mismo enumId.
    syncEntity(root, [Transform.componentId, PowerupSlot.componentId], SYNC_IDS.powerupBase + s)

    slots.push({ root, visual, sphere, halo, icon, slot: s, bob: Math.random() * Math.PI * 2, lastKind: -1, takenLocally: false })
  }

  // El host oculta el slot recogido (autoridad).
  pbBus.on(PB_MSG.powerupTaken, (m: PowerupTakenMsg) => {
    if (!isHost()) return
    const sd = slots[m.slot]
    if (!sd) return
    deactivateSlot(sd)
  })

  engine.addSystem(powerupSystem)
}

function activateSlot(sd: SlotData) {
  const ps = PowerupSlot.getMutable(sd.root)
  ps.kind = Math.floor(Math.random() * KINDS.length)
  ps.active = true
  const anchor = SPAWN_ANCHORS[Math.floor(Math.random() * SPAWN_ANCHORS.length)]
  const t = Transform.getMutable(sd.root)
  t.position = Vector3.clone(anchor)
  t.scale = Vector3.One()
  sd.takenLocally = false
}

function deactivateSlot(sd: SlotData) {
  const ps = PowerupSlot.getMutable(sd.root)
  ps.active = false
  const t = Transform.getMutable(sd.root)
  t.position = Vector3.create(0, -100, 0)
  t.scale = Vector3.Zero()
}

function applyEffect(kind: number) {
  if (kind === 0) PaintballState.rapidFireTimer = EFFECT_SECONDS
  else if (kind === 1) PaintballState.tripleShotTimer = EFFECT_SECONDS
  else if (kind === 2) PaintballState.shieldTimer = EFFECT_SECONDS
}

function powerupSystem(dt: number) {
  // Host: activar slots inactivos cada cierto tiempo (solo en partida activa)
  if (isHost() && PaintballState.matchPhase === 2) {
    spawnTimer -= dt
    if (spawnTimer <= 0) {
      spawnTimer = 8.0 + Math.random() * 6.0
      const free = slots.find((s) => !PowerupSlot.get(s.root).active)
      if (free) activateSlot(free)
    }
  }

  const me = Transform.getOrNull(engine.PlayerEntity)

  for (const sd of slots) {
    const ps = PowerupSlot.getOrNull(sd.root)
    if (!ps) continue
    const vt = Transform.getMutableOrNull(sd.visual)

    if (ps.active && vt) {
      sd.bob += dt
      vt.position.y = Math.sin(sd.bob * 2) * 0.25
      vt.rotation = Quaternion.fromEulerDegrees(0, sd.bob * 90, 0)
      if (sd.lastKind !== ps.kind) {
        sd.lastKind = ps.kind
        const k = KINDS[ps.kind] || KINDS[0]
        Material.setPbrMaterial(sd.sphere, { albedoColor: Color4.create(k.color.r, k.color.g, k.color.b, 1), emissiveColor: k.color, emissiveIntensity: 4.0 })
        Material.setPbrMaterial(sd.halo, { albedoColor: Color4.create(k.color.r, k.color.g, k.color.b, 0.5), emissiveColor: k.color, emissiveIntensity: 3.0, transparencyMode: 2 })
        TextShape.getMutable(sd.icon).text = k.icon
      }
    }

    // Pickup: si MI jugador está cerca de un slot activo, lo recojo.
    if (ps.active && !sd.takenLocally && me && PaintballState.inGame) {
      const t = Transform.get(sd.root)
      const dx = me.position.x - t.position.x
      const dy = me.position.y - t.position.y
      const dz = me.position.z - t.position.z
      if (dx * dx + dy * dy + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
        sd.takenLocally = true
        applyEffect(ps.kind)
        pbBus.emit(PB_MSG.powerupTaken, { slot: sd.slot, by: getMyId() })
        if (isHost()) deactivateSlot(sd)
      }
    }
  }
}

/** Persistente/compartido: no se limpia al reiniciar una ronda local. */
export function clearPowerups() {
  // no-op (los slots son compartidos y los maneja el host)
}
