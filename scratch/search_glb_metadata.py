import struct
import json
import os

keywords = ['foco', 'focos', 'luz', 'lamp', 'farol', 'poste']

def scan_glb_metadata(file_path):
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
        except Exception:
            return
            
    # Check meshes
    for idx, m in enumerate(gltf.get('meshes', [])):
        name = m.get('name', '')
        if any(k in name.lower() for k in keywords):
            print(f"[{os.path.basename(file_path)}] Mesh {idx}: '{name}'")
            
    # Check materials
    for idx, mat in enumerate(gltf.get('materials', [])):
        name = mat.get('name', '')
        if any(k in name.lower() for k in keywords):
            print(f"[{os.path.basename(file_path)}] Material {idx}: '{name}'")
            
    # Check textures/images
    for idx, img in enumerate(gltf.get('images', [])):
        name = img.get('name', '')
        if any(k in name.lower() for k in keywords):
            print(f"[{os.path.basename(file_path)}] Image {idx}: '{name}'")

models_dir = 'assets/models'
for fn in os.listdir(models_dir):
    if fn.endswith('.glb'):
        scan_glb_metadata(os.path.join(models_dir, fn))
