// ─── Graffiti backend ─────────────────────────────────────────────────────────
// Persiste los graffitis renderizándolos a una IMAGEN (PNG) POR PANEL (pared pintable).
// La escena de Decentraland NO puede dibujar texturas en runtime, así que el "render a
// imagen" pasa acá: cada dab (mancha) llega por POST, se dibuja sobre el canvas del panel
// y se sirve el PNG por URL. La escena carga ese PNG en un plano y lo recarga cuando cambia.
//
// Esto hace al graffiti LIVIANO (1 plano+textura por pared en vez de miles de entidades),
// ILIMITADO (es un PNG) y PERSISTENTE entre sesiones (se guarda en disco).
//
//   npm install && npm start   (PORT por env, default 8787)
//
const express = require('express')
const fs = require('fs')
const path = require('path')
const { createCanvas } = require('@napi-rs/canvas')

// ── Paneles: id → resolución del PNG. Las COORDENADAS/medidas en el mundo viven en la
// escena (src/graffitiPanels.ts); el backend solo necesita el tamaño del lienzo. Agregá
// un panel acá Y en la escena con el mismo id. ──────────────────────────────────────────
const PANELS = {
  wallA: { w: 1024, h: 512 },
  wallB: { w: 1024, h: 512 },
  wallC: { w: 1024, h: 1024 }
}

const DATA = path.join(__dirname, 'data')
fs.mkdirSync(DATA, { recursive: true })

const app = express()
app.use(express.json({ limit: '64kb' }))
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.get('/log', (req, res) => {
  console.log('[CLIENT LOG]', req.query.msg)
  res.sendStatus(200)
})

// Estado en memoria por panel: lista de dabs + version + canvas + dirty (para persistir).
const panels = {}
for (const id of Object.keys(PANELS)) {
  const { w, h } = PANELS[id]
  panels[id] = { dabs: [], version: 0, canvas: createCanvas(w, h), dirty: false, nextGroup: 0 }
  const f = path.join(DATA, id + '.json')
  if (fs.existsSync(f)) {
    try {
      const s = JSON.parse(fs.readFileSync(f, 'utf8'))
      panels[id].dabs = s.dabs || []
      panels[id].version = s.version || 0
      // Agrupar para el DESHACER: cada trazo/texto comparte `grp`. A los dabs viejos sin grupo
      // les damos uno propio incremental (deshacer los quita de a uno; los nuevos, por trazo).
      let maxG = -1
      for (const d of panels[id].dabs) {
        if (typeof d.grp !== 'number') { maxG++; d.grp = maxG } else if (d.grp > maxG) maxG = d.grp
      }
      panels[id].nextGroup = maxG + 1
      redraw(id)
      console.log(`[panel ${id}] cargado: ${panels[id].dabs.length} dabs`)
    } catch (e) { console.warn('no se pudo cargar', id, e.message) }
  }
}

function drawDab(ctx, d, w, h) {
  // TEXTO: stamp con fillText. d = { t:'text', u, v, text, r, g, b, size } donde size = fracción
  // del ALTO del panel (→ tamaño de fuente en px). Va antes que la lógica de borrador para que
  // el texto negro (0,0,0) no se confunda con el borrador.
  if (d.t === 'text' || typeof d.text === 'string') {
    const fontPx = Math.max(8, (d.size || 0.05) * h)
    const tx = d.u * w, ty = (1 - d.v) * h
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = `rgb(${Math.round(d.r * 255)},${Math.round(d.g * 255)},${Math.round(d.b * 255)})`
    ctx.font = `bold ${Math.round(fontPx)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // El plano 3D de la pared mapea la textura ESPEJADA en horizontal (rotación 180° Y). Las
    // manchas son simétricas y no se notan, pero el texto sí: lo dibujamos ya espejado en el
    // PNG (scale -1 en X sobre su propio centro) para que en la pared se lea correcto.
    ctx.save()
    ctx.translate(tx, 0)
    ctx.scale(-1, 1)
    ctx.fillText(String(d.text).slice(0, 80), 0, ty)
    ctx.restore()
    return
  }
  // d = { u, v, r, g, b, size, eraser }  (u,v en 0..1 ; size = fracción del ANCHO del panel)
  const x = d.u * w, y = (1 - d.v) * h
  const radius = Math.max(2, d.size * w)
  const isEraser = d.eraser || (d.r === 0 && d.g === 0 && d.b === 0 && d.size > 0)
  
  if (isEraser) {
    ctx.globalCompositeOperation = 'destination-out'
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius)
    g.addColorStop(0, 'rgba(0,0,0,1)')
    g.addColorStop(0.65, 'rgba(0,0,0,0.5)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
  } else {
    ctx.globalCompositeOperation = 'source-over'
    const c = `${Math.round(d.r * 255)},${Math.round(d.g * 255)},${Math.round(d.b * 255)}`
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius)
    g.addColorStop(0, `rgba(${c},0.95)`)
    g.addColorStop(0.65, `rgba(${c},0.55)`)
    g.addColorStop(1, `rgba(${c},0)`)
    ctx.fillStyle = g
  }
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
}

function redraw(id) {
  const p = panels[id], { w, h } = PANELS[id]
  const ctx = p.canvas.getContext('2d')
  ctx.clearRect(0, 0, w, h)
  for (const d of p.dabs) drawDab(ctx, d, w, h)
}

// POST /dab  { panel, u, v, r, g, b, size, eraser }  → dibuja una mancha y guarda
app.post('/dab', (req, res) => {
  const b = req.body || {}
  const p = panels[b.panel]
  if (!p) return res.status(404).json({ error: 'panel desconocido' })
  const d = { u: +b.u, v: +b.v, r: +b.r, g: +b.g, b: +b.b, size: +b.size || 0.03, eraser: !!b.eraser, grp: p.nextGroup++ }
  if (!isFinite(d.u) || !isFinite(d.v)) return res.status(400).json({ error: 'uv' })
  p.dabs.push(d)
  if (p.dabs.length > 60000) p.dabs.shift() // tope sano de memoria/disco
  drawDab(p.canvas.getContext('2d'), d, PANELS[b.panel].w, PANELS[b.panel].h)
  p.version++
  p.dirty = true
  res.json({ ok: true, version: p.version })
})

// POST /dabs  { panel, dabs:[{u,v,r,g,b,size,eraser}, ...] }  → batch (un trazo = muchas manchas)
app.post('/dabs', (req, res) => {
  const b = req.body || {}
  const p = panels[b.panel]
  if (!p) return res.status(404).json({ error: 'panel desconocido' })
  const arr = Array.isArray(b.dabs) ? b.dabs : []
  const ctx = p.canvas.getContext('2d')
  const { w, h } = PANELS[b.panel]
  const grp = p.nextGroup++   // todo el batch (un trazo) comparte grupo → el DESHACER lo quita junto
  let n = 0
  for (const raw of arr) {
    const d = { u: +raw.u, v: +raw.v, r: +raw.r, g: +raw.g, b: +raw.b, size: +raw.size || 0.03, eraser: !!raw.eraser, grp }
    if (!isFinite(d.u) || !isFinite(d.v)) continue
    p.dabs.push(d); drawDab(ctx, d, w, h); n++
  }
  while (p.dabs.length > 60000) p.dabs.shift()
  if (n > 0) { p.version++; p.dirty = true }
  res.json({ ok: true, added: n, version: p.version })
})

// POST /text  { panel, u, v, text, r, g, b, size }  → estampa una palabra/frase y la guarda
app.post('/text', (req, res) => {
  const b = req.body || {}
  const p = panels[b.panel]
  if (!p) return res.status(404).json({ error: 'panel desconocido' })
  const text = String(b.text || '').slice(0, 80)
  const d = { t: 'text', u: +b.u, v: +b.v, text, r: +b.r, g: +b.g, b: +b.b, size: +b.size || 0.05, grp: p.nextGroup++ }
  if (!isFinite(d.u) || !isFinite(d.v) || !text) return res.status(400).json({ error: 'uv/text' })
  p.dabs.push(d)
  if (p.dabs.length > 60000) p.dabs.shift()
  drawDab(p.canvas.getContext('2d'), d, PANELS[b.panel].w, PANELS[b.panel].h)
  p.version++
  p.dirty = true
  res.json({ ok: true, version: p.version })
})

// POST /undo  { panel }  → deshace el ÚLTIMO trazo/texto (quita el grupo más reciente)
app.post('/undo', (req, res) => {
  const p = panels[(req.body || {}).panel]
  if (!p) return res.status(404).json({ error: 'panel desconocido' })
  if (p.dabs.length === 0) return res.json({ ok: true, removed: 0, version: p.version, empty: true })
  let maxG = -Infinity
  for (const d of p.dabs) if (typeof d.grp === 'number' && d.grp > maxG) maxG = d.grp
  const before = p.dabs.length
  p.dabs = p.dabs.filter((d) => d.grp !== maxG)
  redraw((req.body || {}).panel)
  p.version++
  p.dirty = true
  res.json({ ok: true, removed: before - p.dabs.length, version: p.version })
})

// GET /dabs/:id  → devuelve todas las manchas de un panel (usado por el editor 2D)
app.get('/dabs/:id', (req, res) => {
  const p = panels[req.params.id]
  if (!p) return res.sendStatus(404)
  res.json({ dabs: p.dabs })
})

// GET /paint  → sirve el editor de canvas plano en el navegador
app.get('/paint', (req, res) => {
  res.sendFile(path.join(__dirname, 'paint.html'))
})

// GET /tex/:id.png  → el PNG del panel (lo carga la escena como textura)
app.get('/tex/:id.png', (req, res) => {
  const p = panels[req.params.id]
  if (!p) return res.sendStatus(404)
  res.set('Content-Type', 'image/png')
  res.set('Cache-Control', 'no-cache')
  res.send(p.canvas.toBuffer('image/png'))
})

// GET /versions  → { id: version }  (la escena lo consulta para saber cuándo recargar)
app.get('/versions', (_req, res) => {
  const out = {}
  for (const id of Object.keys(panels)) out[id] = panels[id].version
  res.json(out)
})

// Owner: limpiar un panel (o todos). Protegé esto con un token si lo exponés.
app.post('/clear', (req, res) => {
  const id = (req.body || {}).panel
  const ids = id ? [id] : Object.keys(panels)
  for (const k of ids) {
    if (!panels[k]) continue
    panels[k].dabs = []; panels[k].version++; panels[k].dirty = true; redraw(k)
  }
  res.json({ ok: true, cleared: ids })
})

app.get('/', (_req, res) => res.json({ ok: true, panels: Object.keys(panels) }))

// Persistencia throttled: graba a disco los paneles "dirty" cada 2s.
setInterval(() => {
  for (const id of Object.keys(panels)) {
    const p = panels[id]
    if (!p.dirty) continue
    p.dirty = false
    fs.writeFile(path.join(DATA, id + '.json'), JSON.stringify({ dabs: p.dabs, version: p.version }), () => {})
  }
}, 2000)

const PORT = process.env.PORT || 8787
app.listen(PORT, () => console.log(`graffiti backend escuchando en :${PORT}`))
