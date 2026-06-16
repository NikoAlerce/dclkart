import struct
import json
import os

keywords = ['light', 'lamp', 'farol', 'poste', 'lum', 'spot', 'point', 'post', 'faro', 'pole', 'redlight']

def scan_glb(file_path):
    print(f"\nScanning: {file_path}")
    if not os.path.exists(file_path):
        print("File not found")
        return
        
    with open(file_path, 'rb') as f:
        header = f.read(12)
        magic, version, length = struct.unpack('<III', header)
        if magic != 0x46546C67:
            print('Not a valid GLB')
            return
            
        chunk_header = f.read(8)
        chunk_len, chunk_type = struct.unpack('<II', chunk_header)
        json_data = f.read(chunk_len)
        try:
            gltf = json.loads(json_data.decode('utf-8'))
        except Exception as e:
            print(f"Error parsing json: {e}")
            return
            
    nodes = gltf.get('nodes', [])
    for idx, node in enumerate(nodes):
        name = node.get('name', '')
        translation = node.get('translation')
        if any(k in name.lower() for k in keywords):
            print(f"  Node {idx}: name='{name}', translation={translation}")

models_dir = 'assets/models'
for fn in os.listdir(models_dir):
    if fn.endswith('.glb'):
        scan_glb(os.path.join(models_dir, fn))
