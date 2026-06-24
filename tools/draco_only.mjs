// Aplica SOLO Draco mesh compression a todos los GLBs de assets/models.
// NO cambia texturas (formato/tamaño), NO hace weld/resample.
// Usar para testear si Draco funciona en DCL sin mezclar otras variables.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { draco } from '@gltf-transform/functions'
import draco3d from 'draco3d'
import { readdirSync, statSync } from 'fs'

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  })

const dir = process.argv[2] || 'assets/models'
const files = readdirSync(dir).filter(f => f.toLowerCase().endsWith('.glb'))

// Excluir los que están en .dclignore y no se deployean igual
const SKIP = new Set(['trees.glb'])
const included = files.filter(f => !SKIP.has(f) && !f.startsWith('paintballspawn'))

console.log(`Aplicando Draco a ${included.length} GLBs en "${dir}"...`)

for (const f of included) {
  const path = `${dir}/${f}`
  const before = statSync(path).size
  try {
    const doc = await io.read(path)
    await doc.transform(draco())
    await io.write(path, doc)
    const after = statSync(path).size
    console.log(`${f}: ${(before/1e6).toFixed(2)}MB -> ${(after/1e6).toFixed(2)}MB`)
  } catch (e) {
    console.log(`${f}: SKIP (${e.message})`)
  }
}

const total = included.reduce((s, f) => s + statSync(`${dir}/${f}`).size, 0)
console.log(`\nTotal post-Draco: ${(total/1e6).toFixed(2)}MB`)
