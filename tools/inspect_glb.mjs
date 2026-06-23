import { NodeIO } from '@gltf-transform/core'

const io = new NodeIO()

function fmt(v) {
  if (!v) return '—'
  return '[' + v.map((n) => (Math.round(n * 1000) / 1000)).join(', ') + ']'
}

async function inspect(path) {
  console.log('\n========================================')
  console.log('FILE:', path)
  console.log('========================================')
  const doc = await io.read(path)
  const root = doc.getRoot()

  // Walk the scene graph accumulating translation (translation-only, good enough
  // for empties since track.glb has identity transform / scale 1).
  const scenes = root.listScenes()
  const lines = []
  let gMin = [Infinity, Infinity, Infinity]
  let gMax = [-Infinity, -Infinity, -Infinity]

  function walk(node, acc, depth) {
    const t = node.getTranslation()
    const world = [acc[0] + t[0], acc[1] + t[1], acc[2] + t[2]]
    const name = node.getName() || '(unnamed)'
    const mesh = node.getMesh()
    const hasMesh = !!mesh
    lines.push(
      '  '.repeat(depth) +
        `• ${name}  local=${fmt(t)}  world=${fmt(world)}  mesh=${hasMesh ? mesh.getName() || 'yes' : 'no'}  scale=${fmt(node.getScale())}`
    )
    // Bounds from POSITION accessors (local space, approx)
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        const pos = prim.getAttribute('POSITION')
        if (pos) {
          const min = pos.getMinNormalized ? pos.getMin([]) : pos.getMin([])
          const max = pos.getMax([])
          for (let i = 0; i < 3; i++) {
            gMin[i] = Math.min(gMin[i], world[i] + min[i])
            gMax[i] = Math.max(gMax[i], world[i] + max[i])
          }
        }
      }
    }
    for (const c of node.listChildren()) walk(c, world, depth + 1)
  }

  for (const scene of scenes) {
    for (const n of scene.listChildren()) walk(n, [0, 0, 0], 0)
  }

  console.log('NODES (' + root.listNodes().length + ' total):')
  console.log(lines.slice(0, 80).join('\n'))
  if (lines.length > 80) console.log(`  ... (${lines.length - 80} more)`)

  console.log('\nAPPROX LOCAL BOUNDS (translation-only accumulation):')
  console.log('  min =', fmt(gMin))
  console.log('  max =', fmt(gMax))
  console.log('  size =', fmt([gMax[0] - gMin[0], gMax[1] - gMin[1], gMax[2] - gMin[2]]))

  // Empties = nodes with no mesh (candidate markers)
  const empties = root.listNodes().filter((n) => !n.getMesh())
  console.log('\nEMPTIES / markers (no mesh):', empties.length)
  for (const e of empties.slice(0, 40)) {
    console.log(`  - "${e.getName() || '(unnamed)'}"  local=${fmt(e.getTranslation())}`)
  }
}

const files = process.argv.slice(2)
for (const f of files) {
  try {
    await inspect(f)
  } catch (e) {
    console.log('ERROR reading', f, '->', e.message)
  }
}
