// flatten_materials.mjs — aplana materiales para un look mate (sin reflejos):
//   metallicFactor → 0, roughnessFactor → 1 (al taco), y quita las extensiones de
//   specular (KHR_materials_specular y la vieja spec-gloss). EXCLUYE lake.glb (agua:
//   conserva su metallic/specular).
//
//   node tools/flatten_materials.mjs inspect          → lista materiales de todos los GLB
//   node tools/flatten_materials.mjs fix [--no-backup] → aplica el aplanado (con backup .matbak)
//
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3d'
import { readdirSync, copyFileSync, existsSync, mkdirSync } from 'fs'

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  })

const dir = 'assets/models'
const EXCLUDE = new Set(['lake.glb'])  // el lago conserva specular/metallic (agua)

const SPEC_EXTS = ['KHR_materials_specular', 'KHR_materials_pbrSpecularGlossiness']

const mode = process.argv[2] || 'inspect'
const noBackup = process.argv.includes('--no-backup')

const files = readdirSync(dir)
  .filter(f => f.toLowerCase().endsWith('.glb'))
  .filter(f => !EXCLUDE.has(f))

for (const f of files) {
  const path = `${dir}/${f}`
  let doc
  try { doc = await io.read(path) }
  catch (e) { console.log(`${f}: SKIP (${e.message})`); continue }

  const mats = doc.getRoot().listMaterials()
  if (mode === 'inspect') {
    console.log(`\n${f}  (${mats.length} material${mats.length === 1 ? '' : 'es'})`)
    for (const m of mats) {
      const exts = m.listExtensions().map(e => e.extensionName)
      const spec = exts.filter(e => SPEC_EXTS.includes(e))
      console.log(`  · ${m.getName() || '(sin nombre)'}  metallic=${m.getMetallicFactor().toFixed(2)} roughness=${m.getRoughnessFactor().toFixed(2)}` +
        (spec.length ? `  SPEC:[${spec.join(',')}]` : ''))
    }
    continue
  }

  // mode === 'fix' — backup en carpeta-punto (.matbak/) excluida del deploy por `.dclignore`
  if (!noBackup) {
    const bakDir = `${dir}/.matbak`
    if (!existsSync(bakDir)) mkdirSync(bakDir, { recursive: true })
    const bak = `${bakDir}/${f}`
    if (!existsSync(bak)) copyFileSync(path, bak)
  }

  let changed = 0
  for (const m of mats) {
    m.setMetallicFactor(0)
    m.setRoughnessFactor(1)
    for (const ext of SPEC_EXTS) {
      if (m.getExtension(ext)) { m.setExtension(ext, null); }
    }
    changed++
  }
  await io.write(path, doc)
  console.log(`${f}: ${changed} material(es) aplanado(s) → metallic 0, roughness 1, sin specular`)
}

console.log(`\n(lago excluido: ${[...EXCLUDE].join(', ')})`)
