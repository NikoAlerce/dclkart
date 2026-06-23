import importlib.util, struct, io, sys
spec = importlib.util.spec_from_file_location('g', 'tools/glb_recenter.py')
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)

TX, TZ = -88.0, 38.19
def to_world(lx, lz): return (TX - lx, TZ + lz)

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

def get_vertices_with_materials(path):
    gltf, bin = g.read_glb(path)
    nodes = gltf['nodes']; meshes = gltf.get('meshes', [])
    vertices = []
    
    def visit(ni, pm):
        n = nodes[ni]; m = g.mat_mul(pm, g.node_local_matrix(n))
        if 'mesh' in n:
            for prim in meshes[n['mesh']].get('primitives', []):
                pos = read_accessor(gltf, bin, prim['attributes']['POSITION'])
                # Get material info to see if we can identify the arena
                mat_idx = prim.get('material')
                mat_name = ""
                if mat_idx is not None:
                    mat_name = gltf['materials'][mat_idx].get('name', '')
                
                for p in pos:
                    wp = g.transform_point(m, p)
                    wx, wz = to_world(wp[0], wp[2])
                    wy = wp[1] + 50.0
                    vertices.append((wx, wy, wz, mat_name))
        for ch in n.get('children', []): visit(ch, m)
        
    for r in gltf['scenes'][gltf.get('scene', 0)].get('nodes', list(range(len(nodes)))):
        visit(r, g.mat_identity())
    return vertices

print("Scanning track.glb vertices...")
verts = get_vertices_with_materials('assets/models/track.glb')

# Paintball region: Z in [250, 600], Y in [105, 140]
pb_verts = [v for v in verts if 250.0 <= v[2] <= 600.0 and 105.0 <= v[1] <= 140.0]
print(f"Paintball vertices: {len(pb_verts)}")

# Print unique materials in this region
mats = set(v[3] for v in pb_verts)
print("Materials in region:", list(mats))

# Let's bin the X coordinates of these vertices
bins = {}
for v in pb_verts:
    x_bin = int(v[0] // 20) * 20
    bins[x_bin] = bins.get(x_bin, 0) + 1

print("\nVertex count by X bin:")
for x in sorted(bins.keys()):
    print(f"X in [{x}, {x+20}]: {bins[x]} vertices")
