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

// ── Ubicación de los carteles (afuera de la arena, sobre la entrada). Ajustá si hace falta.
const SIGN_X = -22
const SIGN_Z = 272
const PANEL_ROT = Quaternion.fromEulerDegrees(0, 180, 0) // planos miran al jugador (-Z)
const TEXT_ROT = Quaternion.Identity()                   // texto legible de frente

function rgb(c: Color4, k = 1): Color3 { return Color3.create(c.r * k, c.g * k, c.b * k) }

// Cartel = marco emisivo (glow) + panel oscuro. Devuelve el centro para colgar texto.
function board(cy: number, w: number, h: number, frame: Color4, panel: Color4, zBase = SIGN_Z) {
  const fr = engine.addEntity()
  Transform.create(fr, { position: Vector3.create(SIGN_X, cy, zBase + 0.2), rotation: PANEL_ROT, scale: Vector3.create(w + 0.6, h + 0.6, 1) })
  MeshRenderer.setPlane(fr)
  Material.setPbrMaterial(fr, { albedoColor: frame, emissiveColor: rgb(frame), emissiveIntensity: 4.0, roughness: 1 })

  const pn = engine.addEntity()
  Transform.create(pn, { position: Vector3.create(SIGN_X, cy, zBase + 0.1), rotation: PANEL_ROT, scale: Vector3.create(w, h, 1) })
  MeshRenderer.setPlane(pn)
  Material.setPbrMaterial(pn, { albedoColor: panel, emissiveColor: rgb(panel, 0.6), emissiveIntensity: 0.5, roughness: 1 })
}

// Texto con sombra (copia oscura detrás) para que resalte sobre el panel.
function text(cy: number, zoff: number, value: string, size: number, color: Color4, outline: Color4, zBase = SIGN_Z): Entity {
  // sombra (un poco DETRÁS del texto = mayor Z, más lejos del jugador que está en -Z)
  const sh = engine.addEntity()
  Transform.create(sh, { position: Vector3.create(SIGN_X + 0.06, cy - 0.06, zBase - zoff + 0.04), rotation: TEXT_ROT })
  TextShape.create(sh, { text: value, fontSize: size, font: Font.F_SANS_SERIF, textColor: Color4.create(0, 0, 0, 0.85), textAlign: TextAlignMode.TAM_MIDDLE_CENTER })
  // principal
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.create(SIGN_X, cy, zBase - zoff), rotation: TEXT_ROT })
  TextShape.create(e, { text: value, fontSize: size, font: Font.F_SANS_SERIF, textColor: color, outlineColor: outline, outlineWidth: 0.35, textAlign: TextAlignMode.TAM_MIDDLE_CENTER })
  return e
}

export function setupSigns() {
  highEntity = engine.addEntity()
  PBHigh.create(highEntity, { score: 0, name: '—' })
  syncEntity(highEntity, [PBHigh.componentId], SYNC_IDS.highScore)

  // ── Título "DCL PAINTBALL" — neón verde. GIGANTE (7×) y +3m, como backdrop atrás
  //    (zBase +6) para que NO tape el tablero de récord que queda adelante.
  const GREEN = Color4.create(0.2, 1.0, 0.5, 1)
  const TITLE_Z = SIGN_Z + 6
  board(87, 105, 22.4, GREEN, Color4.create(0.02, 0.06, 0.04, 1), TITLE_Z)
  text(87, 0.25, 'DCL  PAINTBALL', 56, Color4.create(0.85, 1, 0.92, 1), Color4.create(0, 0.5, 0.2, 1), TITLE_Z)

  // ── Tablero de récord — neón ámbar ──
  const GOLD = Color4.create(1.0, 0.78, 0.2, 1)
  board(79, 11, 4.6, GOLD, Color4.create(0.07, 0.05, 0.02, 1))
  text(80.6, 0.3, '🏆  ALL-TIME HIGH', 3, GOLD, Color4.create(0.3, 0.15, 0, 1))
  numText = text(79.0, 0.3, '0', 9, Color4.White(), Color4.create(0.3, 0.2, 0, 1))
  nameText = text(77.4, 0.3, '—', 2.6, Color4.create(0.9, 0.85, 0.7, 1), Color4.create(0.2, 0.1, 0, 1))

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
