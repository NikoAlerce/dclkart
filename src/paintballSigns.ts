// ─── Carteles afuera de la arena: título "DCL PAINTBALL" + récord histórico ─────
// El récord se sincroniza entre los jugadores de la instancia del World (CRDT,
// last-writer-wins). Persiste mientras la escena siga viva; un redeploy lo reinicia
// (un récord "all-time" real cross-deploy requeriría un backend).
//
// ORIENTACIÓN: los paneles (planos) se ven desde su normal → necesitan rotar 180 para
// mirar al jugador. El TextShape en cambio se lee de frente con rotación 0 (a 180 sale
// espejado). Por eso paneles y texto usan rotaciones distintas.

import { engine, Transform, TextShape, MeshRenderer, Material, Entity, Schemas, Font, TextAlignMode } from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4, Color3 } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { SYNC_IDS } from './net'
import { PaintballState } from './paintballState'
import { getPlayer } from '@dcl/sdk/players'

const PBHigh = engine.defineComponent('pbHighScore', { score: Schemas.Int, name: Schemas.String })

let highEntity: Entity
let numText: Entity
let nameText: Entity
let lastShown = ''

const TEXT_ROT = Quaternion.Identity()                   // texto legible de frente

function rgb(c: Color4, k = 1): Color3 { return Color3.create(c.r * k, c.g * k, c.b * k) }

// ── Marquesina "DCL PAINTBALL" ────────────────────────────────────────────────
// Banner con textura (assets/images/paintball sign.png) auto-iluminado (emissive),
// rodeado por un marco de "bombillas" de colores con efecto chase (cartel luminoso).
// Movida respecto del título viejo (-22, 87, 278): 40m hacia el centro del terreno
// (centro del mapa ≈ X -130 / Z 203 → dir unit (-0.82,-0.57)) y +10m en Y.
const MARQ_X = -55                          // -22 - 40*0.82  (hacia el centro en X)
const MARQ_Y = 107                          // +10m respecto del récord (sube solo la marquesina)
const MARQ_Z = 255                          // 278 - 40*0.57  (hacia el centro en Z)
const MARQ_W = 80                           // ancho del banner (m)
const MARQ_H = MARQ_W * (803 / 1959)        // alto respetando el aspect del PNG (≈ 32.8)
const MARQ_IMG = 'assets/images/paintball sign.png'
// El plano (doble cara) se deja con rotación Identity: mirándolo desde -Z el jugador ve
// la cara NO espejada (con PANEL_ROT 180° la textura salía como reflejada).
const MARQ_ROT = Quaternion.Identity()
const BULB_COLORS: Color4[] = [
  Color4.create(1.0, 0.05, 0.65, 1),        // magenta
  Color4.create(0.0, 0.85, 1.0, 1),         // cyan
  Color4.create(1.0, 0.78, 0.0, 1),         // ámbar
  Color4.create(0.35, 1.0, 0.2, 1),         // verde
]

// ── Tablero de récord: mismo estilo que la marquesina (marco + luces), al lado ──
// Ubicado a la DERECHA de la marquesina, coplanar (mismo Y/Z), separado por un gap.
// Borde derecho de la marquesina ≈ MARQ_X + MARQ_W/2 + 1.6 + barT/2 ≈ -12.2.
const REC_W = 34                            // ancho del tablero de récord (m)
const REC_H = MARQ_H                         // mismo alto (tamaño) que la marquesina
const REC_Y = 97                            // altura propia (la marquesina sube sola a 117)
const REC_Z = MARQ_Z                         // coplanar en Z
const REC_GAP = 7                            // espacio entre los dos carteles
// A la IZQUIERDA de la marquesina (lado del centro del terreno, -X).
const REC_X = MARQ_X - MARQ_W / 2 - 1.6 - 1.2 - REC_GAP - (REC_W / 2 + 1.6 + 1.2) // ≈ -125

type Bulb = { e: Entity, base: Color4, idx: number }
const bulbs: Bulb[] = []

function bulb(x: number, y: number, cz: number, idx: number) {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(x, y, cz - 0.9), scale: Vector3.create(0.9, 0.9, 0.9) })
  MeshRenderer.setSphere(e)
  const base = BULB_COLORS[idx % BULB_COLORS.length]
  // albedo = tinte oscuro del color (el cuerpo se ve de color aunque no esté "encendida")
  Material.setPbrMaterial(e, { albedoColor: Color4.create(base.r * 0.3, base.g * 0.3, base.b * 0.3, 1), emissiveColor: rgb(base), emissiveIntensity: 6, roughness: 0.3, metallic: 0, specularIntensity: 0 })
  bulbs.push({ e, base, idx })
}

// Barra del marco (caja metálica oscura con trim emisivo tenue).
function frameBar(cx: number, cy: number, cz: number, sx: number, sy: number) {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(cx, cy, cz - 0.35), scale: Vector3.create(sx, sy, 0.7) })
  MeshRenderer.setBox(e)
  Material.setPbrMaterial(e, { albedoColor: Color4.create(0.04, 0.04, 0.06, 1), metallic: 0.9, roughness: 0.35, emissiveColor: Color3.create(0.10, 0.08, 0.03), emissiveIntensity: 0.5 })
}

// Marco estiloso (4 barras) + lamparitas perimetrales (top→right→bottom→left p/ el chase).
function framedBoard(cx: number, cy: number, cz: number, w: number, h: number) {
  const hw = w / 2 + 1.6, hh = h / 2 + 1.6
  const barT = 2.4
  frameBar(cx, cy + hh, cz, 2 * hw + barT, barT)   // top
  frameBar(cx, cy - hh, cz, 2 * hw + barT, barT)   // bottom
  frameBar(cx - hw, cy, cz, barT, 2 * hh + barT)   // left
  frameBar(cx + hw, cy, cz, barT, 2 * hh + barT)   // right

  const nx = Math.max(2, Math.round(w / 3.2))
  const ny = Math.max(2, Math.round(h / 3.2))
  let k = 0
  for (let i = 0; i <= nx; i++) bulb(cx - hw + (2 * hw) * (i / nx), cy + hh, cz, k++)   // top  L→R
  for (let i = 1; i <= ny; i++) bulb(cx + hw, cy + hh - (2 * hh) * (i / ny), cz, k++)   // right T→B
  for (let i = 1; i <= nx; i++) bulb(cx + hw - (2 * hw) * (i / nx), cy - hh, cz, k++)   // bottom R→L
  for (let i = 1; i <  ny; i++) bulb(cx - hw, cy - hh + (2 * hh) * (i / ny), cz, k++)   // left  B→T
}

// Chase: 1 de cada 3 bombillas brilla fuerte y el patrón viaja por el marco (~6 pasos/s).
// Un solo system para TODAS las lamparitas (marquesina + récord).
function startBulbChase() {
  let t = 0, lastPhase = -1
  engine.addSystem((dt) => {
    t += dt
    const phase = Math.floor(t * 6)
    if (phase === lastPhase) return
    lastPhase = phase
    for (const b of bulbs) {
      const lit = ((b.idx + phase) % 3) === 0
      Material.setPbrMaterial(b.e, {
        albedoColor: Color4.create(b.base.r * 0.3, b.base.g * 0.3, b.base.b * 0.3, 1),
        emissiveColor: rgb(b.base, lit ? 1 : 0.8),
        emissiveIntensity: lit ? 14 : 1.4,
        roughness: 0.3, metallic: 0, specularIntensity: 0,
      })
    }
  })
}

function buildMarquee() {
  // Banner: textura como albedo + emissive (visible de noche), bg transparente del PNG.
  const sign = engine.addEntity()
  Transform.create(sign, { position: Vector3.create(MARQ_X, MARQ_Y, MARQ_Z), rotation: MARQ_ROT, scale: Vector3.create(MARQ_W, MARQ_H, 1) })
  MeshRenderer.setPlane(sign)
  Material.setPbrMaterial(sign, {
    texture: Material.Texture.Common({ src: MARQ_IMG }),
    emissiveTexture: Material.Texture.Common({ src: MARQ_IMG }),
    emissiveColor: Color3.White(),
    emissiveIntensity: 1.6,
    transparencyMode: 2,                     // alpha blend (recorta el fondo transparente)
    roughness: 1,
    specularIntensity: 0,
  })
  framedBoard(MARQ_X, MARQ_Y, MARQ_Z, MARQ_W, MARQ_H)
}

// Panel oscuro (fondo del tablero de récord).
function darkPanel(cx: number, cy: number, cz: number, w: number, h: number) {
  const pn = engine.addEntity()
  Transform.create(pn, { position: Vector3.create(cx, cy, cz), rotation: MARQ_ROT, scale: Vector3.create(w, h, 1) })
  MeshRenderer.setPlane(pn)
  Material.setPbrMaterial(pn, { albedoColor: Color4.create(0.03, 0.03, 0.05, 1), emissiveColor: Color3.create(0.02, 0.02, 0.04), emissiveIntensity: 0.4, roughness: 1 })
}

// Texto con sombra (copia oscura detrás) para que resalte sobre el panel.
function text(cx: number, cy: number, cz: number, value: string, size: number, color: Color4, outline: Color4): Entity {
  // sombra (un poco DETRÁS = mayor Z, más lejos del jugador que está en -Z)
  const sh = engine.addEntity()
  Transform.create(sh, { position: Vector3.create(cx + 0.12, cy - 0.12, cz + 0.08), rotation: TEXT_ROT })
  TextShape.create(sh, { text: value, fontSize: size, font: Font.F_SANS_SERIF, textColor: Color4.create(0, 0, 0, 0.85), textAlign: TextAlignMode.TAM_MIDDLE_CENTER })
  // principal
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(cx, cy, cz), rotation: TEXT_ROT })
  TextShape.create(e, { text: value, fontSize: size, font: Font.F_SANS_SERIF, textColor: color, outlineColor: outline, outlineWidth: 0.35, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })
  return e
}

// Tablero de récord: panel + marco + luces (mismo estilo que la marquesina) + textos.
function buildRecordBoard() {
  const GOLD = Color4.create(1.0, 0.78, 0.2, 1)
  const tz = REC_Z - 0.6   // textos por delante del panel (hacia el jugador en -Z)
  darkPanel(REC_X, REC_Y, REC_Z, REC_W, REC_H)
  framedBoard(REC_X, REC_Y, REC_Z, REC_W, REC_H)
  text(REC_X, REC_Y + 11, tz, '🏆  ALL-TIME HIGH', 12, GOLD, Color4.create(0.3, 0.15, 0, 1))
  numText  = text(REC_X, REC_Y - 0.5, tz, '0', 48, Color4.White(), Color4.create(0.3, 0.2, 0, 1))
  nameText = text(REC_X, REC_Y - 11.5, tz, '—', 12, Color4.create(0.9, 0.85, 0.7, 1), Color4.create(0.2, 0.1, 0, 1))
}

export function setupSigns() {
  highEntity = engine.addEntity()
  PBHigh.create(highEntity, { score: 0, name: '—' })
  syncEntity(highEntity, [PBHigh.componentId], SYNC_IDS.highScore)

  // ── Marquesina "DCL PAINTBALL" (banner + marco + luces) ──
  buildMarquee()
  // ── Tablero de récord: mismo estilo (marco + luces + tamaño), al lado con un gap ──
  buildRecordBoard()
  // Chase compartido para las lamparitas de ambos carteles.
  startBulbChase()

  engine.addSystem(() => {
    const h = PBHigh.getOrNull(highEntity)
    if (!h) return
    // Si mi score supera el récord, lo escribo (todos lo ven por sync).
    if (PaintballState.inGame && PaintballState.score > h.score) {
      const m = PBHigh.getMutable(highEntity)
      m.score = PaintballState.score
      m.name = getPlayer()?.name || 'Player'
    }
    const key = `${h.score}|${h.name}`
    if (key !== lastShown) {
      lastShown = key
      TextShape.getMutable(numText).text = `${h.score}`
      TextShape.getMutable(nameText).text = h.name
    }
  })
}
