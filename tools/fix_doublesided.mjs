// Setea doubleSided=true en TODOS los materiales de un GLB.
// Uso: node tools/fix_doublesided.mjs assets/models/track.glb

import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'

const [,, src] = process.argv
if (!src) { console.error('Usage: node fix_doublesided.mjs <file.glb>'); process.exit(1) }

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(src)

let count = 0
for (const mat of doc.getRoot().listMaterials()) {
  if (!mat.getDoubleSided()) {
    mat.setDoubleSided(true)
    count++
  }
}

await io.write(src, doc)
console.log(`✅  ${count} materiales → doubleSided=true  (${src})`)
