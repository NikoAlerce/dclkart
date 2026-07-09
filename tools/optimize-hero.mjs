// Hero GLB optimizer: dedup, prune, weld, resample (anims), textures -> webp 1024 q82, Draco.
// Higher texture quality than the generic 512 optimizer since the hero is a showcase piece.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, resample, textureCompress, draco } from '@gltf-transform/functions';
import draco3d from 'draco3d';
import sharp from 'sharp';
import { statSync } from 'fs';

const [,, inPath, outPath] = process.argv;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });

const before = statSync(inPath).size;
console.log(`Reading ${inPath} (${(before/1e6).toFixed(2)}MB)...`);
const doc = await io.read(inPath);

console.log('Transforming: dedup, prune, weld, resample, webp1024 q82, draco...');
await doc.transform(
  dedup(),
  prune({ keepAttributes: false, keepLeaves: false }),
  resample(),                                  // drop redundant animation keyframes
  weld(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }),
  draco({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 }),
);

await io.write(outPath, doc);
const after = statSync(outPath).size;
console.log(`OK -> ${outPath}: ${(before/1e6).toFixed(2)}MB -> ${(after/1e6).toFixed(2)}MB  (saved ${((before-after)/1e6).toFixed(2)}MB, ${(100*(1-after/before)).toFixed(0)}%)`);
