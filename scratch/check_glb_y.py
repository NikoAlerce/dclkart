import struct
import json
import os

glb_path = r'C:\niko\escritorio\mariokart2\assets\models\track.glb'
if not os.path.exists(glb_path):
    print(f"File not found: {glb_path}")
    exit(1)

with open(glb_path, 'rb') as f:
    header = f.read(12)
    magic, version, length = struct.unpack('<III', header)
    if magic != 0x46546C67:
        print('Not a valid GLB file')
        exit(1)
    
    chunk_header = f.read(8)
    chunk_len, chunk_type = struct.unpack('<II', chunk_header)
    json_data = f.read(chunk_len)
    gltf = json.loads(json_data.decode('utf-8'))
    
    bin_header = f.read(8)
    bin_len, bin_type = struct.unpack('<II', bin_header)
    bin_data = f.read(bin_len)

accessors = gltf.get('accessors', [])
bufferViews = gltf.get('bufferViews', [])
nodes = gltf.get('nodes', [])
meshes = gltf.get('meshes', [])

# Map nodes to meshes and trace their translations
for node_idx, node in enumerate(nodes):
    mesh_idx = node.get('mesh')
    if mesh_idx is None:
        continue
    
    mesh = meshes[mesh_idx]
    mesh_name = mesh.get('name', 'Unnamed')
    
    # Trace translation
    translation = node.get('translation', [0.0, 0.0, 0.0])
    
    for prim_idx, primitive in enumerate(mesh.get('primitives', [])):
        pos_accessor_idx = primitive.get('attributes', {}).get('POSITION')
        if pos_accessor_idx is None:
            continue
            
        accessor = accessors[pos_accessor_idx]
        bv_idx = accessor['bufferView']
        bv = bufferViews[bv_idx]
        
        byte_offset = bv.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        byte_stride = bv.get('byteStride', 12)
        count = accessor['count']
        
        min_y = float('inf')
        max_y = float('-inf')
        
        for i in range(count):
            offset = byte_offset + i * byte_stride
            x, y, z = struct.unpack_from('<fff', bin_data, offset)
            # Apply node translation
            world_y = y + translation[1] + 10.0 # 10.0 is the track entity Y in index.ts
            if world_y < min_y:
                min_y = world_y
            if world_y > max_y:
                max_y = world_y
                
        print(f"Mesh {mesh_idx} ({mesh_name}) primitive {prim_idx}: World Y range = [{min_y:.2f}, {max_y:.2f}]")
