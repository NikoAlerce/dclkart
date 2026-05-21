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
    
    bin_header = f.read(8)
    bin_len, bin_type = struct.unpack('<II', bin_header)
    bin_data = f.read(bin_len)

accessors = gltf.get('accessors', [])
bufferViews = gltf.get('bufferViews', [])

accessor = accessors[49] # road POSITION
bv = bufferViews[accessor['bufferView']]
byte_offset = bv.get('byteOffset', 0) + accessor.get('byteOffset', 0)
byte_stride = bv.get('byteStride', 12)
count = accessor['count']

min_y = float('inf')
max_y = float('-inf')

for i in range(count):
    offset = byte_offset + i * byte_stride
    x, y, z = struct.unpack_from('<fff', bin_data, offset)
    if y < min_y:
        min_y = y
    if y > max_y:
        max_y = y

print(f"Road mesh local Y range: min={min_y:.4f}m, max={max_y:.4f}m")
print(f"Road mesh absolute Y range: min={min_y + 4.906:.4f}m, max={max_y + 4.906:.4f}m")
