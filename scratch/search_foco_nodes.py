import struct
import json
import os

keywords = ['foco', 'focos']

def scan_glb(file_path):
    if not os.path.exists(file_path):
        return
        
    with open(file_path, 'rb') as f:
        header = f.read(12)
        magic, version, length = struct.unpack('<III', header)
        if magic != 0x46546C67:
            return
            
        chunk_header = f.read(8)
        chunk_len, chunk_type = struct.unpack('<II', chunk_header)
        json_data = f.read(chunk_len)
        try:
            gltf = json.loads(json_data.decode('utf-8'))
        except Exception as e:
            return
            
    nodes = gltf.get('nodes', [])
    for idx, node in enumerate(nodes):
        name = node.get('name', '')
        translation = node.get('translation')
        rotation = node.get('rotation')
        scale = node.get('scale')
        if any(k in name.lower() for k in keywords):
            print(f"Found in {os.path.basename(file_path)} | Node {idx}: '{name}' | trans={translation} | rot={rotation} | scale={scale}")

models_dir = 'assets/models'
for fn in os.listdir(models_dir):
    if fn.endswith('.glb'):
        scan_glb(os.path.join(models_dir, fn))
