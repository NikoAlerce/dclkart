import struct
import json
import os

glb_path = 'assets/models/track.glb'
if not os.path.exists(glb_path):
    print("File not found")
    exit(1)

with open(glb_path, 'rb') as f:
    header = f.read(12)
    magic, version, length = struct.unpack('<III', header)
    
    chunk_header = f.read(8)
    chunk_len, chunk_type = struct.unpack('<II', chunk_header)
    json_data = f.read(chunk_len)
    gltf = json.loads(json_data.decode('utf-8'))

materials = gltf.get('materials', [])
meshes = gltf.get('meshes', [])
nodes = gltf.get('nodes', [])

print("=== MATERIALS ===")
for idx, mat in enumerate(materials):
    print(f"Material {idx}: name='{mat.get('name')}'")

print("\n=== MESHES AND PRIMITIVES ===")
for idx, m in enumerate(meshes):
    print(f"Mesh {idx}: name='{m.get('name')}'")
    for p_idx, prim in enumerate(m.get('primitives', [])):
        mat_idx = prim.get('material')
        mat_name = materials[mat_idx].get('name') if mat_idx is not None else "None"
        pos_accessor = prim.get('attributes', {}).get('POSITION')
        print(f"  Primitive {p_idx}: material={mat_idx} ('{mat_name}'), POSITION accessor={pos_accessor}")
