# Genera images/paintball_minimap.png: render top-down (XZ) enfocado en la paintball arena
import importlib.util, struct, io, sys
from PIL import Image, ImageDraw
import numpy as np

spec = importlib.util.spec_from_file_location('g', 'tools/glb_recenter.py')
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)

# Transform del track entity en el mundo
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

def material_color(gltf, bin, mat_idx):
    if mat_idx is None: return (150, 150, 150)
    m = gltf['materials'][mat_idx]; pbr = m.get('pbrMetallicRoughness', {})
    bc = pbr.get('baseColorFactor', [1, 1, 1, 1])
    tex = pbr.get('baseColorTexture')
    if tex is not None:
        try:
            img = gltf['images'][gltf['textures'][tex['index']]['source']]
            bv = gltf['bufferViews'][img['bufferView']]
            o = bv.get('byteOffset', 0); ln = bv['byteLength']
            im = Image.open(io.BytesIO(bin[o:o+ln])).convert('RGB')
            arr = np.asarray(im.resize((24, 24))).reshape(-1, 3).mean(axis=0)
            return tuple(int(arr[k] * bc[k]) for k in range(3))
        except Exception:
            pass
    return tuple(int(bc[k] * 255) for k in range(3))

def collect_tris(path):
    gltf, bin = g.read_glb(path)
    nodes = gltf['nodes']; meshes = gltf.get('meshes', [])
    tris = []
    def visit(ni, pm):
        n = nodes[ni]; m = g.mat_mul(pm, g.node_local_matrix(n))
        if 'mesh' in n:
            for prim in meshes[n['mesh']].get('primitives', []):
                pos = read_accessor(gltf, bin, prim['attributes']['POSITION'])
                col = material_color(gltf, bin, prim.get('material'))
                if 'indices' in prim:
                    idx = read_accessor(gltf, bin, prim['indices'])
                else:
                    idx = list(range(len(pos)))
                for t in range(0, len(idx) - 2, 3):
                    tri = []
                    for k in range(3):
                        p = pos[idx[t + k]]
                        wp = g.transform_point(m, p)
                        tri.append(to_world(wp[0], wp[2]))
                    tris.append((col, tri))
        for ch in n.get('children', []): visit(ch, m)
    for r in gltf['scenes'][gltf.get('scene', 0)].get('nodes', list(range(len(nodes)))):
        visit(r, g.mat_identity())
    return tris

print('leyendo track.glb...'); track = collect_tris('assets/models/track.glb')
print('leyendo lake.glb...');  lake  = collect_tris('assets/models/lake.glb')

# Paintball bounds (zoomed and centered around Paintball Arena)
# X de -170 a 170, Z de 245 a 585 (cuadrado de 340m de lado)
xmin, xmax = -170.0, 170.0
zmin, zmax = 245.0, 585.0
W = H = 340.0

# ── Rasterizar (supersample x2 → downscale a 512 POT) ──
SS = 2; maxpx = 512
PW = PH = maxpx * SS
img = Image.new('RGB', (PW, PH), (28, 30, 26)); dr = ImageDraw.Draw(img)

def px(wx, wz):
    cx = (wx - xmin) / W * PW
    cy = (zmax - wz) / H * PH
    return (cx, cy)

for col, tri in track:
    txs = [p[0] for p in tri]
    tzs = [p[1] for p in tri]
    if max(txs) < xmin or min(txs) > xmax or max(tzs) < zmin or min(tzs) > zmax:
        continue
    dr.polygon([px(*p) for p in tri], fill=col)

for col, tri in lake:
    txs = [p[0] for p in tri]
    tzs = [p[1] for p in tri]
    if max(txs) < xmin or min(txs) > xmax or max(tzs) < zmin or min(tzs) > zmax:
        continue
    b = (int(col[0]*0.5), int(col[1]*0.7+40), int(col[2]*0.6+90))
    dr.polygon([px(*p) for p in tri], fill=b)

img = img.resize((maxpx, maxpx), Image.LANCZOS)
img.save('images/paintball_minimap.png')
print(f'OK -> images/paintball_minimap.png ({maxpx}x{maxpx})')
print(f'UI_BOUNDS PAINTBALL_MIN_X={xmin:.1f} PAINTBALL_MAX_X={xmax:.1f} PAINTBALL_MIN_Z={zmin:.1f} PAINTBALL_MAX_Z={zmax:.1f}')
