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
    print(f"Total nodes: {len(nodes)}, Total meshes: {len(meshes)}")
    
    # Print the first 20 nodes with translations
    for idx, node in enumerate(nodes[:50]):
        print(f"Node {idx}: name='{node.get('name')}', mesh={node.get('mesh')}, translation={node.get('translation')}")
    if len(nodes) > 50:
        print("...")

inspect_glb(r'C:\niko\escritorio\mariokart2\assets\models\trees.glb')
inspect_glb(r'C:\niko\escritorio\mariokart2\HANDOFF_DEV\DCL_KART_ENGINE\assets\models\track.glb')
