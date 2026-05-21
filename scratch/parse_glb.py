import struct
import json

with open('track.glb', 'rb') as f:
    header = f.read(12)
    magic, version, length = struct.unpack('<III', header)
    if magic != 0x46546C67:
        print('Not a valid GLB file')
        exit(1)
    
    chunk_header = f.read(8)
    chunk_len, chunk_type = struct.unpack('<II', chunk_header)
    json_data = f.read(chunk_len)
    gltf = json.loads(json_data.decode('utf-8'))

nodes = gltf.get('nodes', [])
meshes = gltf.get('meshes', [])
accessors = gltf.get('accessors', [])

# Find road_12 node and its mesh
road_node = None
for idx, node in enumerate(nodes):
    if node.get('name') == 'road_12':
        road_node = node
        print(f"Found road_12: Node index {idx}, node: {node}")
        break

if road_node:
    # Check children of road_12 node to see if they hold meshes
    children_indices = road_node.get('children', [])
    print(f"road_12 children: {children_indices}")
    
    # We want to print meshes under road_12
    nodes_to_check = [road_node]
    for child_idx in children_indices:
        nodes_to_check.append(nodes[child_idx])
        
    for n in nodes_to_check:
        mesh_idx = n.get('mesh')
        if mesh_idx is not None:
            mesh = meshes[mesh_idx]
            print(f"Node '{n.get('name')}' uses Mesh {mesh_idx}: '{mesh.get('name')}'")
            for p_idx, prim in enumerate(mesh.get('primitives', [])):
                pos_accessor_idx = prim.get('attributes', {}).get('POSITION')
                if pos_accessor_idx is not None:
                    accessor = accessors[pos_accessor_idx]
                    print(f"  Primitive {p_idx}: POSITION Accessor {pos_accessor_idx} bounds: min={accessor.get('min')}, max={accessor.get('max')}")
