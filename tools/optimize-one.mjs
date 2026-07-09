// Optimiza UN GLB in->out: dedup, prune, weld, resample, texturas webp 512, Draco.
// node tools/optimize-one.mjs <in.glb> <out.glb>
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, weld, resample, textureCompress, draco } from '@gltf-transform/functions'
import draco3d from 'draco3d'
import sharp from 'sharp'
import { statSync, mkdirSync } from 'fs'
import { dirname } from 'path'

const inPath = process.argv[2]
const outPath = process.argv[3]
if (!inPath || !outPath) {
  console.error('Uso: node tools/optimize-one.mjs <in.glb> <out.glb>')
  process.exit(1)
}

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  })

const before = statSync(inPath).size
console.log(`Leyendo ${inPath} (${(before / 1e6).toFixed(2)}MB)...`)

const doc = await io.read(inPath)
console.log('Transformando (dedup, prune, weld, resample, webp512, draco)...')
await doc.transform(
  dedup(),
  prune(),
  weld(),
  resample(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 80 }),
  draco(),
)

mkdirSync(dirname(outPath), { recursive: true })
await io.write(outPath, doc)
const after = statSync(outPath).size
console.log(`OK -> ${outPath}: ${(before / 1e6).toFixed(2)}MB -> ${(after / 1e6).toFixed(2)}MB (ahorro ${((before - after) / 1e6).toFixed(2)}MB)`)
