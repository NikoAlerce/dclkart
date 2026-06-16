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

def detect_focos(glb_path, base_pos):
    print(f"\nDetecting focos in: {glb_path}")
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
    
    # Extract vertices for the lights mesh (Mesh 1: Object_10, accessor 5)
    world_vertices = []
    
    # Find Node associated with Mesh 1
    light_node = None
    for idx, node in enumerate(nodes):
        if node.get('mesh') == 1:
            light_node = node
            break
            
    if light_node is None:
        print("Light node not found")
        return []
        
    trans = light_node.get('translation', [0.0, 0.0, 0.0])
    rot = light_node.get('rotation', [0.0, 0.0, 0.0, 1.0])
    scale = light_node.get('scale', [1.0, 1.0, 1.0])
    
    x, y, z, w = rot
    rm = [
        [1-2*(y*y+z*z), 2*(x*y-z*w),   2*(x*z+y*w)],
        [2*(x*y+z*w),   1-2*(x*x+z*z), 2*(y*z-x*w)],
        [2*(x*z-y*w),   2*(y*z+x*w),   1-2*(x*x+y*y)]
    ]
    
    mesh = meshes[1]
    prim = mesh['primitives'][0]
    pos_accessor_idx = prim['attributes']['POSITION']
    
    local_verts = get_accessor_data(pos_accessor_idx, accessors, buffer_views, bin_data)
    for lv in local_verts:
        sv = [lv[0] * scale[0], lv[1] * scale[1], lv[2] * scale[2]]
        rv = [
            rm[0][0]*sv[0] + rm[0][1]*sv[1] + rm[0][2]*sv[2],
            rm[1][0]*sv[0] + rm[1][1]*sv[1] + rm[1][2]*sv[2],
            rm[2][0]*sv[0] + rm[2][1]*sv[1] + rm[2][2]*sv[2]
        ]
        wv = [
            rv[0] + trans[0] + base_pos[0],
            rv[1] + trans[1] + base_pos[1],
            rv[2] + trans[2] + base_pos[2]
        ]
        world_vertices.append(wv)
        
    print(f"Extracted {len(world_vertices)} vertices from lights mesh")
    
    # We want to cluster these vertices into individual light positions.
    # Since each light fixture consists of a small cluster of vertices, we can group them
    # using a simple clustering algorithm. If a vertex is within 3.0 meters of an existing cluster,
    # it belongs to that cluster.
    clusters = []
    threshold = 3.0
    
    for v in world_vertices:
        placed = False
        for c in clusters:
            # Check distance to cluster centroid
            c_center = c['sum']
            c_count = c['count']
            cx = c_center[0] / c_count
            cy = c_center[1] / c_count
            cz = c_center[2] / c_count
            
            dist = math.sqrt((v[0] - cx)**2 + (v[1] - cy)**2 + (v[2] - cz)**2)
            if dist < threshold:
                c['sum'][0] += v[0]
                c['sum'][1] += v[1]
                c['sum'][2] += v[2]
                c['count'] += 1
                if v[1] > c['max_y']:
                    c['max_y'] = v[1]
                placed = True
                break
        if not placed:
            clusters.append({
                'sum': [v[0], v[1], v[2]],
                'count': 1,
                'max_y': v[1]
            })
            
    focos = []
    for c in clusters:
        cx = c['sum'][0] / c['count']
        cy = c['sum'][1] / c['count']
        cz = c['sum'][2] / c['count']
        # The light bulb is typically at the top of the lamp fixture, so we use max_y or slightly below it
        # Let's use max_y as the light position
        focos.append((cx, c['max_y'], cz))
        
    # Sort focos by X, then Z, for consistent ordering
    focos.sort(key=lambda f: (f[0], f[2]))
    
    print(f"Detected {len(focos)} unique focos:")
    for idx, f in enumerate(focos):
        print(f"  Foco {idx+1:2d}: [{f[0]:.2f}, {f[1]:.2f}, {f[2]:.2f}]")
        
    return focos

track_pos = [472.0, 10.0, 248.0]
focos = detect_focos('assets/models/track.glb', track_pos)
with open('scratch/detected_focos.json', 'w') as f:
    json.dump(focos, f)
print("Saved detected focos to scratch/detected_focos.json")
