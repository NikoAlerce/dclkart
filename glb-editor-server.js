/**
 * GLB Editor Server — Decentraland Scene Tool v2
 * node glb-editor-server.js
 */
const http = require('http')
const fs   = require('fs')
const path = require('path')
const url  = require('url')

const PORT             = 9000
const MODELS_DIR       = path.join(__dirname, 'assets', 'models')
const INDEX_TS         = path.join(__dirname, 'src', 'index.ts')
const KART_CONFIG_PATH = path.join(__dirname, 'src', 'kartConfig.ts')
const SCENE_JSON       = path.join(__dirname, 'scene.json')

// ── PARSER: extrae entidades GLB del index.ts ─────────────────
function parseIndexTs() {
  const src = fs.readFileSync(INDEX_TS, 'utf8')
  const entities = []

  const gltfRe = /GltfContainer\.create\((\w+),\s*\{[^}]*src:\s*['"]([^'"]+)['"]/gs
  const gltfMap = {}
  let m
  while ((m = gltfRe.exec(src)) !== null) {
    gltfMap[m[1]] = m[2]
  }

  // Encontrar todos los Transform.create(varName, { ... })
  const transRe = /Transform\.create\((\w+),\s*\{([\s\S]*?)\}\)/g
  while ((m = transRe.exec(src)) !== null) {
    const varName = m[1]
    if (gltfMap[varName]) {
      const body = m[2]
      
      // Parse position
      const posM = body.match(/position:\s*Vector3\.create\(([^)]+)\)/)
      const position = posM ? posM[1].split(',').map(s => parseFloat(s.trim())) : [0,0,0]
      
      // Parse scale
      const scaleM = body.match(/scale:\s*Vector3\.create\(([^)]+)\)/)
      const scale = scaleM ? scaleM[1].split(',').map(s => parseFloat(s.trim())) : [1,1,1]
      
      // Parse rotation
      const rotM = body.match(/rotation:\s*Quaternion\.create\(([^)]+)\)/)
      const rotation = rotM ? rotM[1].split(',').map(s => parseFloat(s.trim())) : [0,0,0,1]
      
      entities.push({
        varName,
        src: gltfMap[varName],
        position: { x: position[0]||0, y: position[1]||0, z: position[2]||0 },
        scale: { x: scale[0]||1, y: scale[1]||1, z: scale[2]||1 },
        rotation: { x: rotation[0]||0, y: rotation[1]||0, z: rotation[2]||0, w: rotation[3]||1 }
      })
    }
  }
  return entities
}

// ── PARSER: extrae karts de kartConfig.ts ──────────────────────
function parseKartConfigs() {
  if (!fs.existsSync(KART_CONFIG_PATH)) return []
  const rawSrc = fs.readFileSync(KART_CONFIG_PATH, 'utf8')
  // Remove comments so commented-out kart examples are not parsed
  const src = rawSrc.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1')
  
  const getConst = (name, def) => {
    const re = new RegExp(`const\\s+${name}\\s*=\\s*(-?\\d+\\.?\\d*)`, 'i')
    const m = src.match(re)
    return m ? parseFloat(m[1]) : def
  }
  
  const BASE_X = getConst('BASE_X', 366.3)
  const BASE_Y = getConst('BASE_Y', 8.6)
  const BASE_Z = getConst('BASE_Z', 316.2)
  const LATERAL = getConst('LATERAL', 4.5)
  const ROW_GAP = getConst('ROW_GAP', 6.0)
  const LAT_DX = getConst('LAT_DX', -0.643)
  const LAT_DZ = getConst('LAT_DZ', 0.766)
  const BACK_DX = getConst('BACK_DX', -0.766)
  const BACK_DZ = getConst('BACK_DZ', -0.643)
  
  const kartPos = (row, col) => {
    const lat = (col - 2) * LATERAL
    const x = BASE_X + lat * LAT_DX + row * ROW_GAP * BACK_DX
    const z = BASE_Z + lat * LAT_DZ + row * ROW_GAP * BACK_DZ
    return { x, y: BASE_Y, z }
  }

  const karts = []
  const blockRe = /\{\s*id:\s*(\d+),[\s\S]*?\}/g
  let m
  while ((m = blockRe.exec(src)) !== null) {
    const block = m[0]
    const id = parseInt(m[1])
    
    const pathM = block.match(/modelPath:\s*['"]([^'"]+)['"]/)
    if (!pathM) continue
    const modelPath = pathM[1]
    
    let position = { x: 0, y: 0, z: 0 }
    const posM = block.match(/spawnPos:\s*(kartPos\(\s*(\d+)\s*,\s*(\d+)\s*\)|Vector3\.create\(([^)]+)\))/)
    if (posM) {
      if (posM[1].startsWith('kartPos')) {
        const row = parseInt(posM[2])
        const col = parseInt(posM[3])
        position = kartPos(row, col)
      } else {
        const parts = posM[4].split(',').map(s => parseFloat(s.trim()))
        position = { x: parts[0]||0, y: parts[1]||0, z: parts[2]||0 }
      }
    }
    
    // Parse spawnRotY (yaw in degrees)
    const rotM = block.match(/spawnRotY:\s*(-?\\d+\\.?\\d*)/)
    const yawDeg = rotM ? parseFloat(rotM[1]) : 0.0
    // Convert yawDeg to Quaternion (yaw rotation in ThreeJS around Y axis)
    const yawRad = yawDeg * Math.PI / 180
    const qy = Math.sin(yawRad / 2)
    const qw = Math.cos(yawRad / 2)
    const rotation = { x: 0, y: qy, z: 0, w: qw }
    
    // Parse scale
    const scaleM = block.match(/scale:\s*(-?\\d+\\.?\\d*)/)
    const s = scaleM ? parseFloat(scaleM[1]) : 1.0
    const scale = { x: s, y: s, z: s }
    
    karts.push({
      varName: `kart_${id}`,
      src: modelPath,
      position,
      rotation,
      scale,
      isKart: true,
      id
    })
  }
  return karts
}

// ── PARSER: extrae el spawnPoint de scene.json ─────────────────
function parseSpawnArea() {
  if (!fs.existsSync(SCENE_JSON)) return []
  const scene = JSON.parse(fs.readFileSync(SCENE_JSON, 'utf8'))
  if (!scene.spawnPoints || scene.spawnPoints.length === 0) return []
  
  const sp = scene.spawnPoints[0]
  const px = sp.position.x || [0, 0]
  const py = sp.position.y || [0, 0]
  const pz = sp.position.z || [0, 0]
  
  return [{
    varName: 'spawn_area',
    src: 'assets/models/SPAWN_AREA', // Dummy
    position: {
      x: (px[0] + px[1]) / 2,
      y: (py[0] + py[1]) / 2,
      z: (pz[0] + pz[1]) / 2
    },
    size: {
      x: Math.abs(px[1] - px[0]) || 4,
      y: Math.abs(py[1] - py[0]) || 2,
      z: Math.abs(pz[1] - pz[0]) || 4
    },
    isSpawnArea: true
  }]
}

// ── WRITER: actualiza posición de una entidad en index.ts ─────
function updatePosition(varName, x, y, z) {
  let src = fs.readFileSync(INDEX_TS, 'utf8')
  const re = new RegExp(
    `(Transform\\.create\\(${varName},[\\s\\S]*?position:\\s*Vector3\\.create\\()([^)]+)(\\))`,
    'g'
  )
  let replaced = false
  const newSrc = src.replace(re, (match, pre, _coords, post) => {
    replaced = true
    return `${pre}${x}, ${y}, ${z}${post}`
  })
  if (!replaced) throw new Error(`No se encontró Transform.create(${varName}, ...) en index.ts`)
  fs.writeFileSync(INDEX_TS, newSrc, 'utf8')
}

// ── WRITER: actualiza posición, rotación y escala de una entidad en index.ts ────
function updatePositionRotationScale(varName, x, y, z, rx, ry, rz, rw, sx, sy, sz) {
  let src = fs.readFileSync(INDEX_TS, 'utf8')
  
  // Encontrar el bloque Transform.create(varName, { ... })
  const re = new RegExp(`(Transform\\.create\\(${varName},\\s*\\{)([\\s\\S]*?)(\\}\\))`, 'g')
  
  let replaced = false
  src = src.replace(re, (match, pre, body, post) => {
    replaced = true
    let newBody = body
    
    // Reemplazar posición
    if (newBody.includes('position:')) {
      newBody = newBody.replace(/position:\s*Vector3\.create\([^)]+\)/, `position: Vector3.create(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`)
    } else {
      newBody = `    position: Vector3.create(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}),\n` + newBody
    }
    
    // Reemplazar rotación
    if (newBody.includes('rotation:')) {
      newBody = newBody.replace(/rotation:\s*Quaternion\.create\([^)]+\)/, `rotation: Quaternion.create(${rx.toFixed(4)}, ${ry.toFixed(4)}, ${rz.toFixed(4)}, ${rw.toFixed(4)})`)
    } else {
      newBody = newBody.replace(/(position:\s*Vector3\.create\([^)]+\),?)/, `$1\n    rotation: Quaternion.create(${rx.toFixed(4)}, ${ry.toFixed(4)}, ${rz.toFixed(4)}, ${rw.toFixed(4)}),`)
    }
    
    // Reemplazar escala
    if (newBody.includes('scale:')) {
      newBody = newBody.replace(/scale:\s*Vector3\.create\([^)]+\)/, `scale: Vector3.create(${sx.toFixed(3)}, ${sy.toFixed(3)}, ${sz.toFixed(3)})`)
    } else {
      newBody = newBody.replace(/(rotation:\s*Quaternion\.create\([^)]+\),?)/, `$1\n    scale: Vector3.create(${sx.toFixed(3)}, ${sy.toFixed(3)}, ${sz.toFixed(3)}),`)
    }
    
    return `${pre}${newBody}${post}`
  })
  
  if (!replaced) throw new Error(`No se encontró Transform.create(${varName}, ...) en index.ts`)
  fs.writeFileSync(INDEX_TS, src, 'utf8')
}

// ── WRITER: actualiza posición de un kart en kartConfig.ts ────
function updateKartPosition(id, x, y, z) {
  let src = fs.readFileSync(KART_CONFIG_PATH, 'utf8')
  const re = new RegExp(
    `(\\{\\s*id:\\s*${id},\\s*modelPath:\\s*['"][^'"]+['"],\\s*spawnPos:\\s*)(kartPos\\([^)]+\\)|Vector3\\.create\\([^)]+\\))`,
    'g'
  )
  let replaced = false
  const newSrc = src.replace(re, (match, pre) => {
    replaced = true
    return `${pre}Vector3.create(${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`
  })
  if (!replaced) throw new Error(`No se encontró el kart con ID ${id} en kartConfig.ts`)
  fs.writeFileSync(KART_CONFIG_PATH, newSrc, 'utf8')
}

// ── WRITER: actualiza posición, rotación y escala de un kart en kartConfig.ts ────
function updateKartConfig(id, x, y, z, rx, ry, rz, rw, sx) {
  let src = fs.readFileSync(KART_CONFIG_PATH, 'utf8')
  
  // Calcular spawnRotY desde Quaternion (yaw)
  const siny_cosp = 2 * (rw * ry + rx * rz)
  const cosy_cosp = 1 - 2 * (ry * ry + rz * rz)
  let yawRad = Math.atan2(siny_cosp, cosy_cosp)
  let yawDeg = Math.round((yawRad * 180 / Math.PI) * 10) / 10
  if (yawDeg < 0) yawDeg += 360
  
  // Buscar la entrada del kart en KART_CONFIGS
  const re = new RegExp(`(\\{\\s*id:\\s*${id},[\\s\\S]*?\\})`, 'g')
  let replaced = false
  const newSrc = src.replace(re, (match) => {
    replaced = true
    let block = match
    
    // Actualizar spawnPos
    if (block.match(/spawnPos:\s*(?:kartPos\([^)]+\)|Vector3\.create\([^)]+\))/)) {
      block = block.replace(/spawnPos:\s*(?:kartPos\([^)]+\)|Vector3\.create\([^)]+\))/, `spawnPos: Vector3.create(${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`)
    }
    
    // Actualizar spawnRotY
    if (block.includes('spawnRotY:')) {
      block = block.replace(/spawnRotY:\s*[^,}]+/, `spawnRotY: ${yawDeg.toFixed(1)}`)
    } else {
      block = block.replace(/(spawnPos:\s*Vector3\.create\([^)]+\),?)/, `$1 spawnRotY: ${yawDeg.toFixed(1)},`)
    }
    
    // Actualizar escala
    if (sx !== undefined && Math.abs(sx - 1.0) > 0.01) {
      if (block.includes('scale:')) {
        block = block.replace(/scale:\s*[^,}]+/, `scale: ${sx.toFixed(2)}`)
      } else {
        if (block.includes('spawnRotY:')) {
          block = block.replace(/(spawnRotY:\s*[^,}]+)/, `$1, scale: ${sx.toFixed(2)}`)
        } else {
          block = block.replace(/(spawnPos:\s*Vector3\.create\([^)]+\),?)/, `$1 scale: ${sx.toFixed(2)},`)
        }
      }
    } else if (block.includes('scale:')) {
      block = block.replace(/,\s*scale:\s*[^,}]+/, '')
      block = block.replace(/scale:\s*[^,}]+,\s*/, '')
    }
    
    return block
  })
  
  if (!replaced) throw new Error(`No se encontró el kart con ID ${id} en kartConfig.ts`)
  fs.writeFileSync(KART_CONFIG_PATH, newSrc, 'utf8')
}

function updateSpawnArea(x, y, z, rx, ry, rz, rw, sx, sy, sz) {
  // Auto-adjust Y based on horizontal area to prevent falling through elevated models
  let adjustedY = y
  if (x > -60) {
    adjustedY = 11.0 // Parking lot surface is at ~10.7
  } else if (x < -140) {
    adjustedY = 9.0  // Track starting line surface is at ~8.6
  }

  const scene = JSON.parse(fs.readFileSync(SCENE_JSON, 'utf8'))
  if (!scene.spawnPoints || scene.spawnPoints.length === 0) {
    scene.spawnPoints = [{
      name: "spawn_paddock",
      default: true,
      position: { x: [3.7, 13.7], y: [11.0, 11.0], z: [0.3, 5.3] },
      cameraTarget: { x: 8.7, y: 10.6, z: -4.7 }
    }]
  }
  const sp = scene.spawnPoints[0]

  const px = sp.position.x || [3.7, 13.7]
  const py = sp.position.y || [11.0, 11.0]
  const pz = sp.position.z || [0.3, 5.3]

  const baseSizeX = Math.abs(px[1] - px[0]) || 10
  const baseSizeY = Math.abs(py[1] - py[0]) || 2
  const baseSizeZ = Math.abs(pz[1] - pz[0]) || 5

  const sizeX = sx !== undefined ? baseSizeX * sx : baseSizeX
  const sizeY = sy !== undefined ? baseSizeY * sy : baseSizeY
  const sizeZ = sz !== undefined ? baseSizeZ * sz : baseSizeZ

  sp.position.x[0] = Math.round((x - sizeX / 2) * 10) / 10
  sp.position.x[1] = Math.round((x + sizeX / 2) * 10) / 10
  sp.position.y[0] = Math.round((adjustedY - sizeY / 2) * 10) / 10
  sp.position.y[1] = Math.round((adjustedY + sizeY / 2) * 10) / 10
  sp.position.z[0] = Math.round((z - sizeZ / 2) * 10) / 10
  sp.position.z[1] = Math.round((z + sizeZ / 2) * 10) / 10

  // Calculate spawnRotY (yaw) from Quaternion
  let yawDeg = 180.0 // Default looking South (z - 5)
  if (rx !== undefined && ry !== undefined && rz !== undefined && rw !== undefined) {
    const siny_cosp = 2 * (rw * ry + rx * rz)
    const cosy_cosp = 1 - 2 * (ry * ry + rz * rz)
    let yawRad = Math.atan2(siny_cosp, cosy_cosp)
    yawDeg = Math.round((yawRad * 180 / Math.PI) * 10) / 10
    if (yawDeg < 0) yawDeg += 360
  }

  // Calculate forward vector based on yaw to set cameraTarget
  const yawRad = yawDeg * Math.PI / 180
  const fwdX = Math.sin(yawRad)
  const fwdZ = Math.cos(yawRad)

  if (sp.cameraTarget) {
    sp.cameraTarget.x = Math.round((x + fwdX * 5.0) * 10) / 10
    sp.cameraTarget.y = Math.round(adjustedY * 10) / 10
    sp.cameraTarget.z = Math.round((z + fwdZ * 5.0) * 10) / 10
  }

  fs.writeFileSync(SCENE_JSON, JSON.stringify(scene, null, 2), 'utf8')

  // Also update src/spawnConfig.ts so index.ts gets the live coordinates and rotation target
  const spawnConfigPath = path.join(__dirname, 'src', 'spawnConfig.ts')
  const content = `import { Vector3 } from '@dcl/sdk/math'

export const SPAWN_POSITION = Vector3.create(${x.toFixed(1)}, ${adjustedY.toFixed(1)}, ${z.toFixed(1)})
export const SPAWN_PLATFORM = Vector3.create(${x.toFixed(1)}, ${(adjustedY - 0.4).toFixed(1)}, ${z.toFixed(1)})
export const SPAWN_CAMERA_TARGET = Vector3.create(${(x + fwdX * 5.0).toFixed(1)}, ${adjustedY.toFixed(1)}, ${(z + fwdZ * 5.0).toFixed(1)})
export const SPAWN_ROTATION_Y = ${yawDeg.toFixed(1)}
`
  fs.writeFileSync(spawnConfigPath, content, 'utf8')
}


// ── SCENE.JSON: lee parcelas ──────────────────────────────────
function getSceneInfo() {
  const scene = JSON.parse(fs.readFileSync(SCENE_JSON, 'utf8'))
  const parcels = scene.scene.parcels
  const base    = scene.scene.base

  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
  parcels.forEach(p => {
    const [x, z] = p.split(',').map(Number)
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
  })
  const cols = maxX - minX + 1
  const rows = maxZ - minZ + 1

  return {
    total: parcels.length,
    base,
    cols,
    rows,
    minX, minZ, maxX, maxZ,
    worldSizeMeters: { x: cols * 16, z: rows * 16 }
  }
}

// ── WRITER: actualiza parcelas en scene.json ──────────────────
function setParcels(cols, rows, baseX, baseZ) {
  const scene = JSON.parse(fs.readFileSync(SCENE_JSON, 'utf8'))
  const parcels = []
  for (let x = baseX; x < baseX + cols; x++) {
    for (let z = baseZ; z < baseZ + rows; z++) {
      parcels.push(`${x},${z}`)
    }
  }
  scene.scene.parcels = parcels
  scene.scene.base    = `${baseX},${baseZ}`
  fs.writeFileSync(SCENE_JSON, JSON.stringify(scene, null, 2), 'utf8')
  return { ok: true, total: parcels.length }
}

// ── HTTP ──────────────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}
function json(res, data, status=200) {
  cors(res); res.writeHead(status, {'Content-Type':'application/json'})
  res.end(JSON.stringify(data))
}

http.createServer((req, res) => {
  const parsed   = url.parse(req.url, true)
  const pathname = parsed.pathname

  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return }

  // Serve editor HTML
  if (req.method === 'GET' && (pathname === '/' || pathname === '/editor')) {
    cors(res); res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'})
    res.end(fs.readFileSync(path.join(__dirname, 'glb-editor.html'), 'utf8'))
    return
  }

  // List GLB models
  if (req.method === 'GET' && pathname === '/api/models') {
    const files = fs.readdirSync(MODELS_DIR)
      .filter(f => f.endsWith('.glb'))
      .map(f => ({ name: f, size: fs.statSync(path.join(MODELS_DIR, f)).size }))
    json(res, files); return
  }

  // Serve GLB binary
  const glbM = pathname.match(/^\/api\/model\/(.+\.glb)$/)
  if (req.method === 'GET' && glbM) {
    const decodedFilename = decodeURIComponent(glbM[1])
    const fp = path.join(MODELS_DIR, decodedFilename)
    if (!fs.existsSync(fp)) { json(res, {error:'Not found'}, 404); return }
    cors(res); res.writeHead(200, {'Content-Type':'model/gltf-binary'})
    fs.createReadStream(fp).pipe(res); return
  }

  // Get entities (merged index.ts + kartConfig.ts + spawnPoint from scene.json)
  if (req.method === 'GET' && pathname === '/api/scene') {
    try {
      const sceneEnts = parseIndexTs()
      const kartEnts = parseKartConfigs()
      const spawnEnts = parseSpawnArea()
      json(res, [...sceneEnts, ...kartEnts, ...spawnEnts])
    }
    catch(e) { json(res, {error: e.message}, 500) }
    return
  }

  // Update entity position (supports single object or batch array)
  if (req.method === 'POST' && pathname === '/api/scene') {
    let body = ''
    req.on('data', d => body += d)
    req.on('end', () => {
      try {
        const payload = JSON.parse(body)
        console.log(`[SERVER] Recibido POST /api/scene:`, JSON.stringify(payload))
        const updates = Array.isArray(payload) ? payload : [payload]
        
        for (const update of updates) {
          const { varName, x, y, z, rx, ry, rz, rw, sx, sy, sz } = update
          if (varName === 'spawn_area') {
            updateSpawnArea(x, y, z, rx, ry, rz, rw, sx, sy, sz)
          } else if (varName.startsWith('kart_')) {
            const id = parseInt(varName.split('_')[1])
            if (rx !== undefined && sx !== undefined) {
              updateKartConfig(id, x, y, z, rx, ry, rz, rw, sx)
            } else {
              updateKartPosition(id, x, y, z)
            }
          } else {
            if (rx !== undefined && sx !== undefined) {
              updatePositionRotationScale(varName, x, y, z, rx, ry, rz, rw, sx, sy, sz)
            } else {
              updatePosition(varName, x, y, z)
            }
          }
        }
        json(res, { ok: true })
      } catch(e) { json(res, {error: e.message}, 400) }
    })
    return
  }

  // Client diagnostics logger
  if (req.method === 'GET' && pathname === '/api/diagnostics') {
    const logVal = parsed.query.log
    if (logVal) {
      console.log(`[BEVY RUNTIME LOG] ${decodeURIComponent(logVal)}`)
    }
    json(res, { ok: true })
    return
  }

  // Get scene.json info
  if (req.method === 'GET' && pathname === '/api/parcels') {
    try { json(res, getSceneInfo()) }
    catch(e) { json(res, {error: e.message}, 500) }
    return
  }

  // Set parcels
  if (req.method === 'POST' && pathname === '/api/parcels') {
    let body = ''
    req.on('data', d => body += d)
    req.on('end', () => {
      try {
        const {cols, rows, baseX, baseZ} = JSON.parse(body)
        json(res, setParcels(cols, rows, baseX, baseZ))
      } catch(e) { json(res, {error: e.message}, 400) }
    })
    return
  }

  json(res, {error:'Not found'}, 404)

}).listen(PORT, () => {
  console.log('')
  console.log('  ╔══════════════════════════════════════╗')
  console.log('  ║      GLB Editor Server v3 — listo!   ║')
  console.log(`  ║  Abrí:  http://localhost:${PORT}        ║`)
  console.log('  ╚══════════════════════════════════════╝')
  console.log('')
})
