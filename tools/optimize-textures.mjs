// Solo reescala texturas (webp) + dedup/prune. SIN draco ni weld, para preservar
// canales UV extra (p.ej. el TEXCOORD_4 "simplebake" del CITY de la galería).
// node tools/optimize-textures.mjs <in.glb> <out.glb> [size=1024]
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, textureCompress } from '@gltf-transform/functions'
import sharp from 'sharp'
import { statSync, mkdirSync } from 'fs'
import { dirname } from 'path'

const inPath = process.argv[2]
const outPath = process.argv[3]
const size = Number(process.argv[4] ?? 1024)
if (!inPath || !outPath) {
  console.error('Uso: node tools/optimize-textures.mjs <in.glb> <out.glb> [size]')
  process.exit(1)
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

const before = statSync(inPath).size
console.log(`Leyendo ${inPath} (${(before / 1e6).toFixed(2)}MB)... reescala a ${size}px`)

const doc = await io.read(inPath)
await doc.transform(
  dedup(),
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82 }),
)

mkdirSync(dirname(outPath), { recursive: true })
await io.write(outPath, doc)
const after = statSync(outPath).size
console.log(`OK -> ${outPath}: ${(before / 1e6).toFixed(2)}MB -> ${(after / 1e6).toFixed(2)}MB`)
