import struct
import json
import os
import sys

def analyze(filepath):
    print(f"\n--- Analyzing: {filepath} ---")
    if not os.path.exists(filepath):
        print("File does not exist")
        return
    
    file_size = os.path.getsize(filepath)
    print(f"File size: {file_size / (1024*1024):.2f} MB ({file_size} bytes)")
    
    try:
        with open(filepath, 'rb') as f:
            header = f.read(12)
            if len(header) < 12:
                print("Header too short")
                return
            magic, version, length = struct.unpack('<III', header)
            if magic != 0x46546C67:
                print(f"Not a valid GLB file, magic: {hex(magic)}")
                return
            print(f"GLTF Version: {version}")
            
            chunk_header = f.read(8)
            if len(chunk_header) < 8:
                print("Chunk header too short")
                return
            chunk_len, chunk_type = struct.unpack('<II', chunk_header)
            if chunk_type != 0x4E4F534A: # 'JSON'
                print(f"First chunk is not JSON, type: {hex(chunk_type)}")
                return
            
            json_data = f.read(chunk_len)
            gltf = json.loads(json_data.decode('utf-8'))
            
            # Print extensions used
            ext_used = gltf.get('extensionsUsed', [])
            print(f"Extensions Used: {ext_used}")
            ext_req = gltf.get('extensionsRequired', [])
            print(f"Extensions Required: {ext_req}")
            
            # Print nodes info
            nodes = gltf.get('nodes', [])
            print(f"Number of nodes: {len(nodes)}")
            
            # Print meshes info
            meshes = gltf.get('meshes', [])
            print(f"Number of meshes: {len(meshes)}")
            
            # Print materials info
            materials = gltf.get('materials', [])
            print(f"Number of materials: {len(materials)}")
            
            # Look for root nodes (nodes not referenced by any other node's children)
            child_nodes = set()
            for node in nodes:
                for child in node.get('children', []):
                    child_nodes.add(child)
            
            root_nodes = [i for i in range(len(nodes)) if i not in child_nodes]
            print(f"Root node indices: {root_nodes}")
            for r_idx in root_nodes[:5]:
                r_node = nodes[r_idx]
                print(f"  Root Node {r_idx}: name='{r_node.get('name')}', translation={r_node.get('translation')}, rotation={r_node.get('rotation')}, scale={r_node.get('scale')}")
            if len(root_nodes) > 5:
                print(f"  ... and {len(root_nodes) - 5} more roots")
                
    except Exception as e:
        print(f"Error parsing GLB: {e}")

if __name__ == "__main__":
    files = [
        'assets/models/track.glb',
        'assets/models/track_nodraco.glb',
        'assets/models/flowerman.glb',
        'assets/models/flowerman_nodraco.glb',
        'mariokart_backups/track_86mb.glb'
    ]
    for path in files:
        analyze(path)
