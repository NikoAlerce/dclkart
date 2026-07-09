import { NodeIO } from '@gltf-transform/core';

async function main() {
    const io = new NodeIO();
    console.log('Loading trees.glb...');
    const document = await io.read('assets/models/trees.glb');
    const root = document.getRoot();
    
    console.log('--- Detailed Meshes ---');
    const meshes = root.listMeshes();
    for (const mesh of meshes) {
        const primitives = mesh.listPrimitives();
        let vertexCount = 0;
        const materials = [];
        for (const prim of primitives) {
            const position = prim.getAttribute('POSITION');
            if (position) {
                vertexCount += position.getCount();
            }
            const mat = prim.getMaterial();
            if (mat && !materials.includes(mat.getName())) {
                materials.push(mat.getName());
            }
        }
        console.log(`Mesh: ${mesh.getName()} | Vertices: ${vertexCount} | Materials: ${materials.join(', ')}`);
    }
}

main().catch(console.error);
