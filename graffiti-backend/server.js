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

// Estado en memoria por panel: lista de dabs + version + canvas + dirty (para persistir).
const panels = {}
for (const id of Object.keys(PANELS)) {
  const { w, h } = PANELS[id]
  panels[id] = { dabs: [], version: 0, canvas: createCanvas(w, h), dirty: false }
  const f = path.join(DATA, id + '.json')
  if (fs.existsSync(f)) {
    try {
      const s = JSON.parse(fs.readFileSync(f, 'utf8'))
      panels[id].dabs = s.dabs || []
      panels[id].version = s.version || 0
      redraw(id)
      console.log(`[panel ${id}] cargado: ${panels[id].dabs.length} dabs`)
    } catch (e) { console.warn('no se pudo cargar', id, e.message) }
  }
}

function drawDab(ctx, d, w, h) {
  // d = { u, v, r, g, b, size }  (u,v en 0..1 ; size = fracción del ANCHO del panel)
  const x = d.u * w, y = (1 - d.v) * h
  const radius = Math.max(2, d.size * w)
  const c = `${Math.round(d.r * 255)},${Math.round(d.g * 255)},${Math.round(d.b * 255)}`
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius)
  g.addColorStop(0, `rgba(${c},0.95)`)
  g.addColorStop(0.65, `rgba(${c},0.55)`)
  g.addColorStop(1, `rgba(${c},0)`)
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill()
}

function redraw(id) {
  const p = panels[id], { w, h } = PANELS[id]
  const ctx = p.canvas.getContext('2d')
  ctx.clearRect(0, 0, w, h)
  for (const d of p.dabs) drawDab(ctx, d, w, h)
}

// POST /dab  { panel, u, v, r, g, b, size }  → dibuja una mancha y guarda
app.post('/dab', (req, res) => {
  const b = req.body || {}
  const p = panels[b.panel]
  if (!p) return res.status(404).json({ error: 'panel desconocido' })
  const d = { u: +b.u, v: +b.v, r: +b.r, g: +b.g, b: +b.b, size: +b.size || 0.03 }
  if (!isFinite(d.u) || !isFinite(d.v)) return res.status(400).json({ error: 'uv' })
  p.dabs.push(d)
  if (p.dabs.length > 60000) p.dabs.shift() // tope sano de memoria/disco
  drawDab(p.canvas.getContext('2d'), d, PANELS[b.panel].w, PANELS[b.panel].h)
  p.version++
  p.dirty = true
  res.json({ ok: true, version: p.version })
})

// POST /dabs  { panel, dabs:[{u,v,r,g,b,size}, ...] }  → batch (un trazo = muchas manchas)
app.post('/dabs', (req, res) => {
  const b = req.body || {}
  const p = panels[b.panel]
  if (!p) return res.status(404).json({ error: 'panel desconocido' })
  const arr = Array.isArray(b.dabs) ? b.dabs : []
  const ctx = p.canvas.getContext('2d')
  const { w, h } = PANELS[b.panel]
  let n = 0
  for (const raw of arr) {
    const d = { u: +raw.u, v: +raw.v, r: +raw.r, g: +raw.g, b: +raw.b, size: +raw.size || 0.03 }
    if (!isFinite(d.u) || !isFinite(d.v)) continue
    p.dabs.push(d); drawDab(ctx, d, w, h); n++
  }
  while (p.dabs.length > 60000) p.dabs.shift()
  if (n > 0) { p.version++; p.dirty = true }
  res.json({ ok: true, added: n, version: p.version })
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
