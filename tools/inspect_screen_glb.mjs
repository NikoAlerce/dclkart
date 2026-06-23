import { NodeIO } from '@gltf-transform/core'

const io = new NodeIO()

function multiplyColumnMajor(a, b) {
  const out = new Array(16).fill(0)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[col * 4 + k]
      }
      out[col * 4 + row] = sum
    }
  }
  return out
}

function getColumnMajorMatrix(node) {
  const t = node.getTranslation() || [0, 0, 0]
  const r = node.getRotation() || [0, 0, 0, 1]
  const s = node.getScale() || [1, 1, 1]

  const x = r[0], y = r[1], z = r[2], w = r[3]
  const x2 = x + x, y2 = y + y, z2 = z + z
  const xx = x * x2, xy = x * y2, xz = x * z2
  const yy = y * y2, yz = y * z2, zz = z * z2
  const wx = w * x2, wy = w * y2, wz = w * z2

  const m = new Array(16).fill(0)

  m[0] = (1 - (yy + zz)) * s[0]
  m[1] = (xy + wz) * s[0]
  m[2] = (xz - wy) * s[0]
  m[3] = 0

  m[4] = (xy - wz) * s[1]
  m[5] = (1 - (xx + zz)) * s[1]
  m[6] = (yz + wx) * s[1]
  m[7] = 0

  m[8] = (xz + wy) * s[2]
  m[9] = (yz - wx) * s[2]
  m[10] = (1 - (xx + yy)) * s[2]
  m[11] = 0

  m[12] = t[0]
  m[13] = t[1]
  m[14] = t[2]
  m[15] = 1

  return m
}

function transformPointColumnMajor(m, p) {
  const x = p[0], y = p[1], z = p[2]
  const w = m[3] * x + m[7] * y + m[11] * z + m[15]
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w
  ]
}

async function inspect(path) {
  const doc = await io.read(path)
  const root = doc.getRoot()

  function walk(node, parentMatrix, pathStr) {
    const localM = getColumnMajorMatrix(node)
    const worldM = parentMatrix ? multiplyColumnMajor(parentMatrix, localM) : localM
    const name = node.getName() || '(unnamed)'
    const currentPath = pathStr + ' -> ' + name
    const mesh = node.getMesh()

    if (mesh) {
      console.log(`\nNode path: "${currentPath}"  Mesh: "${mesh.getName()}"`)
      console.log(`World translation: [${worldM[12]}, ${worldM[13]}, ${worldM[14]}]`)
      
      let minX = Infinity, minY = Infinity, minZ = Infinity
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
      
      for (const prim of mesh.listPrimitives()) {
        const posAttr = prim.getAttribute('POSITION')
        if (posAttr) {
          const count = posAttr.getCount()
          for (let i = 0; i < count; i++) {
            const localPt = posAttr.getElement(i, [])
            const worldPt = transformPointColumnMajor(worldM, localPt)
            
            minX = Math.min(minX, worldPt[0])
            minY = Math.min(minY, worldPt[1])
            minZ = Math.min(minZ, worldPt[2])
            maxX = Math.max(maxX, worldPt[0])
            maxY = Math.max(maxY, worldPt[1])
            maxZ = Math.max(maxZ, worldPt[2])
          }
        }
      }
      
      console.log(`Bounds relative to GLB Root:`)
      console.log(`  min: [${minX}, ${minY}, ${minZ}]`)
      console.log(`  max: [${maxX}, ${maxY}, ${maxZ}]`)
      console.log(`  size: [${maxX - minX}, ${maxY - minY}, ${maxZ - minZ}]`)
      console.log(`  center: [${(minX + maxX)/2}, ${(minY + maxY)/2}, ${(minZ + maxZ)/2}]`)
    }

    for (const c of node.listChildren()) {
      walk(c, worldM, currentPath)
    }
  }

  const scenes = root.listScenes()
  for (const scene of scenes) {
    for (const n of scene.listChildren()) {
      walk(n, null, '')
    }
  }
}

inspect('assets/models/screen.glb').catch(console.error)
