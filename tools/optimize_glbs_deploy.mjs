// Optimiza TODOS los .glb de assets/models: texturas→webp max 512, Draco, dedup, weld, resample, prune.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, weld, resample, textureCompress, draco } from '@gltf-transform/functions'
import draco3d from 'draco3d'
import sharp from 'sharp'
import { readdirSync, statSync } from 'fs'

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  })

const dir = 'assets/models'
const files = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.glb'))

console.log(`Encontrados ${files.length} archivos GLB para optimizar...`)

for (const f of files) {
  const path = `${dir}/${f}`
  const before = statSync(path).size
  try {
    const doc = await io.read(path)
    await doc.transform(
      dedup(),
      prune(),
      weld(),
      resample(),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 80 }),
      draco(),
    )
    await io.write(path, doc)
    const after = statSync(path).size
    console.log(`${f}: ${(before/1e6).toFixed(2)}MB -> ${(after/1e6).toFixed(2)}MB (Ahorro: ${((before - after)/1e6).toFixed(2)}MB)`)
  } catch (e) {
    console.log(`${f}: SKIP (${e.message})`)
  }
}
