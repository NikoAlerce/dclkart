import struct
import json
import os

def find_lamps(glb_path, base_pos):
    print(f"\n=== Searching Lamps in: {glb_path} ===")
    if not os.path.exists(glb_path):
        print("File not found")
        return []
        
    with open(glb_path, 'rb') as f:
        header = f.read(12)
        magic, version, length = struct.unpack('<III', header)
        if magic != 0x46546C67:
            print('Not a valid GLB file')
            return []
        
        chunk_header = f.read(8)
        chunk_len, chunk_type = struct.unpack('<II', chunk_header)
        json_data = f.read(chunk_len)
        gltf = json.loads(json_data.decode('utf-8'))
        
    nodes = gltf.get('nodes', [])
    
    lamps = []
    for idx, node in enumerate(nodes):
        name = node.get('name', '')
        translation = node.get('translation', [0.0, 0.0, 0.0])
        # Look for keywords like lamp, light, farol, poste, spotlight, lum
        if any(k in name.lower() for k in ['lamp', 'light', 'farol', 'poste', 'lum', 'spot', 'point', 'post', 'faro']):
            world_x = translation[0] + base_pos[0]
            world_y = translation[1] + base_pos[1]
            world_z = translation[2] + base_pos[2]
            lamps.append({
                'idx': idx,
                'name': name,
                'pos': [world_x, world_y, world_z]
            })
            print(f"Found node {idx}: '{name}' at local translation {translation} -> World: [{world_x:.2f}, {world_y:.2f}, {world_z:.2f}]")
            
    return lamps

# Base track translation is (472, 10.0, 248) in index.ts
find_lamps(r'C:\niko\escritorio\mariokart2\assets\models\track.glb', [472.0, 10.0, 248.0])
find_lamps(r'C:\niko\escritorio\mariokart2\assets\models\flowerman.glb', [472.0, 10.0, 248.0])
find_lamps(r'C:\niko\escritorio\mariokart2\assets\models\arboles.glb', [472.0, 10.0, 248.0])
