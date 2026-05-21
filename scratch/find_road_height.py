import struct
import json
import math

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
    
    # After JSON chunk, there is the BIN chunk
    bin_header = f.read(8)
    bin_len, bin_type = struct.unpack('<II', bin_header)
    bin_data = f.read(bin_len)

accessors = gltf.get('accessors', [])
bufferViews = gltf.get('bufferViews', [])

# Accessor 49 is POSITION for road
accessor = accessors[49]
bv_idx = accessor['bufferView']
bv = bufferViews[bv_idx]

byte_offset = bv.get('byteOffset', 0) + accessor.get('byteOffset', 0)
byte_stride = bv.get('byteStride', 12) # Float VEC3 is 12 bytes
count = accessor['count']

target_x = -109.68217468261719
target_z = 62.90192794799805

min_dist = float('inf')
best_y = 0.0
best_vertex = None

for i in range(count):
    offset = byte_offset + i * byte_stride
    x, y, z = struct.unpack_from('<fff', bin_data, offset)
    
    # Calculate horizontal distance to target
    dist = math.sqrt((x - target_x)**2 + (z - target_z)**2)
    if dist < min_dist:
        min_dist = dist
        best_y = y
        best_vertex = (x, y, z)

print(f"Closest road vertex: {best_vertex} at distance {min_dist:.4f}m")
# Road Node Y translation is 4.906322956085205
world_y = best_y + 4.906322956085205
print(f"Absolute road Y height at poles: {world_y:.4f}m")
