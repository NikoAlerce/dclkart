import importlib.util, struct, io, sys
spec = importlib.util.spec_from_file_location('g', 'tools/glb_recenter.py')
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)

CT = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}

def read_accessor(gltf, bin, idx):
    a = gltf['accessors'][idx]; bv = gltf['bufferViews'][a['bufferView']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    fmt, size = CT[a['componentType']]
    ncomp = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    stride = bv.get('byteStride') or (size * ncomp)
    out = []
    for i in range(a['count']):
        base = off + i * stride
        vals = struct.unpack_from('<' + fmt * ncomp, bin, base)
        out.append(vals if ncomp > 1 else vals[0])
    return out

def get_subtree_vertices(path, start_node_name):
    gltf, bin = g.read_glb(path)
    nodes = gltf['nodes']; meshes = gltf.get('meshes', [])
    
    # 1. Find the starting node
    start_idx = None
    for idx, n in enumerate(nodes):
        if n.get('name') == start_node_name:
            start_idx = idx
            break
            
    if start_idx is None:
        print(f"Node '{start_node_name}' not found!")
        return
        
    # 2. Recursively collect vertices from this node and its children
    verts = []
    
    def collect(ni, pm):
        n = nodes[ni]; m = g.mat_mul(pm, g.node_local_matrix(n))
        if 'mesh' in n:
            for prim in meshes[n['mesh']].get('primitives', []):
                pos = read_accessor(gltf, bin, prim['attributes']['POSITION'])
                for p in pos:
                    wp = g.transform_point(m, p)
                    verts.append(wp)
        for ch in n.get('children', []):
            collect(ch, m)
            
    # We want local coordinates relative to the start_node, so we start with identity matrix
    collect(start_idx, g.mat_identity())
    
    print(f"Subtree '{start_node_name}' has vertices count: {len(verts)}")
    if verts:
        xs = [v[0] for v in verts]
        ys = [v[1] for v in verts]
        zs = [v[2] for v in verts]
        print(f"  Local X: [{min(xs):.4f}, {max(xs):.4f}] (width: {max(xs)-min(xs):.4f})")
        print(f"  Local Y: [{min(ys):.4f}, {max(ys):.4f}] (height: {max(ys)-min(ys):.4f})")
        print(f"  Local Z: [{min(zs):.4f}, {max(zs):.4f}]")

print("Inspecting node 'Screen' subtree...")
get_subtree_vertices('assets/models/screen.glb', 'Screen')

print("\nInspecting node 'Logo' subtree...")
get_subtree_vertices('assets/models/screen.glb', 'Logo')

print("\nInspecting node 'rear_section' subtree...")
get_subtree_vertices('assets/models/screen.glb', 'rear_section')
