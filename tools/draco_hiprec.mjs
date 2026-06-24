// draco_hiprec.mjs — Draco de ALTA PRECISIÓN para un GLB puntual (ej: track.glb).
// Usa method 'sequential' (preserva el orden/topología de vértices → NO fusiona ni
// reordena, que es lo que rompía la colisión del pasto con el edgebreaker default) y
// quantización de posición alta (18 bits). Comprime menos que el draco normal pero
// mantiene la colisión casi exacta y pesa mucho menos que sin Draco.
//
//   node tools/draco_hiprec.mjs assets/models/track.glb
//
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { draco } from '@gltf-transform/functions'
import draco3d from 'draco3d'
import { statSync } from 'fs'

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  })

const path = process.argv[2]
if (!path) { console.error('uso: node tools/draco_hiprec.mjs <archivo.glb>'); process.exit(1) }

const before = statSync(path).size
const doc = await io.read(path)
await doc.transform(draco({
  method: 'sequential',     // preserva topología (no fusiona vértices → colisión intacta)
  quantizePosition: 18,     // alta precisión de posición (vs 14 default)
  quantizeNormal: 12,
  quantizeTexcoord: 12,
  quantizeGeneric: 16,
}))
await io.write(path, doc)
const after = statSync(path).size
console.log(`${path}: ${(before/1e6).toFixed(2)}MB -> ${(after/1e6).toFixed(2)}MB`)
