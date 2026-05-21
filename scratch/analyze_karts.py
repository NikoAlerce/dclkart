import struct, json, glob, os

files = ['assets/models/kart.glb', 'assets/models/kart2.glb', 'assets/models/kart3.glb', 'assets/models/kart4.glb']

for filepath in files:
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        continue
        
    print(f"\n--- Analyzing {filepath} ---")
    try:
        with open(filepath, 'rb') as f:
            magic = f.read(4)
            version = f.read(4)
            length = f.read(4)
            jlen = struct.unpack('<I', f.read(4))[0]
            jtype = f.read(4)
            jdata = f.read(jlen)
            
        g = json.loads(jdata.decode('utf-8'))
        
        # Check scenes
        scenes = g.get('scenes', [])
        scene_idx = g.get('scene')
        print(f"Default scene index: {scene_idx} (Total scenes: {len(scenes)})")
        
        # Check nodes and meshes
        nodes = g.get('nodes', [])
        meshes = g.get('meshes', [])
        accessors = g.get('accessors', [])
        materials = g.get('materials', [])
        
        print(f"Nodes count: {len(nodes)}")
        print(f"Meshes count: {len(meshes)}")
        print(f"Materials count: {len(materials)}")
        
        # Look at meshes and their positions/scales
        for idx, node in enumerate(nodes):
            mesh_idx = node.get('mesh')
            matrix = node.get('matrix')
            translation = node.get('translation')
            rotation = node.get('rotation')
            scale = node.get('scale')
            
            node_info = f"Node {idx} '{node.get('name', 'unnamed')}'"
            transform_info = []
            if translation: transform_info.append(f"translation={translation}")
            if rotation: transform_info.append(f"rotation={rotation}")
            if scale: transform_info.append(f"scale={scale}")
            if matrix: transform_info.append(f"matrix={matrix}")
            
            if mesh_idx is not None:
                mesh = meshes[mesh_idx]
                mesh_info = f"uses Mesh {mesh_idx} '{mesh.get('name', 'unnamed')}'"
                
                # Check bounds
                bounds_info = []
                for p_idx, prim in enumerate(mesh.get('primitives', [])):
                    pos_idx = prim.get('attributes', {}).get('POSITION')
                    if pos_idx is not None:
                        acc = accessors[pos_idx]
                        bounds_info.append(f"p{p_idx} bounds: min={acc.get('min')}, max={acc.get('max')}")
                
                print(f"  {node_info} {mesh_info}")
                if transform_info:
                    print(f"    Transform: {', '.join(transform_info)}")
                if bounds_info:
                    print(f"    Bounds: {'; '.join(bounds_info)}")
                    
    except Exception as e:
        print(f"Error reading GLB: {e}")
