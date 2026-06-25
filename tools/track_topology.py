#!/usr/bin/env python3
"""
track_topology.py — Analiza la topología de un área del track.glb en COORDS DE MUNDO DCL.

track.glb se coloca en mundo (-88, 60, 38.19) con escala 1, y DCL ESPEJA la X. El mapeo
(confirmado con el empty del NPC del paintball) es:
    world_x = -88   - local_x      (X-flip)
    world_y =  60   + local_y
    world_z =  38.19 + local_z

Lee los vértices (muestreados), los pasa a mundo, filtra una ventana XZ y arma:
  - rango Y, histograma de Y  → niveles de piso
  - mapa de alturas ASCII (piso = Y mínima por celda) → rampas/desniveles/pasillos

Uso:
    python tools/track_topology.py [zmin zmax] [xmin xmax]
    (default: dust = Z 200..600, X -120..120)
"""
import struct, json, sys, math

GLB = 'assets/models/track.glb'
JSON_CHUNK, BIN_CHUNK, GLB_MAGIC = 0x4E4F534A, 0x004E4942, 0x46546C67
TRACK_POS = (-88.0, 60.0, 38.19)   # mundo (con +offset ya aplicado)
SAMPLE = 6                          # 1 de cada N vértices (velocidad)
CELL = 12.0                         # tamaño de celda del mapa (m)

def read_glb(path):
    with open(path, 'rb') as f: data = f.read()
    magic, ver, length = struct.unpack_from('<III', data, 0)
    assert magic == GLB_MAGIC, 'no es GLB'
    off, jb, bb = 12, None, None
    while off < length:
        clen, ctype = struct.unpack_from('<II', data, off); off += 8
        chunk = data[off:off+clen]; off += clen
        if ctype == JSON_CHUNK: jb = chunk
        elif ctype == BIN_CHUNK: bb = chunk
    return json.loads(jb.decode('utf-8')), (bb or b'')

def mat_id(): return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]
def mat_mul(a, b):
    r = [0.0]*16
    for j in range(4):
        for i in range(4):
            s = 0.0
            for k in range(4): s += a[k*4+i]*b[j*4+k]
            r[j*4+i] = s
    return r
def trs(t, q, s):
    x,y,z,w = q
    R = mat_id()
    R[0]=1-2*(y*y+z*z); R[1]=2*(x*y+w*z);   R[2]=2*(x*z-w*y)
    R[4]=2*(x*y-w*z);   R[5]=1-2*(x*x+z*z); R[6]=2*(y*z+w*x)
    R[8]=2*(x*z+w*y);   R[9]=2*(y*z-w*x);   R[10]=1-2*(x*x+y*y)
    S = mat_id(); S[0],S[5],S[10]=s
    T = mat_id(); T[12],T[13],T[14]=t
    return mat_mul(mat_mul(T,R),S)
def node_mat(n):
    if 'matrix' in n: return list(n['matrix'])
    return trs(n.get('translation',[0,0,0]), n.get('rotation',[0,0,0,1]), n.get('scale',[1,1,1]))
def xform(m, p):
    x,y,z = p
    return (m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14])

def acc_vec3(g, bb, idx):
    acc = g['accessors'][idx]; bv = g['bufferViews'][acc['bufferView']]
    base = bv.get('byteOffset',0)+acc.get('byteOffset',0)
    stride = bv.get('byteStride',12); cnt = acc['count']
    for i in range(0, cnt, SAMPLE):
        yield struct.unpack_from('<fff', bb, base+i*stride)

def main():
    a = sys.argv[1:]
    zmin, zmax = (float(a[0]), float(a[1])) if len(a)>=2 else (200.0, 600.0)
    xmin, xmax = (float(a[2]), float(a[3])) if len(a)>=4 else (-120.0, 120.0)
    g, bb = read_glb(GLB)
    nodes = g.get('nodes', []); meshes = g.get('meshes', [])
    scene = g.get('scenes', [{'nodes': list(range(len(nodes)))}])[g.get('scene',0)]
    roots = scene.get('nodes', [])

    # celdas: por (ix,iz) → [min_y, max_y, count]
    cells = {}
    yvals = []
    def visit(ni, pm):
        n = nodes[ni]; m = mat_mul(pm, node_mat(n))
        if 'mesh' in n:
            for prim in meshes[n['mesh']].get('primitives', []):
                pos = prim.get('attributes',{}).get('POSITION')
                if pos is None: continue
                for v in acc_vec3(g, bb, pos):
                    lx,ly,lz = xform(m, v)
                    wx = TRACK_POS[0] - lx
                    wy = TRACK_POS[1] + ly
                    wz = TRACK_POS[2] + lz
                    if not (zmin<=wz<=zmax and xmin<=wx<=xmax): continue
                    yvals.append(wy)
                    ix = int(math.floor((wx-xmin)/CELL)); iz = int(math.floor((wz-zmin)/CELL))
                    c = cells.get((ix,iz))
                    if c is None: cells[(ix,iz)] = [wy, wy, 1]
                    else:
                        if wy<c[0]: c[0]=wy
                        if wy>c[1]: c[1]=wy
                        c[2]+=1
        for ch in n.get('children', []): visit(ch, m)
    for r in roots: visit(r, mat_id())

    if not yvals:
        print('Sin geometría en la ventana dada.'); return
    yvals.sort()
    print(f'\n=== DUST topology — ventana mundo X[{xmin:.0f},{xmax:.0f}] Z[{zmin:.0f},{zmax:.0f}] ===')
    print(f'vértices muestreados: {len(yvals)}  (1/{SAMPLE})')
    print(f'Y mundo: min {yvals[0]:.1f}  max {yvals[-1]:.1f}  mediana {yvals[len(yvals)//2]:.1f}')
    # histograma de Y (niveles de piso)
    print('\nHistograma de Y (niveles):')
    lo, hi = math.floor(yvals[0]), math.ceil(yvals[-1])
    BIN = 2
    hist = {}
    for y in yvals: hist[int((y-lo)//BIN)] = hist.get(int((y-lo)//BIN),0)+1
    mx = max(hist.values())
    for b in range(0, (hi-lo)//BIN+1):
        c = hist.get(b,0)
        if c==0: continue
        bar = '#'*int(40*c/mx)
        print(f'  Y {lo+b*BIN:5.0f}..{lo+b*BIN+BIN:<4.0f} {bar} {c}')
    # mapa de alturas (piso = min Y por celda)
    nx = int((xmax-xmin)/CELL)+1; nz = int((zmax-zmin)/CELL)+1
    print(f'\nMapa de PISO (Y mín por celda de {CELL:.0f}m). Filas = Z (arriba=Z alto), Cols = X.')
    print('  Cada celda = decenas de Y (ej "07"=~70). "." = sin geometría.\n')
    for iz in range(nz-1, -1, -1):
        row = f'Z{zmin+iz*CELL:5.0f} '
        for ix in range(nx):
            c = cells.get((ix,iz))
            row += ' ..' if c is None else f' {int(round(c[0]))%100:02d}'
        print(row)
    print('       ' + ''.join(f' X{xmin+ix*CELL:>3.0f}'[:3] for ix in range(nx)))

if __name__ == '__main__':
    main()
