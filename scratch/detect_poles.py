import struct
import json
import os
import math
from collections import defaultdict

def get_accessor_data(accessor_idx, accessors, buffer_views, bin_data):
    accessor = accessors[accessor_idx]
    bv = buffer_views[accessor['bufferView']]
    byte_offset = bv.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    byte_stride = bv.get('byteStride', 12)
    count = accessor['count']
    
    # 5126 is float
    component_type = accessor['componentType']
    if component_type != 5126:
        return []
        
    vertices = []
    for i in range(count):
        offset = byte_offset + i * byte_stride
        x, y, z = struct.unpack_from('<fff', bin_data, offset)
        vertices.append((x, y, z))
    return vertices

def detect_poles(glb_path, base_pos):
    print(f"\nDetecting poles in: {glb_path}")
    if not os.path.exists(glb_path):
        print("File not found")
        return []
        
    with open(glb_path, 'rb') as f:
        header = f.read(12)
        magic, version, length = struct.unpack('<III', header)
        if magic != 0x46546C67:
            print("Not a valid GLB")
            return []
            
        chunk_header = f.read(8)
        chunk_len, chunk_type = struct.unpack('<II', chunk_header)
        json_data = f.read(chunk_len)
        gltf = json.loads(json_data.decode('utf-8'))
        
        bin_header = f.read(8)
        bin_len, bin_type = struct.unpack('<II', bin_header)
        bin_data = f.read(bin_len)
        
    nodes = gltf.get('nodes', [])
    meshes = gltf.get('meshes', [])
    accessors = gltf.get('accessors', [])
    buffer_views = gltf.get('bufferViews', [])
    
    # Extract all world vertices
    world_vertices = []
    for node_idx, node in enumerate(nodes):
        mesh_idx = node.get('mesh')
        if mesh_idx is None:
            continue
        mesh = meshes[mesh_idx]
        
        trans = node.get('translation', [0.0, 0.0, 0.0])
        rot = node.get('rotation', [0.0, 0.0, 0.0, 1.0])
        scale = node.get('scale', [1.0, 1.0, 1.0])
        
        # Simple rotation matrix from quaternion
        x, y, z, w = rot
        rm = [
            [1-2*(y*y+z*z), 2*(x*y-z*w),   2*(x*z+y*w)],
            [2*(x*y+z*w),   1-2*(x*x+z*z), 2*(y*z-x*w)],
            [2*(x*z-y*w),   2*(y*z+x*w),   1-2*(x*x+y*y)]
        ]
        
        for prim in mesh.get('primitives', []):
            pos_accessor_idx = prim.get('attributes', {}).get('POSITION')
            if pos_accessor_idx is None:
                continue
            
            local_verts = get_accessor_data(pos_accessor_idx, accessors, buffer_views, bin_data)
            for lv in local_verts:
                # Apply scale
                sv = [lv[0] * scale[0], lv[1] * scale[1], lv[2] * scale[2]]
                # Apply rotation
                rv = [
                    rm[0][0]*sv[0] + rm[0][1]*sv[1] + rm[0][2]*sv[2],
                    rm[1][0]*sv[0] + rm[1][1]*sv[1] + rm[1][2]*sv[2],
                    rm[2][0]*sv[0] + rm[2][1]*sv[1] + rm[2][2]*sv[2]
                ]
                # Apply translation + base_pos offset
                wv = [
                    rv[0] + trans[0] + base_pos[0],
                    rv[1] + trans[1] + base_pos[1],
                    rv[2] + trans[2] + base_pos[2]
                ]
                world_vertices.append(wv)
                
    print(f"Extracted {len(world_vertices)} vertices")
    if not world_vertices:
        return []
        
    # Quantize to a grid of 1.0m x 1.0m to find vertical columns
    grid = defaultdict(list)
    grid_size = 1.0
    for v in world_vertices:
        gx = round(v[0] / grid_size)
        gz = round(v[2] / grid_size)
        grid[(gx, gz)].append(v[1])
        
    # Find columns with a tall vertical span
    candidate_poles = []
    for (gx, gz), y_coords in grid.items():
        min_y = min(y_coords)
        max_y = max(y_coords)
        height_span = max_y - min_y
        
        # A lamppost is usually narrow, starts at ground level (e.g. 5-15m) and goes up 6-12m.
        # Height span should be between 4m and 15m.
        if 4.5 <= height_span <= 15.0 and len(y_coords) >= 10:
            world_x = gx * grid_size
            world_z = gz * grid_size
            candidate_poles.append({
                'x': world_x,
                'z': world_z,
                'min_y': min_y,
                'max_y': max_y,
                'height': height_span,
                'density': len(y_coords)
            })
            
    # Group candidate grid cells that are adjacent to find unique poles
    grouped_poles = []
    used = set()
    
    for i, p1 in enumerate(candidate_poles):
        if i in used:
            continue
        # Find all adjacent candidates
        cluster = [p1]
        used.add(i)
        for j, p2 in enumerate(candidate_poles):
            if j in used:
                continue
            dist = math.sqrt((p1['x'] - p2['x'])**2 + (p1['z'] - p2['z'])**2)
            if dist <= 2.2: # adjacent cells
                cluster.append(p2)
                used.add(j)
                
        # Average the cluster position
        avg_x = sum(c['x'] for c in cluster) / len(cluster)
        avg_z = sum(c['z'] for c in cluster) / len(cluster)
        max_y = max(c['max_y'] for c in cluster)
        min_y = min(c['min_y'] for c in cluster)
        
        # We place the light source near the top of the pole, e.g. at max_y - 0.5m
        grouped_poles.append((avg_x, max_y, avg_z))
        
    print(f"Detected {len(grouped_poles)} poles:")
    for idx, gp in enumerate(grouped_poles):
        print(f"  Pole {idx+1}: [{gp[0]:.2f}, {gp[1]:.2f}, {gp[2]:.2f}]")
        
    return grouped_poles

track_pos = [472.0, 10.0, 248.0]
poles = detect_poles('assets/models/track.glb', track_pos)
# Let's save the detected poles to a json file so we can read it easily
with open('scratch/detected_poles.json', 'w') as f:
    json.dump(poles, f)
print("Saved detected poles to scratch/detected_poles.json")
