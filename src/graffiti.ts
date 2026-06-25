// ─── Graffiti / Aerosol (v1 en-sesión, sincronizado, FIFO) ────────────────────
// Equipás el aerosol → un rayo desde la cámara busca la superficie que mirás → al
// clickear se pinta un "calco" (plano con textura suave) orientado a la superficie,
// del color elegido. Se puede pintar en cualquier lado (cualquier collider físico),
// en muchos colores y encima de otros.
//
// SINCRONIZADO: pool de slots sincronizados (syncEntity) — todos los que están en la
// sesión ven los graffitis, incluso los que entran después. El HOST es autoritativo:
// recibe el pedido de pintura (MessageBus) y escribe el slot; el FIFO reusa el slot
// más viejo (menor seq) cuando se llena → "se borran los más viejos".
// (Persistencia entre sesiones = backend, pendiente para v2.)

import {
  engine, Transform, MeshRenderer, Material, Schemas, Entity,
  InputAction, PointerEventType, inputSystem,
  Raycast, RaycastResult, RaycastQueryType, ColliderLayer, PlayerIdentityData
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { MessageBus } from '@dcl/sdk/message-bus'
import { isHost, SYNC_IDS } from './net'
import { GraffitiState, GRAFFITI_PALETTE } from './graffitiState'
import { RaceState } from './raceState'

const graffitiBus = new MessageBus()

const MAX_GRAFFITI = 100          // cupo (FIFO): al pasarse, se reusa el más viejo
const SPRAY_TEX    = 'assets/textures/glow_soft.png'  // mancha circular suave (alpha)
const SPRAY_RANGE  = 40           // alcance del aerosol (m)

// Componente sincronizado por slot. El visual (plano) se deriva localmente de estos datos.
const GraffitiData = engine.defineComponent('graffitiData', {
  active: Schemas.Boolean,
  x: Schemas.Float, y: Schemas.Float, z: Schemas.Float,   // posición mundial del impacto
  nx: Schemas.Float, ny: Schemas.Float, nz: Schemas.Float, // normal de la superficie
  color: Schemas.Int,    // índice en GRAFFITI_PALETTE
  size: Schemas.Float,
  seq: Schemas.Int       // orden de creación → el FIFO reusa el de menor seq
})

type Slot = { root: Entity; visual: Entity; lastSeq: number; lastActive: boolean }
const slots: Slot[] = []

type PaintMsg = { x: number; y: number; z: number; nx: number; ny: number; nz: number; color: number; size: number }

let rayEntity: Entity
let canEntity: Entity | null = null
let lastCanColor = -1

export function setupGraffiti() {
  // ── Pool de slots sincronizados ──
  for (let i = 0; i < MAX_GRAFFITI; i++) {
    const root = engine.addEntity()
    GraffitiData.create(root, { active: false, x: 0, y: -1000, z: 0, nx: 0, ny: 1, nz: 0, color: 0, size: 1, seq: 0 })

    // Visual TOP-LEVEL (no hijo): lo posicionamos en mundo desde los datos del slot.
    const visual = engine.addEntity()
    Transform.create(visual, { position: Vector3.create(0, -1000, 0), scale: Vector3.Zero() })
    MeshRenderer.setPlane(visual)

    syncEntity(root, [GraffitiData.componentId], SYNC_IDS.graffitiBase + i)
    slots.push({ root, visual, lastSeq: -1, lastActive: false })
  }

  // ── El host aplica la pintura al pool (autoridad) ──
  graffitiBus.on('gPaint', (m: PaintMsg) => {
    if (!isHost()) return
    hostAddGraffiti(m)
  })

  // ── Rayo del aerosol (hijo de la cámara, apunta hacia adelante) ──
  rayEntity = engine.addEntity()
  Transform.create(rayEntity, { parent: engine.CameraEntity, position: Vector3.Zero() })

  engine.addSystem(graffitiSystem)
}

// El host elige el slot: primero uno libre; si están todos usados, el de MENOR seq
// (el más viejo) → FIFO. seq derivado del máximo presente → robusto a cambio de host.
function hostAddGraffiti(m: PaintMsg) {
  let maxSeq = 0
  for (const s of slots) { const d = GraffitiData.get(s.root); if (d.seq > maxSeq) maxSeq = d.seq }
  const seq = maxSeq + 1

  let target: Slot | null = null
  let minSeq = Infinity
  for (const s of slots) {
    const d = GraffitiData.get(s.root)
    if (!d.active) { target = s; break }
    if (d.seq < minSeq) { minSeq = d.seq; target = s }
  }
  if (!target) return

  const dd = GraffitiData.getMutable(target.root)
  dd.active = true
  dd.x = m.x; dd.y = m.y; dd.z = m.z
  dd.nx = m.nx; dd.ny = m.ny; dd.nz = m.nz
  dd.color = m.color; dd.size = m.size; dd.seq = seq
}

// Coloca/colorea el plano del slot desde sus datos sincronizados.
function applySlotVisual(s: Slot, d: ReturnType<typeof GraffitiData.get>) {
  const vt = Transform.getMutable(s.visual)
  if (!d.active) { vt.scale = Vector3.Zero(); return }

  const n = Vector3.normalize(Vector3.create(d.nx, d.ny, d.nz))
  // Offset por la normal: evita z-fighting con la superficie y ordena las capas
  // (más nuevo = más afuera) para que "pintar encima" se vea por encima.
  const off = 0.02 + (d.seq % 40) * 0.0015
  vt.position = Vector3.add(Vector3.create(d.x, d.y, d.z), Vector3.scale(n, off))
  // El plano mira a lo largo de la normal (queda apoyado en la superficie).
  const up = Math.abs(n.y) > 0.9 ? Vector3.Forward() : Vector3.Up()
  vt.rotation = Quaternion.lookRotation(n, up)
  vt.scale = Vector3.create(d.size, d.size, d.size)

  const c = GRAFFITI_PALETTE[d.color] || GRAFFITI_PALETTE[0]
  Material.setPbrMaterial(s.visual, {
    albedoColor: Color4.create(c.r, c.g, c.b, 1),
    emissiveColor: c,
    emissiveIntensity: 0.45,
    texture: Material.Texture.Common({ src: SPRAY_TEX }),
    alphaTexture: Material.Texture.Common({ src: SPRAY_TEX }),
    transparencyMode: 2, // alpha blend → bordes suaves de la mancha
    roughness: 1, metallic: 0
  })
}

// Aerosol en mano (cilindro procedural teñido del color elegido) — feedback visual.
function updateCan() {
  if (GraffitiState.sprayMode && !RaceState.isOccupied) {
    if (!canEntity) {
      canEntity = engine.addEntity()
      Transform.create(canEntity, {
        parent: engine.CameraEntity,
        position: Vector3.create(0.35, -0.32, 0.7),
        rotation: Quaternion.fromEulerDegrees(8, 0, 0),
        scale: Vector3.create(0.07, 0.22, 0.07)
      })
      MeshRenderer.setCylinder(canEntity)
      lastCanColor = -1
    }
    if (lastCanColor !== GraffitiState.selectedColor) {
      lastCanColor = GraffitiState.selectedColor
      const c = GRAFFITI_PALETTE[GraffitiState.selectedColor] || GRAFFITI_PALETTE[0]
      Material.setPbrMaterial(canEntity, { albedoColor: Color4.create(c.r, c.g, c.b, 1), emissiveColor: c, emissiveIntensity: 0.3, roughness: 0.6, metallic: 0.2 })
    }
  } else if (canEntity) {
    engine.removeEntity(canEntity); canEntity = null
  }
}

function graffitiSystem(_dt: number) {
  // 1) Render: actualizar los slots que cambiaron (no por frame).
  for (const s of slots) {
    const d = GraffitiData.getOrNull(s.root)
    if (!d) continue
    if (d.seq !== s.lastSeq || d.active !== s.lastActive) {
      s.lastSeq = d.seq; s.lastActive = d.active
      applySlotVisual(s, d)
    }
  }

  // 2) Aerosol en mano.
  updateCan()

  // 3) Rayo + pintar (solo en modo aerosol, a pie).
  if (GraffitiState.sprayMode && !RaceState.isOccupied) {
    if (!Raycast.has(rayEntity)) {
      Raycast.createOrReplace(rayEntity, {
        direction: { $case: 'localDirection', localDirection: Vector3.create(0, 0, 1) },
        maxDistance: SPRAY_RANGE,
        queryType: RaycastQueryType.RQT_HIT_FIRST,
        continuous: true,
        collisionMask: ColliderLayer.CL_PHYSICS
      })
    }
    // No pintar si el clic fue sobre la UI (paleta/botón) hace un instante.
    const uiClick = Date.now() - GraffitiState.lastUiClickTime < 300
    if (!uiClick && inputSystem.isTriggered(InputAction.IA_POINTER, PointerEventType.PET_DOWN)) {
      const rr = RaycastResult.getOrNull(rayEntity)
      if (rr && rr.hits.length > 0) {
        const hit = rr.hits.find(h =>
          h.position && h.normalHit &&
          h.entityId !== engine.PlayerEntity &&
          !PlayerIdentityData.has(h.entityId as any)
        )
        if (hit && hit.position && hit.normalHit) {
          graffitiBus.emit('gPaint', {
            x: hit.position.x, y: hit.position.y, z: hit.position.z,
            nx: hit.normalHit.x, ny: hit.normalHit.y, nz: hit.normalHit.z,
            color: GraffitiState.selectedColor, size: GraffitiState.brushSize
          })
        }
      }
    }
  } else if (Raycast.has(rayEntity)) {
    Raycast.deleteFrom(rayEntity)
    RaycastResult.deleteFrom(rayEntity)
  }
}
