// Aplica weld + Draco a UN glb (sin tocar texturas). node tools/draco-one.mjs <in> <out>
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { weld, draco } from '@gltf-transform/functions'
import draco3d from 'draco3d'
import { statSync } from 'fs'

const inPath = process.argv[2]
const outPath = process.argv[3]
if (!inPath || !outPath) { console.error('Uso: node tools/draco-one.mjs <in> <out>'); process.exit(1) }

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  })

const before = statSync(inPath).size
console.log(`Leyendo ${inPath} (${(before / 1e6).toFixed(2)}MB)... weld + draco`)
const doc = await io.read(inPath)
await doc.transform(weld(), draco())
await io.write(outPath, doc)
const after = statSync(outPath).size
console.log(`OK -> ${outPath}: ${(before / 1e6).toFixed(2)}MB -> ${(after / 1e6).toFixed(2)}MB`)
