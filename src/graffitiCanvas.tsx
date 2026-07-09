// ─── Editor 2D de graffiti ("Make a graffiti") ───────────────────────────────
// Las paredes del guestbook son enormes (~21m de alto) y están muy arriba: pintar
// "mirando hacia arriba" con la mira del aerosol es incómodo e impreciso. Este módulo
// abre una VISTA PLANA tipo lienzo de la pared elegida, donde pintás con el cursor,
// hacés ZOOM a un segmento y arrastrás trazos fluidos. Escribe directo al backend
// (mismas manchas que el aerosol) → lo que pintás acá aparece en la pared real.
//
// Por qué UI 2D y no una cámara virtual: VirtualCamera bloquea el mouse-look (no podrías
// apuntar/arrastrar) y un teletransporte deja al avatar pegado al piso (seguirías mirando
// hacia arriba). La UI 2D no tiene cámara ni gravedad → control preciso y cómodo.

import ReactEcs, { Label, UiEntity, Input } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { paintPanel, getPanelMeta, API_BASE, stampText, undoPanel } from './graffitiPanels'
import { GraffitiState, GRAFFITI_PALETTE, GRAFFITI_SIZES, GRAFFITI_SIZE_LABELS } from './graffitiState'

// Resolución de la grilla de celdas-clic que cubre el lienzo. Cada celda dispara onMouseDown
// (empezar trazo) y onMouseEnter (continuar mientras arrastrás). La interpolación rellena los
// huecos cuando movés rápido, así que no hace falta una grilla densísima.
const COLS = 38
const ROWS = 22

// Tamaño del lienzo en pantalla (px). El ancho sale del aspecto REAL de la pared (metros).
const CANVAS_H = 560
const CANVAS_W_MAX = 980

// La pared 3D mapea su textura "espejada" respecto del lienzo (por la rotación de 180° del
// plano). Para que lo que pintás caiga IGUAL en la pared, el lienzo refleja en horizontal:
// pintura, preview de textura y puntos locales usan el mismo flip. (Si alguna vez quedara
// invertido en vertical, cambiar FLIP_V.)
const FLIP_U = true
const FLIP_V = false

type LocalDot = { u: number; v: number; r: number; g: number; b: number; sizeFrac: number; text?: string }

export const CanvasState = {
  open: false,
  panelId: '' as string,
  // Ventana visible del lienzo en UV (zoom/pan). Por defecto toda la pared.
  u0: 0, u1: 1, v0: 0, v1: 1,
  painting: false,
  lastU: null as number | null,
  lastV: null as number | null,
  dots: [] as LocalDot[],   // feedback instantáneo (se limpia cuando el backend actualiza)
  displayVersion: 0,        // versión de textura QUE SE MUESTRA (no cambia mientras pintás → sin parpadeo)
  lastPaintAt: 0,           // ms del último trazo → refrescar textura recién al soltar
  hue: 0,
  textMode: false,          // ✍️ modo texto: clickear estampa la frase escrita
  textValue: ''             // frase actual a estampar
}

export function openCanvas(panelId: string) {
  const meta = getPanelMeta(panelId)
  if (!meta) { console.log(`[CANVAS] panel ${panelId} sin geometría`); return }
  CanvasState.open = true
  CanvasState.panelId = panelId
  CanvasState.u0 = 0; CanvasState.u1 = 1; CanvasState.v0 = 0; CanvasState.v1 = 1
  CanvasState.painting = false
  CanvasState.lastU = CanvasState.lastV = null
  CanvasState.dots = []
  CanvasState.displayVersion = meta.version
  CanvasState.lastPaintAt = 0
  CanvasState.textMode = false
  GraffitiState.sprayMode = false   // que el aerosol-mira no pinte por detrás mientras editás
  GraffitiState.lastUiClickTime = Date.now()
}

export function closeCanvas() {
  CanvasState.open = false
  CanvasState.painting = false
  CanvasState.lastU = CanvasState.lastV = null
  CanvasState.dots = []
  GraffitiState.lastUiClickTime = Date.now()
}

function hsvToRgb(h: number, s: number, v: number) {
  const i = Math.floor(h * 6), f = h * 6 - i
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s)
  switch (i % 6) {
    case 0: return { r: v, g: t, b: p }
    case 1: return { r: q, g: v, b: p }
    case 2: return { r: p, g: v, b: t }
    case 3: return { r: p, g: q, b: v }
    case 4: return { r: t, g: p, b: v }
    default: return { r: v, g: p, b: q }
  }
}

function currentColor(): { r: number; g: number; b: number } {
  if (GraffitiState.rainbow) {
    CanvasState.hue = (CanvasState.hue + 0.04) % 1
    return hsvToRgb(CanvasState.hue, 1, 1)
  }
  const c = GRAFFITI_PALETTE[GraffitiState.selectedColor] || GRAFFITI_PALETTE[0]
  return { r: c.r, g: c.g, b: c.b }
}

// Pinta una mancha en (u,v) e interpola desde el último punto → trazo continuo al arrastrar.
function paintAtUV(u: number, v: number) {
  const meta = getPanelMeta(CanvasState.panelId)
  if (!meta) return
  const sizeM = GRAFFITI_SIZES[GraffitiState.selectedSize] || 1.0
  const sizeFrac = Math.max(0.005, sizeM / meta.w)
  const eraser = GraffitiState.eraser

  CanvasState.lastPaintAt = Date.now()
  const emit = (uu: number, vv: number) => {
    const c = currentColor()
    paintPanel(CanvasState.panelId, uu, vv, c, sizeM, GraffitiState.selectedBrush, eraser, false)
    if (!eraser) {
      CanvasState.dots.push({ u: uu, v: vv, r: c.r, g: c.g, b: c.b, sizeFrac })
      if (CanvasState.dots.length > 600) CanvasState.dots.shift()
    }
  }

  if (CanvasState.lastU === null || CanvasState.lastV === null) {
    emit(u, v)
  } else {
    const du = u - CanvasState.lastU, dv = v - CanvasState.lastV
    const dist = Math.sqrt(du * du + dv * dv)
    const spacing = Math.max(0.004, sizeFrac * 0.5)   // solape para que la línea sea sólida
    const steps = Math.min(24, Math.floor(dist / spacing))
    for (let i = 1; i <= steps; i++) emit(CanvasState.lastU + (du * i) / steps, CanvasState.lastV + (dv * i) / steps)
    if (steps === 0) emit(u, v)
  }
  CanvasState.lastU = u
  CanvasState.lastV = v
}

// fracción de pantalla (fx,fy ∈ [0,1], fy desde arriba) → UV de textura, aplicando el flip.
function fracToUV(fx: number, fy: number): { u: number; v: number } {
  const wu = CanvasState.u1 - CanvasState.u0, wv = CanvasState.v1 - CanvasState.v0
  const u = CanvasState.u0 + (FLIP_U ? 1 - fx : fx) * wu
  const v = CanvasState.v0 + (FLIP_V ? fy : 1 - fy) * wv
  return { u, v }
}
// UV de textura → fracción de pantalla (inversa de fracToUV) → para ubicar los puntos locales.
function uvToFrac(u: number, v: number): { fx: number; fy: number } {
  const wu = CanvasState.u1 - CanvasState.u0, wv = CanvasState.v1 - CanvasState.v0
  const su = (u - CanvasState.u0) / wu, sv = (v - CanvasState.v0) / wv
  return { fx: FLIP_U ? 1 - su : su, fy: FLIP_V ? sv : 1 - sv }
}
// celda(col,row) → UV (centro de la celda)
function cellUV(col: number, row: number): { u: number; v: number } {
  return fracToUV((col + 0.5) / COLS, (row + 0.5) / ROWS)
}

// Estampa el texto actual en (u,v) con el color/tamaño elegidos.
function stampTextAt(u: number, v: number) {
  const meta = getPanelMeta(CanvasState.panelId)
  const text = CanvasState.textValue.trim()
  if (!meta || !text) return
  const sizeM = GRAFFITI_SIZES[GraffitiState.selectedSize] || 1.0
  const sizeFrac = Math.max(0.02, sizeM / meta.h)   // altura de fuente como fracción del alto
  const c = currentColor()
  stampText(CanvasState.panelId, u, v, text, c, sizeFrac)
  CanvasState.lastPaintAt = Date.now()
  CanvasState.dots.push({ u, v, r: c.r, g: c.g, b: c.b, sizeFrac, text })
}

// ── Zoom / pan de la ventana visible ──
function clamp01(x: number) { return x < 0 ? 0 : x > 1 ? 1 : x }
function zoom(factor: number) {
  const cu = (CanvasState.u0 + CanvasState.u1) / 2, cv = (CanvasState.v0 + CanvasState.v1) / 2
  let hu = ((CanvasState.u1 - CanvasState.u0) / 2) * factor
  let hv = ((CanvasState.v1 - CanvasState.v0) / 2) * factor
  hu = Math.min(0.5, Math.max(0.03, hu)); hv = Math.min(0.5, Math.max(0.03, hv))
  CanvasState.u0 = clamp01(cu - hu); CanvasState.u1 = clamp01(cu + hu)
  CanvasState.v0 = clamp01(cv - hv); CanvasState.v1 = clamp01(cv + hv)
}
function pan(du: number, dv: number) {
  const wu = CanvasState.u1 - CanvasState.u0, wv = CanvasState.v1 - CanvasState.v0
  let nu0 = CanvasState.u0 + du * wu, nv0 = CanvasState.v0 + dv * wv
  nu0 = Math.min(1 - wu, Math.max(0, nu0)); nv0 = Math.min(1 - wv, Math.max(0, nv0))
  CanvasState.u0 = nu0; CanvasState.u1 = nu0 + wu
  CanvasState.v0 = nv0; CanvasState.v1 = nv0 + wv
}
function resetView() { CanvasState.u0 = 0; CanvasState.u1 = 1; CanvasState.v0 = 0; CanvasState.v1 = 1 }

// ── Overlay (lo monta ui.tsx) ──
export function GraffitiCanvasOverlay() {
  if (!CanvasState.open) return null
  const meta = getPanelMeta(CanvasState.panelId)
  if (!meta) return null

  // ANTI-PARPADEO: la textura del backend cambia de versión con cada flush (~80ms) mientras
  // pintás; recargarla cada vez la hacía titilar. Mientras pintás (o hasta 350ms después de
  // soltar) congelamos la versión mostrada y dejamos que los PUNTOS LOCALES sean la capa viva.
  // Recién al quedarte quieto refrescamos una vez la textura y limpiamos los puntos.
  const idle = !CanvasState.painting && (Date.now() - CanvasState.lastPaintAt > 350)
  if (idle && CanvasState.displayVersion !== meta.version) {
    CanvasState.displayVersion = meta.version
    CanvasState.dots = []
  }

  const aspect = meta.w / meta.h
  const cw = Math.min(CANVAS_W_MAX, Math.round(CANVAS_H * aspect))
  const ch = CANVAS_H
  const wu = CanvasState.u1 - CanvasState.u0, wv = CanvasState.v1 - CanvasState.v0
  const texSrc = `${API_BASE}/tex/${CanvasState.panelId}.png?v=${CanvasState.displayVersion}`
  const wallName = CanvasState.panelId.replace('wall', 'Pared ').toUpperCase()

  const cellW = cw / COLS, cellH = ch / ROWS

  return (
    // Backdrop: oscurece la escena y captura onMouseUp para soltar el trazo.
    <UiEntity
      uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
      uiBackground={{ color: Color4.create(0.02, 0.02, 0.04, 0.92) }}
      onMouseUp={() => { CanvasState.painting = false; CanvasState.lastU = CanvasState.lastV = null }}
    >
      <UiEntity uiTransform={{ width: cw + 40, height: ch + 130, flexDirection: 'column', alignItems: 'center', padding: 10 }}
        uiBackground={{ color: Color4.create(0.08, 0.08, 0.12, 0.96) }}>

        {/* Barra superior: título + zoom + salir */}
        <UiEntity uiTransform={{ width: cw, height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', margin: { bottom: 6 } }}>
          <Label value={`🎨 ${wallName}  ·  zoom ${(1 / wu).toFixed(1)}x`} fontSize={14} color={Color4.create(1, 0.85, 0.95, 1)} />
          <UiEntity uiTransform={{ flexDirection: 'row', alignItems: 'center' }}>
            <CanvasBtn label="↩️ Deshacer" w={88} color={Color4.create(0.45, 0.4, 0.2, 1)} onClick={() => { undoPanel(CanvasState.panelId); CanvasState.dots = []; CanvasState.lastPaintAt = 0 }} />
            <CanvasBtn label="–" w={30} onClick={() => zoom(1 / 0.7)} />
            <CanvasBtn label="+" w={30} onClick={() => zoom(0.7)} />
            <CanvasBtn label="⟳" w={30} onClick={resetView} />
            <CanvasBtn label="✕ Salir" w={70} color={Color4.create(0.55, 0.2, 0.2, 1)} onClick={closeCanvas} />
          </UiEntity>
        </UiEntity>

        {/* Lienzo: ladrillo de fondo + PNG del backend + puntos locales + grilla de clic */}
        <UiEntity uiTransform={{ width: cw, height: ch }}
          uiBackground={{ texture: { src: 'assets/textures/brick.jpg' }, textureMode: 'stretch' }}>
          {/* PNG pintado (transparente donde no hay pintura → se ve el ladrillo). uvs recorta la ventana de zoom. */}
          <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: cw, height: ch }}
            uiBackground={{
              texture: { src: texSrc }, textureMode: 'stretch',
              // uvs = corners [BL, TL, TR, BR]. Muestra la ventana visible y aplica el flip
              // horizontal para que el preview coincida con cómo se ve en la pared.
              uvs: FLIP_U
                ? [CanvasState.u1, CanvasState.v0, CanvasState.u1, CanvasState.v1, CanvasState.u0, CanvasState.v1, CanvasState.u0, CanvasState.v0]
                : [CanvasState.u0, CanvasState.v0, CanvasState.u0, CanvasState.v1, CanvasState.u1, CanvasState.v1, CanvasState.u1, CanvasState.v0]
            }} />

          {/* Puntos locales (feedback instantáneo mientras el backend procesa) */}
          {CanvasState.dots.map((d, i) => {
            const { fx, fy } = uvToFrac(d.u, d.v)
            const px = fx * cw
            const py = fy * ch
            if (d.text) {
              // Preview local del texto (centrado en el punto), hasta que el backend lo hornee.
              const fontPx = Math.max(8, (d.sizeFrac / wv) * ch)
              const bw = Math.max(40, d.text.length * fontPx * 0.62)
              return (
                <UiEntity key={`dot${i}`}
                  uiTransform={{ positionType: 'absolute', position: { left: px - bw / 2, top: py - fontPx / 2 }, width: bw, height: fontPx * 1.4, justifyContent: 'center', alignItems: 'center' }}>
                  <Label value={d.text} fontSize={fontPx} color={Color4.create(d.r, d.g, d.b, 1)} />
                </UiEntity>
              )
            }
            const dia = Math.max(4, (d.sizeFrac / wu) * cw)
            if (px < -dia || px > cw + dia || py < -dia || py > ch + dia) return null
            return (
              <UiEntity key={`dot${i}`}
                uiTransform={{ positionType: 'absolute', position: { left: px - dia / 2, top: py - dia / 2 }, width: dia, height: dia }}
                uiBackground={{ color: Color4.create(d.r, d.g, d.b, 0.92) }} />
            )
          })}

          {/* Grilla de celdas invisibles: clic = empezar, arrastrar (enter) = continuar */}
          {Array.from({ length: ROWS }).map((_, row) => (
            <UiEntity key={`r${row}`} uiTransform={{ positionType: 'absolute', position: { top: row * cellH, left: 0 }, width: cw, height: cellH, flexDirection: 'row' }}>
              {Array.from({ length: COLS }).map((__, col) => (
                <UiEntity key={`c${col}`}
                  uiTransform={{ width: cellW, height: cellH }}
                  onMouseDown={() => {
                    const { u, v } = cellUV(col, row)
                    if (CanvasState.textMode) { stampTextAt(u, v); return }   // ✍️ click = estampar texto
                    CanvasState.painting = true; CanvasState.lastU = CanvasState.lastV = null; paintAtUV(u, v)
                  }}
                  onMouseEnter={() => { if (CanvasState.painting && !CanvasState.textMode) { const { u, v } = cellUV(col, row); paintAtUV(u, v) } }}
                />
              ))}
            </UiEntity>
          ))}
        </UiEntity>

        {/* Pan + controles de pintura */}
        <UiEntity uiTransform={{ width: cw, height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: { top: 6 } }}>
          <CanvasBtn label="◀" w={30} onClick={() => pan(-0.25, 0)} />
          <CanvasBtn label="▲" w={30} onClick={() => pan(0, 0.25)} />
          <CanvasBtn label="▼" w={30} onClick={() => pan(0, -0.25)} />
          <CanvasBtn label="▶" w={30} onClick={() => pan(0.25, 0)} />
          <UiEntity uiTransform={{ width: 18, height: 24 }} />
          <CanvasBtn label="✍️ Texto" w={64} color={CanvasState.textMode ? Color4.create(0.2, 0.55, 0.75, 1) : Color4.create(0.15, 0.15, 0.2, 1)} onClick={() => { CanvasState.textMode = !CanvasState.textMode; CanvasState.painting = false }} />
          <CanvasBtn label="🌈" w={34} color={GraffitiState.rainbow ? Color4.create(0.6, 0.3, 0.8, 1) : Color4.create(0.15, 0.15, 0.2, 1)} onClick={() => { GraffitiState.rainbow = !GraffitiState.rainbow }} />
          <CanvasBtn label="🧽" w={34} color={GraffitiState.eraser ? Color4.create(0.8, 0.3, 0.3, 1) : Color4.create(0.15, 0.15, 0.2, 1)} onClick={() => { GraffitiState.eraser = !GraffitiState.eraser }} />
          {GRAFFITI_SIZE_LABELS.map((lbl, i) => (
            <CanvasBtn key={`s${i}`} label={lbl} w={28} color={GraffitiState.selectedSize === i ? Color4.create(0.25, 0.55, 0.85, 1) : Color4.create(0.15, 0.15, 0.2, 1)} onClick={() => { GraffitiState.selectedSize = i }} />
          ))}
        </UiEntity>

        {/* Campo de texto (solo en modo ✍️): escribí y clickeá en el lienzo para estampar. */}
        {CanvasState.textMode && (
          <UiEntity uiTransform={{ width: cw, height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: { top: 4 } }}>
            <Label value="✍️ Escribí y clickeá en la pared:" fontSize={12} color={Color4.create(0.7, 0.85, 1, 1)} uiTransform={{ margin: { right: 8 } }} />
            <Input
              uiTransform={{ width: Math.min(360, cw * 0.5), height: 28 }}
              uiBackground={{ color: Color4.create(0.12, 0.12, 0.16, 1) }}
              placeholder="tu texto…" fontSize={14} color={Color4.White()}
              value={CanvasState.textValue}
              onChange={(v) => { CanvasState.textValue = v }}
              onSubmit={(v) => { CanvasState.textValue = v }}
            />
          </UiEntity>
        )}

        {/* Paleta de colores */}
        <UiEntity uiTransform={{ width: cw, height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: { top: 4 } }}>
          {GRAFFITI_PALETTE.map((c, i) => {
            const sel = GraffitiState.selectedColor === i && !GraffitiState.rainbow
            return (
              <UiEntity key={`col${i}`}
                uiTransform={{ width: sel ? 26 : 22, height: sel ? 26 : 22, margin: { left: 3, right: 3 } }}
                uiBackground={{ color: Color4.create(c.r, c.g, c.b, 1) }}
                onMouseDown={() => { GraffitiState.selectedColor = i; GraffitiState.rainbow = false }} />
            )
          })}
        </UiEntity>
      </UiEntity>
    </UiEntity>
  )
}

// Botón compacto reutilizable del editor.
function CanvasBtn(props: { key?: string; label: string; w: number; color?: Color4; onClick: () => void }) {
  return (
    <UiEntity uiTransform={{ width: props.w, height: 26, margin: { left: 3, right: 3 }, justifyContent: 'center', alignItems: 'center' }}
      uiBackground={{ color: props.color || Color4.create(0.18, 0.18, 0.24, 1) }}
      onMouseDown={() => { props.onClick(); GraffitiState.lastUiClickTime = Date.now() }}>
      <Label value={props.label} fontSize={12} color={Color4.White()} />
    </UiEntity>
  )
}
