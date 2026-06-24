# Genera images/minimap.png: render top-down (XZ) de track.glb + lake.glb proyectado a
# coordenadas WORLD (con el X-flip de DCL), rellenando cada triángulo con el color
# promedio de la textura de su material. La ventana de mundo elegida = los bordes del
# minimapa en ui.tsx → calibración exacta por construcción.
import importlib.util, struct, io, sys
from PIL import Image, ImageDraw
import numpy as np

spec = importlib.util.spec_from_file_location('g', 'tools/glb_recenter.py')
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)

# Transform del track entity en el mundo (idéntica para lake.glb): pos (-88, _, 38.19),
# scale 1, identidad, y DCL espeja X → world_x = -88 + lx, world_z = 38.19 + lz
TX, TZ = -88.0, 38.19
def to_world(lx, lz): return (TX + lx, TZ + lz)

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
    tris = []  # (color, [(wx,wz)x3])
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
print('triángulos: track', len(track), '| lake', len(lake))

# ── Ventana de mundo: bbox del contenido developed + spawn, con padding ──
SPAWN = (-197.4, 89.8)
# Para la ventana usamos los triángulos del track (sin la malla gigante de terreno que
# domina). Tomamos percentiles para descartar terreno extremo.
xs = []; zs = []
for col, tri in track:
    for (wx, wz) in tri: xs.append(wx); zs.append(wz)
xs = np.array(xs); zs = np.array(zs)
# percentil 2-98 para recortar el terreno gigante, + spawn
xmin = min(np.percentile(xs, 2), SPAWN[0]); xmax = max(np.percentile(xs, 98), SPAWN[0])
zmin = min(np.percentile(zs, 2), SPAWN[1]); zmax = max(np.percentile(zs, 98), SPAWN[1])
# padding 8%
pdx = (xmax - xmin) * 0.08; pdz = (zmax - zmin) * 0.08
xmin -= pdx; xmax += pdx; zmin -= pdz; zmax += pdz
# Ventana CUADRADA (expandir el eje menor) → textura POT 1024x1024 sin distorsión, que
# los clientes deployados aceptan (requieren potencia de 2).
side = max(xmax - xmin, zmax - zmin)
cxw = (xmin + xmax) / 2; czw = (zmin + zmax) / 2
xmin, xmax = cxw - side / 2, cxw + side / 2
zmin, zmax = czw - side / 2, czw + side / 2
W = H = side
print(f'VENTANA world (cuadrada): X[{xmin:.1f},{xmax:.1f}] Z[{zmin:.1f},{zmax:.1f}]  ({W:.0f})')

# ── Rasterizar (supersample x2 → downscale a 1024 POT) ──
SS = 2; maxpx = 1024
if W >= H: pw = maxpx; ph = max(1, int(maxpx * H / W))
else:      ph = maxpx; pw = max(1, int(maxpx * W / H))
PW, PH = pw * SS, ph * SS
img = Image.new('RGB', (PW, PH), (28, 30, 26)); dr = ImageDraw.Draw(img)
def px(wx, wz):
    cx = (wx - xmin) / W * PW
    cy = (zmax - wz) / H * PH   # Z arriba → fila 0 = zmax
    return (cx, cy)
# orden: primero lake (agua) de fondo bajo el track? No: dibujamos track (incluye terreno)
# y luego lake encima para que el agua se vea. El terreno gigante se dibuja primero igual.
for col, tri in track:
    dr.polygon([px(*p) for p in tri], fill=col)
for col, tri in lake:
    b = (int(col[0]*0.5), int(col[1]*0.7+40), int(col[2]*0.6+90))  # realzar azul agua
    dr.polygon([px(*p) for p in tri], fill=b)
img = img.resize((pw, ph), Image.LANCZOS)
img.save('images/minimap.png')
print(f'OK -> images/minimap.png ({pw}x{ph})')
# imprimir bordes para ui.tsx
print(f'UI_BOUNDS TRACK_MIN_X={xmin:.1f} TRACK_MAX_X={xmax:.1f} TRACK_MIN_Z={zmin:.1f} TRACK_MAX_Z={zmax:.1f}')
