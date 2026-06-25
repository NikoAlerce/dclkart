// ─── Graffiti persistente por PANELES (textura PNG servida por el backend) ─────
// Cada "panel" es una pared plana pintable: un plano en la escena que muestra el PNG que
// el backend va dibujando con las manchas. Liviano (1 textura por pared), ilimitado (es
// una imagen) y persistente entre sesiones (el backend lo guarda). La escena NO dibuja la
// textura — solo manda las manchas (POST) y recarga el PNG cuando cambia.
//
// ⚠️ CONFIG NECESARIA:
//   1) API_BASE = URL de tu backend deployado (ver graffiti-backend/README.md).
//   2) Agregá el host de API_BASE a scene.json → "allowedMediaHostnames".
//   3) Calibrá los PANELS (center/normal/up/medidas) a paredes reales del mundo.

import { engine, Transform, MeshRenderer, MeshCollider, ColliderLayer, Material, Entity } from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color3, Color4 } from '@dcl/sdk/math'

// 👉 URL del backend deployado (sin barra final).
export const API_BASE = 'https://graffiti-backend-k8qi.onrender.com'

type PanelCfg = { id: string; center: Vector3; normal: Vector3; up: Vector3; width: number; height: number }

// Tableros pintables. Mismo `id` que en el backend. center/normal/up en COORDS DE MUNDO,
// medidas en metros. ⚠️ POSICIONES DE PRUEBA: tres tableros frente al spawn para probar.
// Movelos donde quieras (o calibralos a paredes reales del dust/plaza).
export const PANELS: PanelCfg[] = [
  { id: 'wallA', center: Vector3.create(-197.0, 65.5, 94.0), normal: Vector3.create(0, 0, -1), up: Vector3.create(0, 1, 0), width: 6, height: 4 },
  { id: 'wallB', center: Vector3.create(-190.5, 65.5, 94.0), normal: Vector3.create(0, 0, -1), up: Vector3.create(0, 1, 0), width: 6, height: 4 },
  { id: 'wallC', center: Vector3.create(-203.5, 65.5, 94.0), normal: Vector3.create(0, 0, -1), up: Vector3.create(0, 1, 0), width: 6, height: 4 }
]

type PanelRT = { cfg: PanelCfg; entity: Entity; right: Vector3; nrm: Vector3; upn: Vector3; version: number }
const rts: PanelRT[] = []

// Batch de manchas por panel, se vacía cada FLUSH_MS en un solo POST.
type Dab = { u: number; v: number; r: number; g: number; b: number; size: number }
const pending = new Map<string, Dab[]>()
const FLUSH_MS = 180
let flushAccum = 0
let pollAccum = 0

export function setupGraffitiPanels() {
  if (API_BASE.includes('TU-BACKEND')) {
    console.log('[GRAFFITI] API_BASE sin configurar → paneles persistentes deshabilitados (segui usando los calcos en-sesion).')
    return
  }
  for (const cfg of PANELS) {
    const nrm = Vector3.normalize(cfg.normal)
    const upn = Vector3.normalize(cfg.up)
    const right = Vector3.normalize(Vector3.cross(upn, nrm))
    const rot = Quaternion.lookRotation(nrm, upn)
    // Tablero de fondo (opaco) → hace visible la pared pintable. Detrás del PNG.
    const board = engine.addEntity()
    Transform.create(board, {
      position: Vector3.add(cfg.center, Vector3.scale(nrm, 0.01)),
      rotation: rot,
      scale: Vector3.create(cfg.width, cfg.height, 1)
    })
    MeshRenderer.setPlane(board)
    Material.setPbrMaterial(board, { albedoColor: Color4.create(0.82, 0.80, 0.74, 1), roughness: 1, metallic: 0 })
    // Plano del graffiti (PNG con alpha) al frente.
    const e = engine.addEntity()
    Transform.create(e, {
      position: Vector3.add(cfg.center, Vector3.scale(nrm, 0.06)), // 6cm frente al tablero
      rotation: rot,
      scale: Vector3.create(cfg.width, cfg.height, 1)
    })
    MeshRenderer.setPlane(e)
    // Collider para que el RAYO del aerosol pegue en el panel (sin esto lo atraviesa y
    // pinta lo de atrás → "no me deja pintar sobre ellos").
    MeshCollider.setPlane(e, ColliderLayer.CL_PHYSICS)
    applyTex(e, cfg.id, 0)
    rts.push({ cfg, entity: e, right, nrm, upn, version: 0 })
  }
  engine.addSystem(panelSystem)
}

function applyTex(e: Entity, id: string, version: number) {
  const src = `${API_BASE}/tex/${id}.png?v=${version}`
  Material.setPbrMaterial(e, {
    albedoColor: Color4.White(),
    texture: Material.Texture.Common({ src }),
    alphaTexture: Material.Texture.Common({ src }),
    emissiveColor: Color3.White(),
    emissiveTexture: Material.Texture.Common({ src }),
    emissiveIntensity: 0.5,
    transparencyMode: 2, // alpha blend → fondo transparente, solo se ven las manchas
    roughness: 1, metallic: 0
  })
}

/** Si `world` cae sobre algún panel pintable, devuelve {id, u, v} (u,v en 0..1). */
export function panelHitUV(world: Vector3): { id: string; u: number; v: number } | null {
  for (const rt of rts) {
    const vx = world.x - rt.cfg.center.x, vy = world.y - rt.cfg.center.y, vz = world.z - rt.cfg.center.z
    const distN = vx * rt.nrm.x + vy * rt.nrm.y + vz * rt.nrm.z
    if (Math.abs(distN) > 0.6) continue // no está sobre el plano de la pared
    const du = vx * rt.right.x + vy * rt.right.y + vz * rt.right.z
    const dv = vx * rt.upn.x + vy * rt.upn.y + vz * rt.upn.z
    const u = du / rt.cfg.width + 0.5
    const v = dv / rt.cfg.height + 0.5
    if (u < 0 || u > 1 || v < 0 || v > 1) continue
    return { id: rt.cfg.id, u, v }
  }
  return null
}

/** Encolar una mancha en un panel (se manda batcheada). size en metros → fracción del ancho. */
export function paintPanel(id: string, u: number, v: number, c: { r: number; g: number; b: number }, sizeM: number) {
  const rt = rts.find((r) => r.cfg.id === id)
  if (!rt) return
  const list = pending.get(id) || []
  list.push({ u, v, r: c.r, g: c.g, b: c.b, size: Math.max(0.005, sizeM / rt.cfg.width) })
  pending.set(id, list)
}

function panelSystem(dt: number) {
  // 1) Flush de manchas pendientes (un POST por panel).
  flushAccum += dt
  if (flushAccum >= FLUSH_MS / 1000) {
    flushAccum = 0
    for (const [id, list] of pending) {
      if (list.length === 0) continue
      const dabs = list.splice(0, list.length)
      fetch(`${API_BASE}/dabs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ panel: id, dabs }) }).catch(() => {})
    }
  }

  // 2) Poll de versiones → recargar la textura del panel que cambió.
  pollAccum += dt
  if (pollAccum >= 3.0) {
    pollAccum = 0
    fetch(`${API_BASE}/versions`)
      .then((r) => r.json())
      .then((v: Record<string, number>) => {
        for (const rt of rts) {
          const nv = v[rt.cfg.id]
          if (typeof nv === 'number' && nv !== rt.version) {
            rt.version = nv
            applyTex(rt.entity, rt.cfg.id, nv)
          }
        }
      })
      .catch(() => {})
  }
}
