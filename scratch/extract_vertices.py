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
    
    bin_header = f.read(8)
    bin_len, bin_type = struct.unpack('<II', bin_header)
    bin_data = f.read(bin_len)

accessors = gltf.get('accessors', [])
bufferViews = gltf.get('bufferViews', [])
meshes = gltf.get('meshes', [])
nodes = gltf.get('nodes', [])

# Build parent lookup
parent_of = {}
for i, n in enumerate(nodes):
    for child in n.get('children', []):
        parent_of[child] = i

# Get world transform matrix for a node
def get_node_matrix(node_idx):
    # Retrieve translation, rotation, scale
    node = nodes[node_idx]
    t = node.get('translation', [0.0, 0.0, 0.0])
    r = node.get('rotation', [0.0, 0.0, 0.0, 1.0]) # x, y, z, w
    s = node.get('scale', [1.0, 1.0, 1.0])
    return t, r, s

TRACK_OFFSET = [472.0, 10.0, 248.0]

for node_idx, node in enumerate(nodes):
    mesh_idx = node.get('mesh')
    if mesh_idx is None:
        continue
    mesh = meshes[mesh_idx]
    t, r, s = get_node_matrix(node_idx)
    
    print(f"\nNode {node_idx} '{node.get('name')}', mesh '{mesh.get('name')}'")
    for p_idx, prim in enumerate(mesh.get('primitives', [])):
        pos_idx = prim.get('attributes', {}).get('POSITION')
        if pos_idx is None:
            continue
        accessor = accessors[pos_idx]
        bv = bufferViews[accessor['bufferView']]
        
        byte_offset = bv.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        byte_stride = bv.get('byteStride', 12)
        count = accessor['count']
        
        print(f"  Primitive {p_idx}: vertex count={count}, accessor={pos_idx}")
