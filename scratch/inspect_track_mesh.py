import struct
import json

with open('assets/models/track.glb', 'rb') as f:
    header = f.read(12)
    magic, version, length = struct.unpack('<III', header)
    if magic != 0x46546C67:
        print('Not a valid GLB file')
        exit(1)
    
    chunk_header = f.read(8)
    chunk_len, chunk_type = struct.unpack('<II', chunk_header)
    json_data = f.read(chunk_len)
    gltf = json.loads(json_data.decode('utf-8'))

meshes = gltf.get('meshes', [])
print(f"Total meshes: {len(meshes)}")
for m_idx, m in enumerate(meshes):
    print(f"Mesh {m_idx}: name='{m.get('name')}'")
    for p_idx, p in enumerate(m.get('primitives', [])):
        pos_accessor = p.get('attributes', {}).get('POSITION')
        print(f"  Primitive {p_idx}: POSITION accessor={pos_accessor}, mode={p.get('mode')}")
