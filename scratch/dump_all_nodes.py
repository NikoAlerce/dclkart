import struct
import json
import os

def dump_nodes(file_path, out_f):
    if not os.path.exists(file_path):
        return
        
    out_f.write(f"\n=========================================\n")
    out_f.write(f"FILE: {os.path.basename(file_path)}\n")
    out_f.write(f"=========================================\n")
    
    with open(file_path, 'rb') as f:
        header = f.read(12)
        magic, version, length = struct.unpack('<III', header)
        if magic != 0x46546C67:
            out_f.write("Not a valid GLB\n")
            return
            
        chunk_header = f.read(8)
        chunk_len, chunk_type = struct.unpack('<II', chunk_header)
        json_data = f.read(chunk_len)
        try:
            gltf = json.loads(json_data.decode('utf-8'))
        except Exception as e:
            out_f.write(f"Error parsing json: {e}\n")
            return
            
    nodes = gltf.get('nodes', [])
    out_f.write(f"Total nodes: {len(nodes)}\n")
    for idx, node in enumerate(nodes):
        name = node.get('name', '')
        translation = node.get('translation')
        rotation = node.get('rotation')
        scale = node.get('scale')
        out_f.write(f"Node {idx:3d}: '{name}' | trans={translation} | rot={rotation} | scale={scale}\n")

with open('scratch/all_nodes_dump.txt', 'w', encoding='utf-8') as out_f:
    models_dir = 'assets/models'
    for fn in os.listdir(models_dir):
        if fn.endswith('.glb'):
            dump_nodes(os.path.join(models_dir, fn), out_f)

print("Dumped all node names to scratch/all_nodes_dump.txt")
