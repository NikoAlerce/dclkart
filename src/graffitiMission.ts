// ─── Side-game "Tag the City" ─────────────────────────────────────────────────
// Se accede SOLO hablando con el NPC (cerca del spawn). Al aceptar, te lleva al área
// DUST (= arena de paintball, dentro de track.glb), te equipa el aerosol y aparecen
// spots marcados que tenés que TAGUEAR (pintar cerca) contrarreloj. Personal/local:
// cada jugador hace su propia corrida (los marcadores y el progreso son locales).

import {
  engine, Transform, MeshRenderer, Material, TextShape, Billboard,
  pointerEventsSystem, InputAction, MeshCollider, ColliderLayer, Entity
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { GraffitiState, GraffitiMission } from './graffitiState'
import { onGraffitiPaint } from './graffiti'
import { FFA_SPAWNS } from './paintballArena'

const MISSION_TIME = 150        // segundos para completar
const TAG_RADIUS   = 5.0        // qué tan cerca hay que pintar para taguear un spot
// NPC cerca del spawn de karts (tunable). Y ≈ piso del paddock.
const NPC_POS = Vector3.create(-193.0, 64.5, 94.0)
const SPAWN_BACK = Vector3.create(-197.4, 66.0, 89.8) // a dónde volver al salir

type Target = { pos: Vector3; marker: Entity; tagged: boolean }
const targets: Target[] = []
let timerAccum = 0

// Spots a taguear: reusamos los FFA_SPAWNS del paintball, que se calibran EN RUNTIME
// (raycast por punto) al piso real del dust multinivel → garantizan estar SOBRE el piso,
// no debajo. Los flotamos un toque para que el aro se vea. (Se pueden afinar a paredes.)
function buildTargetSpots(): Vector3[] {
  return FFA_SPAWNS.map(s => Vector3.create(s.x, s.y + 1.8, s.z))
}

export function setupGraffitiMission() {
  // ── NPC (primitivas, robusto): cuerpo + cabeza + cartel flotante + collider de clic ──
  const npc = engine.addEntity()
  Transform.create(npc, { position: NPC_POS })

  const body = engine.addEntity()
  Transform.create(body, { parent: npc, position: Vector3.create(0, 0.9, 0), scale: Vector3.create(0.55, 1.8, 0.55) })
  MeshRenderer.setCylinder(body)
  Material.setPbrMaterial(body, { albedoColor: Color4.create(0.2, 0.2, 0.25, 1), emissiveColor: Color3.create(0.6, 0.2, 0.9), emissiveIntensity: 0.6 })

  const head = engine.addEntity()
  Transform.create(head, { parent: npc, position: Vector3.create(0, 2.0, 0), scale: Vector3.create(0.5, 0.5, 0.5) })
  MeshRenderer.setSphere(head)
  Material.setPbrMaterial(head, { albedoColor: Color4.create(0.9, 0.75, 0.6, 1) })

  const sign = engine.addEntity()
  Transform.create(sign, { parent: npc, position: Vector3.create(0, 3.0, 0), scale: Vector3.One() })
  TextShape.create(sign, { text: '🎨 TAG THE CITY', fontSize: 3, textColor: Color4.create(1, 0.4, 0.9, 1), outlineWidth: 0.18, outlineColor: Color4.Black() })
  Billboard.create(sign)

  const clicker = engine.addEntity()
  Transform.create(clicker, { parent: npc, position: Vector3.create(0, 1.2, 0), scale: Vector3.create(1.6, 2.6, 1.6) })
  MeshCollider.setBox(clicker, ColliderLayer.CL_POINTER)
  pointerEventsSystem.onPointerDown(
    { entity: clicker, opts: { button: InputAction.IA_POINTER, hoverText: '🎨  Tag the City', maxDistance: 14 } },
    () => { if (!GraffitiMission.active) GraffitiMission.inviteOpen = !GraffitiMission.inviteOpen }
  )

  // ── Detectar tagueos: cuando el jugador local pinta cerca de un spot sin taguear ──
  onGraffitiPaint((x, y, z) => {
    if (!GraffitiMission.active || GraffitiMission.completed) return
    for (const t of targets) {
      if (t.tagged) continue
      const dx = t.pos.x - x, dy = t.pos.y - y, dz = t.pos.z - z
      if (dx * dx + dy * dy + dz * dz < TAG_RADIUS * TAG_RADIUS) {
        t.tagged = true
        GraffitiMission.tagged++
        Transform.getMutable(t.marker).scale = Vector3.Zero() // apagar el marcador tagueado
        if (GraffitiMission.tagged >= GraffitiMission.total) completeMission()
        break
      }
    }
  })

  engine.addSystem(missionSystem)
}

export function startMission() {
  GraffitiMission.inviteOpen = false
  GraffitiMission.active = true
  GraffitiMission.completed = false
  GraffitiMission.tagged = 0
  GraffitiMission.resultMsg = ''
  GraffitiState.sprayMode = true   // equipar aerosol
  timerAccum = 0
  GraffitiMission.timeLeft = MISSION_TIME

  clearTargets()
  const spots = buildTargetSpots()
  GraffitiMission.total = spots.length
  for (const p of spots) {
    const marker = engine.addEntity()
    Transform.create(marker, { position: p, scale: Vector3.create(2.2, 2.2, 2.2) })
    // Aro emisivo (cilindro chato) que flota y gira.
    const ring = engine.addEntity()
    Transform.create(ring, { parent: marker, rotation: Quaternion.fromEulerDegrees(90, 0, 0), scale: Vector3.create(1.0, 0.08, 1.0) })
    MeshRenderer.setCylinder(ring)
    Material.setPbrMaterial(ring, { albedoColor: Color4.create(1, 0.3, 0.85, 1), emissiveColor: Color3.create(1, 0.2, 0.85), emissiveIntensity: 5, transparencyMode: 2 })
    const lbl = engine.addEntity()
    Transform.create(lbl, { parent: marker, position: Vector3.create(0, 1.0, 0), scale: Vector3.One() })
    TextShape.create(lbl, { text: '🎯', fontSize: 4, textColor: Color4.create(1, 0.4, 0.9, 1), outlineWidth: 0.15, outlineColor: Color4.Black() })
    Billboard.create(lbl)
    targets.push({ pos: p, marker, tagged: false })
  }

  // Llevar al jugador a un spawn calibrado del dust (sobre el piso real).
  const e = FFA_SPAWNS[0]
  movePlayerTo({ newRelativePosition: Vector3.create(e.x, e.y + 0.5, e.z) }).catch(() => {})
}

function completeMission() {
  GraffitiMission.completed = true
  const used = Math.ceil(MISSION_TIME - GraffitiMission.timeLeft)
  GraffitiMission.resultMsg = `🏆 ¡Tag the City completado en ${used}s!`
}

export function exitMission() {
  GraffitiMission.active = false
  GraffitiMission.completed = false
  GraffitiMission.inviteOpen = false
  GraffitiState.sprayMode = false
  clearTargets()
  movePlayerTo({ newRelativePosition: SPAWN_BACK }).catch(() => {})
}

function clearTargets() {
  for (const t of targets) { try { engine.removeEntityWithChildren(t.marker) } catch (e) { } }
  targets.length = 0
}

function missionSystem(dt: number) {
  // Animar los marcadores (girar para que llamen la atención).
  for (const t of targets) {
    if (t.tagged) continue
    const mt = Transform.getMutableOrNull(t.marker)
    if (mt) mt.rotation = Quaternion.multiply(mt.rotation, Quaternion.fromEulerDegrees(0, dt * 70, 0))
  }
  // Timer.
  if (GraffitiMission.active && !GraffitiMission.completed) {
    timerAccum += dt
    GraffitiMission.timeLeft = Math.max(0, MISSION_TIME - timerAccum)
    if (GraffitiMission.timeLeft <= 0) {
      GraffitiMission.completed = true
      GraffitiMission.resultMsg = `⏱ Se acabó el tiempo — ${GraffitiMission.tagged}/${GraffitiMission.total} tagueados`
    }
  }
}
