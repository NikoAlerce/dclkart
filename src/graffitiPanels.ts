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
import { isPreviewMode, getCurrentRealm } from '~system/EnvironmentApi'
import { GRAFFITI_BRUSHES } from './graffitiState'

// 👉 URL del backend deployado (sin barra final).
export let API_BASE = 'https://graffiti-backend-k8qi.onrender.com'

isPreviewMode({})
  .then((res) => {
    fetch('http://localhost:8787/log?msg=' + encodeURIComponent('[SCENE INIT] isPreviewMode=' + res.isPreview))
      .catch(() => {})
    if (res.isPreview) {
      API_BASE = 'http://localhost:8787'
      console.log(`[GRAFFITI] Corriendo en modo PREVIEW. Usando backend local: ${API_BASE}`)
    }
  })
  .catch((err) => {
    console.error('[GRAFFITI] No se pudo determinar isPreviewMode:', err)
  })

getCurrentRealm({})
  .then((res) => {
    fetch('http://localhost:8787/log?msg=' + encodeURIComponent('[SCENE INIT] currentRealm=' + JSON.stringify(res.currentRealm)))
      .catch(() => {})
    if (res.currentRealm?.displayName === 'LocalPreview' || res.currentRealm?.serverName === 'LocalPreview') {
      API_BASE = 'http://localhost:8787'
      console.log(`[GRAFFITI] Detectado LocalPreview. Usando backend local: ${API_BASE}`)
      fetch('http://localhost:8787/log?msg=' + encodeURIComponent('[SCENE] Cambiando API_BASE a localhost por LocalPreview'))
        .catch(() => {})
    }
  })
  .catch((err) => {
    console.error('[GRAFFITI] No se pudo determinar currentRealm:', err)
  })

// position/rotation/scale como cualquier objeto → EDITABLE EN EL EDITOR GLB.
// scale.x = ancho, scale.y = alto (la pared es un plano). El frente (donde pintás) es
// la cara +Z del plano rotada por `rotation`.
type PanelCfg = { id: string; position: Vector3; rotation: Quaternion; scale: Vector3 }

// Tableros pintables. Mismo `id` que en el backend. ⚠️ POSICIONES DE PRUEBA: muévelos/
// escalalos/rotalos desde el editor GLB (http://localhost:9000) y se guardan acá.
export const PANELS: PanelCfg[] = [
  { id: 'wallA', position: Vector3.create(-260.82, 75.05, 56.57), rotation: Quaternion.create(0.0000, 0.9878, 0.0000, -0.1556), scale: Vector3.create(31.755, 21.172, 5.292) },
  { id: 'wallB', position: Vector3.create(-230.79, 74.98, 48.72), rotation: Quaternion.create(0.0000, 0.9937, 0.0000, -0.1123), scale: Vector3.create(31.455, 20.971, 5.243) },
  { id: 'wallC', position: Vector3.create(-271.06, 75.01, 76.34), rotation: Quaternion.create(0.0000, -0.5896, 0.0000, 0.8077), scale: Vector3.create(31.688, 21.124, 5.281) }
]

type PanelRT = { cfg: PanelCfg; entity: Entity; right: Vector3; nrm: Vector3; upn: Vector3; w: number; h: number; version: number }
const rts: PanelRT[] = []

// Batch de manchas por panel, se vacía cada FLUSH_MS en un solo POST.
type Dab = { u: number; v: number; r: number; g: number; b: number; size: number; eraser?: boolean }
const pending = new Map<string, Dab[]>()
const FLUSH_MS = 80   // flush más rápido (era 180ms)
let flushAccum = 0
let pollAccum = 0
let pendingPoll = false  // true = hacer poll en el próximo frame (tras un POST exitoso)

export function setupGraffitiPanels() {
  if (API_BASE.includes('TU-BACKEND')) {
    console.log('[GRAFFITI] API_BASE sin configurar → paneles persistentes deshabilitados.')
    return
  }
  for (const cfg of PANELS) {
    const rot = cfg.rotation
    // Normal/up/right del panel según la rotación del editor.
    const nrm   = Vector3.rotate(Vector3.Forward(), rot)
    const upn   = Vector3.rotate(Vector3.Up(), rot)
    const right = Vector3.rotate(Vector3.Right(), rot)
    const w = cfg.scale.x, h = cfg.scale.y

    // Pared de ladrillo: caja fina (0.3m) → visible de todos los lados, sin problemas de cara.
    const board = engine.addEntity()
    Transform.create(board, { position: cfg.position, rotation: rot, scale: Vector3.create(w, h, 0.3) })
    MeshRenderer.setBox(board)
    const brickTex = 'assets/textures/brick.jpg'
    Material.setPbrMaterial(board, {
      albedoColor: Color4.White(),
      texture: Material.Texture.Common({ src: brickTex }),
      roughness: 0.9,
      metallic: 0
    })

    // Plano del graffiti (PNG con alpha) en la cara OPUESTA a la normal (cara invertida según usuario).
    // Rotación 180° alrededor de Y: flipRot = rot * Quaternion(0,180°,0).
    // Quaternion multiplication con q2={x:0,y:1,z:0,w:0} da: {-rot.z, rot.w, rot.x, -rot.y}
    const flipRot  = Quaternion.create(-rot.z, rot.w, rot.x, -rot.y)
    const nrmFlip  = Vector3.scale(nrm, -1)      // normal apunta hacia el otro lado
    const rightFlip = Vector3.scale(right, -1)   // right también flipa con la rotación 180°Y

    const e = engine.addEntity()
    // Plano a 0.16m delante de la cara (la caja es 0.3m gruesa, mitad = 0.15m + pequeño offset).
    Transform.create(e, { position: Vector3.add(cfg.position, Vector3.scale(nrmFlip, 0.16)), rotation: flipRot, scale: Vector3.create(w, h, 1) })
    MeshRenderer.setPlane(e)
    MeshCollider.setPlane(e, ColliderLayer.CL_PHYSICS)
    applyTex(e, cfg.id, 0)
    rts.push({ cfg, entity: e, right: rightFlip, nrm: nrmFlip, upn, w, h, version: 0 })

    console.log(`[GRAFFITI] Panel ${cfg.id} creado. nrm=(${nrmFlip.x.toFixed(2)},${nrmFlip.y.toFixed(2)},${nrmFlip.z.toFixed(2)}) pos=(${cfg.position.x.toFixed(1)},${cfg.position.y.toFixed(1)},${cfg.position.z.toFixed(1)})`)
  }
  engine.addSystem(panelSystem)
}

function applyTex(e: Entity, id: string, version: number) {
  if (version === 0) {
    // Sin pintura todavía: plano completamente transparente (no tapa la pared de ladrillo).
    Material.setPbrMaterial(e, { albedoColor: Color4.create(0, 0, 0, 0), transparencyMode: 1, roughness: 1, metallic: 0 })
    return
  }
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
    const vx = world.x - rt.cfg.position.x, vy = world.y - rt.cfg.position.y, vz = world.z - rt.cfg.position.z
    const distN = vx * rt.nrm.x + vy * rt.nrm.y + vz * rt.nrm.z
    if (Math.abs(distN) > 0.6) continue // no está sobre el plano de la pared
    const du = vx * rt.right.x + vy * rt.right.y + vz * rt.right.z
    const dv = vx * rt.upn.x + vy * rt.upn.y + vz * rt.upn.z
    const u = du / rt.w + 0.5
    const v = dv / rt.h + 0.5
    if (u < 0 || u > 1 || v < 0 || v > 1) {
      console.log(`[GRAFFITI] hit ${rt.cfg.id} pero UV fuera de rango: u=${u.toFixed(3)} v=${v.toFixed(3)}`)
      continue
    }
    console.log(`[GRAFFITI] HIT panel ${rt.cfg.id} u=${u.toFixed(3)} v=${v.toFixed(3)} distN=${distN.toFixed(3)}`)
    return { id: rt.cfg.id, u, v }
  }
  return null
}

type LocalDecal = { entity: Entity; age: number }
const localDecals: LocalDecal[] = []

function createLocalDab(rt: PanelRT, u: number, v: number, c: { r: number; g: number; b: number }, sizeM: number, brushIdx: number) {
  // Reconstruir posición 3D desde U, V
  const du = (u - 0.5) * rt.w
  const dv = (v - 0.5) * rt.h
  
  // Posición base es la del plano de graffiti (rt.entity)
  const planePos = Transform.get(rt.entity).position
  
  let pos = Vector3.add(
    planePos,
    Vector3.add(
      Vector3.scale(rt.right, du),
      Vector3.scale(rt.upn, dv)
    )
  )
  
  // Agregar offset a lo largo de la normal para evitar z-fighting con el plano e.
  // Usamos una pequeña variación para ordenar capas si se pintan muchas manchas.
  const layerOffset = 0.002 + (localDecals.length % 50) * 0.0005
  pos = Vector3.add(pos, Vector3.scale(rt.nrm, layerOffset))

  const e = engine.addEntity()
  const rot = Transform.get(rt.entity).rotation
  Transform.create(e, {
    position: pos,
    rotation: rot,
    scale: Vector3.create(sizeM, sizeM, sizeM)
  })

  MeshRenderer.setPlane(e)

  const b = GRAFFITI_BRUSHES[brushIdx] || GRAFFITI_BRUSHES[1]
  // SIN emisivo: el emissiveColor+intensity hacía que el centro del pincel se "quemara"
  // a casi-blanco (los "puntos blancos" que se veían aunque pintaras en otro color). El
  // decal local ahora es color PLANO, igual que la mancha del backend que lo reemplaza.
  Material.setPbrMaterial(e, {
    albedoColor: Color4.create(c.r, c.g, c.b, 1),
    texture: Material.Texture.Common({ src: b.tex }),
    alphaTexture: Material.Texture.Common({ src: b.tex }),
    transparencyMode: 2, // alpha blend
    roughness: 1,
    metallic: 0
  })

  localDecals.push({ entity: e, age: 0 })
}

/** Encolar una mancha en un panel (se manda batcheada). size en metros → fracción del ancho.
 *  `localDecal`=false desde el editor 2D (canvas): ahí el feedback es la textura del backend
 *  + los puntos locales de la UI; no queremos además planos 3D pegados a la pared. */
export function paintPanel(id: string, u: number, v: number, c: { r: number; g: number; b: number }, sizeM: number, brushIdx: number, eraser: boolean = false, localDecal: boolean = true) {
  const rt = rts.find((r) => r.cfg.id === id)
  if (!rt) { console.error(`[GRAFFITI] paintPanel: panel "${id}" no encontrado en rts`); return }
  const list = pending.get(id) || []
  const sizeFrac = Math.max(0.005, sizeM / rt.w)
  list.push({ u, v, r: c.r, g: c.g, b: c.b, size: sizeFrac, eraser })
  pending.set(id, list)

  // Feedback local instantáneo (decal local con tiempo de vida corto, no se crea si es borrador)
  if (localDecal && !eraser) {
    createLocalDab(rt, u, v, c, sizeM, brushIdx)
  }
}

/** Estampa TEXTO en un panel (lo dibuja el backend con fillText y queda persistido).
 *  `sizeFrac` = altura de la fuente como fracción del alto del panel. */
export function stampText(id: string, u: number, v: number, text: string, c: { r: number; g: number; b: number }, sizeFrac: number) {
  fetch(`${API_BASE}/text`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ panel: id, u, v, text, r: c.r, g: c.g, b: c.b, size: sizeFrac })
  }).then((r) => { if (r.ok) pendingPoll = true }).catch(() => {})
}

/** Deshace el último trazo/texto de un panel (el backend quita el grupo más reciente). */
export function undoPanel(id: string) {
  fetch(`${API_BASE}/undo`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ panel: id })
  }).then((r) => { if (r.ok) pendingPoll = true }).catch(() => {})
}

/** Geometría/estado de un panel para el editor 2D: medidas en METROS (aspecto real de la
 *  pared) + versión actual de la textura del backend (para refrescar el preview). */
export function getPanelMeta(id: string): { w: number; h: number; version: number } | null {
  const rt = rts.find((r) => r.cfg.id === id)
  if (!rt) return null
  return { w: rt.w, h: rt.h, version: rt.version }
}

export let closestPanelId: string | null = null

function panelSystem(dt: number) {
  // 1) Flush de manchas pendientes (un POST por panel).
  flushAccum += dt
  if (flushAccum >= FLUSH_MS / 1000) {
    flushAccum = 0
    for (const [id, list] of pending) {
      if (list.length === 0) continue
      const dabs = list.splice(0, list.length)
      console.log(`[GRAFFITI] POST /dabs panel=${id} (${dabs.length} manchas)`)
      fetch(`${API_BASE}/dabs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ panel: id, dabs }) })
        .then(r => { console.log(`[GRAFFITI] /dabs response: ${r.status}`); if (r.ok) pendingPoll = true })
        .catch(err => console.error(`[GRAFFITI] /dabs ERROR:`, err))
    }
  }

  // 2) Poll de versiones → recargar la textura del panel que cambió.
  pollAccum += dt
  if (pendingPoll || pollAccum >= 3.0) {
    pendingPoll = false
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

  // 3) Envejecer y remover decales locales temporales
  for (let i = localDecals.length - 1; i >= 0; i--) {
    localDecals[i].age += dt
    if (localDecals[i].age >= 8.0) {
      engine.removeEntity(localDecals[i].entity)
      localDecals.splice(i, 1)
    }
  }

  // 4) Detectar panel más cercano (para el botón "Make a graffiti" / Admin).
  // OJO: medir contra el CENTRO de la pared no sirve: son enormes (31×21m) y su centro está
  // ~10m por encima del piso, así que parado al pie quedabas a >12m y el cartel nunca salía.
  // Medimos contra el PUNTO MÁS CERCANO de la superficie (proyección al rectángulo del panel).
  let closest: string | null = null
  let minDist = 14.0
  const playerTransform = Transform.getOrNull(engine.PlayerEntity)
  if (playerTransform) {
    const p = playerTransform.position
    for (const rt of rts) {
      const vx = p.x - rt.cfg.position.x, vy = p.y - rt.cfg.position.y, vz = p.z - rt.cfg.position.z
      // Componentes del vector en los ejes del panel, recortadas a sus medidas (mitades).
      let du = vx * rt.right.x + vy * rt.right.y + vz * rt.right.z
      let dv = vx * rt.upn.x + vy * rt.upn.y + vz * rt.upn.z
      const dn = vx * rt.nrm.x + vy * rt.nrm.y + vz * rt.nrm.z
      du = Math.max(-rt.w / 2, Math.min(rt.w / 2, du))
      dv = Math.max(-rt.h / 2, Math.min(rt.h / 2, dv))
      // Punto más cercano sobre el rectángulo = center + right*du + upn*dv; su distancia al
      // jugador es sqrt((proyección recortada)² + perpendicular²).
      const ddu = (vx * rt.right.x + vy * rt.right.y + vz * rt.right.z) - du
      const ddv = (vx * rt.upn.x + vy * rt.upn.y + vz * rt.upn.z) - dv
      const dist = Math.sqrt(ddu * ddu + ddv * ddv + dn * dn)
      if (dist < minDist) { minDist = dist; closest = rt.cfg.id }
    }
  }
  closestPanelId = closest
}
