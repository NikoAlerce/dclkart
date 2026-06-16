import struct
import json
import os

def inspect_glb(glb_path):
    print(f"\n=== Inspecting: {glb_path} ===")
    if not os.path.exists(glb_path):
        print("File not found")
        return
        
    with open(glb_path, 'rb') as f:
        header = f.read(12)
        magic, version, length = struct.unpack('<III', header)
        if magic != 0x46546C67:
            print('Not a valid GLB file')
            return
        
        chunk_header = f.read(8)
        chunk_len, chunk_type = struct.unpack('<II', chunk_header)
        json_data = f.read(chunk_len)
        gltf = json.loads(json_data.decode('utf-8'))
        
    nodes = gltf.get('nodes', [])
    meshes = gltf.get('meshes', [])
    
    print(f"Total nodes: {len(nodes)}")
    print(f"Total meshes: {len(meshes)}")
    
    for idx, node in enumerate(nodes):
        mesh_idx = node.get('mesh')
        mesh_name = meshes[mesh_idx].get('name') if mesh_idx is not None else None
        name = node.get('name', '')
        translation = node.get('translation')
        rotation = node.get('rotation')
        scale = node.get('scale')
        # Print if node name has interesting keywords or if it has a mesh
        if mesh_idx is not None or any(k in name.lower() for k in ['bridge', 'puente', 'wall', 'col', 'collider', 'tree', 'arbol']):
            print(f"Node {idx}: name='{name}', mesh={mesh_idx} ({mesh_name}), translation={translation}, scale={scale}")

inspect_glb(r'C:\niko\escritorio\mariokart2\assets\models\track.glb')
inspect_glb(r'C:\niko\escritorio\mariokart2\assets\models\flowerman.glb')
inspect_glb(r'C:\niko\escritorio\mariokart2\assets\models\arboles.glb')
