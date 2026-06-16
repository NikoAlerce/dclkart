import struct
import json
import os

def search_nodes_in_glb(glb_path):
    if not os.path.exists(glb_path):
        return
        
    with open(glb_path, 'rb') as f:
        header = f.read(12)
        magic, version, length = struct.unpack('<III', header)
        if magic != 0x46546C67:
            return
            
        chunk_header = f.read(8)
        chunk_len, chunk_type = struct.unpack('<II', chunk_header)
        json_data = f.read(chunk_len)
        try:
            gltf = json.loads(json_data.decode('utf-8'))
        except Exception:
            return
            
    nodes = gltf.get('nodes', [])
    for idx, node in enumerate(nodes):
        name = node.get('name', '')
        if 'pole' in name.lower() or 'lamp' in name.lower() or 'redlight' in name.lower():
            translation = node.get('translation')
            print(f"Found in {os.path.basename(glb_path)} | Node {idx}: '{name}' at translation {translation}")

def scan_dir(dir_path):
    for root, dirs, files in os.walk(dir_path):
        for f in files:
            if f.endswith('.glb'):
                search_nodes_in_glb(os.path.join(root, f))

scan_dir('C:\\niko\\escritorio\\mariokart2')
