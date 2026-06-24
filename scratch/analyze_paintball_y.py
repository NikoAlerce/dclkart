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

gltf, bin = g.read_glb('assets/models/track.glb')
nodes = gltf['nodes']; meshes = gltf.get('meshes', [])
y_coords = []

def visit(ni, pm):
    n = nodes[ni]; m = g.mat_mul(pm, g.node_local_matrix(n))
    if 'mesh' in n:
        for prim in meshes[n['mesh']].get('primitives', []):
            pos = read_accessor(gltf, bin, prim['attributes']['POSITION'])
            for p in pos:
                wp = g.transform_point(m, p)
                wx, wz = to_world(wp[0], wp[2])
                # Track entity position is at Y = 10.0 + WORLD_Y_OFFSET (50.0) = 60.0
                wy = wp[1] + 60.0
                if 250.0 <= wz <= 600.0 and -150.0 <= wx <= 150.0:
                    y_coords.append(wy)
    for ch in n.get('children', []): visit(ch, m)

for r in gltf['scenes'][gltf.get('scene', 0)].get('nodes', list(range(len(nodes)))):
    visit(r, g.mat_identity())

print(f"Total vertices in paintball XZ bounds: {len(y_coords)}")
if len(y_coords) > 0:
    print(f"Min Y: {min(y_coords):.2f}")
    print(f"Max Y: {max(y_coords):.2f}")
    
    # Binning Y coordinates in steps of 5
    bins = {}
    for y in y_coords:
        y_bin = int(y // 5) * 5
        bins[y_bin] = bins.get(y_bin, 0) + 1
        
    print("\nVertex count by Y bin:")
    for y_bin in sorted(bins.keys()):
        print(f"Y in [{y_bin}, {y_bin+5}]: {bins[y_bin]} vertices")
