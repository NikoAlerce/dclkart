#!/usr/bin/env python3
"""
glb_recenter.py — Recentra la geometría de un .glb sobre su origen.

Parser GLB en Python PURO (sin dependencias): no toca vértices ni materiales.
La corrección se hace envolviendo las raíces de la escena en un nodo nuevo con
una traslación = -centro, así todo el modelo se desplaza para que el centro de
su bounding-box quede sobre el origen (0,0,0).

Uso:
  python tools/glb_recenter.py inspect <archivo.glb>
  python tools/glb_recenter.py fix     <archivo.glb> [--axes XYZ] [--no-backup]

  --axes  ejes a recentrar (por defecto XYZ). Ej: XZ centra solo horizontal.
"""
import struct, json, sys, os, shutil, math

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK  = 0x004E4942
GLB_MAGIC  = 0x46546C67


# ── GLB I/O ───────────────────────────────────────────────────────────────────
def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, version, length = struct.unpack_from('<III', data, 0)
    if magic != GLB_MAGIC:
        raise ValueError("No es un GLB válido")
    off = 12
    json_bytes = bin_bytes = None
    while off < length:
        clen, ctype = struct.unpack_from('<II', data, off)
        off += 8
        chunk = data[off:off + clen]
        off += clen
        if ctype == JSON_CHUNK:
            json_bytes = chunk
        elif ctype == BIN_CHUNK:
            bin_bytes = chunk
    gltf = json.loads(json_bytes.decode('utf-8'))
    return gltf, (bin_bytes if bin_bytes is not None else b'')


def write_glb(path, gltf, bin_bytes):
    json_bytes = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    # padding a múltiplo de 4: JSON con espacios (0x20), BIN con ceros (0x00)
    json_pad = (4 - len(json_bytes) % 4) % 4
    json_bytes += b' ' * json_pad
    bin_pad = (4 - len(bin_bytes) % 4) % 4
    bin_padded = bin_bytes + b'\x00' * bin_pad

    total = 12 + 8 + len(json_bytes)
    if bin_bytes:
        total += 8 + len(bin_padded)

    with open(path, 'wb') as f:
        f.write(struct.pack('<III', GLB_MAGIC, 2, total))
        f.write(struct.pack('<II', len(json_bytes), JSON_CHUNK))
        f.write(json_bytes)
        if bin_bytes:
            f.write(struct.pack('<II', len(bin_padded), BIN_CHUNK))
            f.write(bin_padded)


# ── Álgebra 4x4 (column-major, orden glTF) ─────────────────────────────────────
def mat_identity():
    return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]

def mat_mul(a, b):
    # a,b column-major flat-16 → a*b
    r = [0.0]*16
    for j in range(4):
        for i in range(4):
            s = 0.0
            for k in range(4):
                s += a[k*4 + i] * b[j*4 + k]
            r[j*4 + i] = s
    return r

def mat_from_trs(t, q, s):
    x, y, z, w = q
    # rotación (column-major)
    R = mat_identity()
    R[0] = 1 - 2*(y*y + z*z); R[1] = 2*(x*y + w*z);     R[2] = 2*(x*z - w*y)
    R[4] = 2*(x*y - w*z);     R[5] = 1 - 2*(x*x + z*z); R[6] = 2*(y*z + w*x)
    R[8] = 2*(x*z + w*y);     R[9] = 2*(y*z - w*x);     R[10] = 1 - 2*(x*x + y*y)
    S = mat_identity(); S[0], S[5], S[10] = s[0], s[1], s[2]
    T = mat_identity(); T[12], T[13], T[14] = t[0], t[1], t[2]
    return mat_mul(mat_mul(T, R), S)

def node_local_matrix(node):
    if 'matrix' in node:
        return list(node['matrix'])
    t = node.get('translation', [0,0,0])
    q = node.get('rotation',    [0,0,0,1])
    s = node.get('scale',       [1,1,1])
    return mat_from_trs(t, q, s)

def transform_point(m, p):
    x, y, z = p
    return (
        m[0]*x + m[4]*y + m[8]*z  + m[12],
        m[1]*x + m[5]*y + m[9]*z  + m[13],
        m[2]*x + m[6]*y + m[10]*z + m[14],
    )


# ── Bounding box mundial de toda la geometría ──────────────────────────────────
def compute_bounds(gltf):
    accessors = gltf.get('accessors', [])
    meshes    = gltf.get('meshes', [])
    nodes     = gltf.get('nodes', [])
    scene_idx = gltf.get('scene', 0)
    scenes    = gltf.get('scenes', [{'nodes': list(range(len(nodes)))}])
    roots     = scenes[scene_idx].get('nodes', [])

    INF = float('inf')
    bmin = [INF, INF, INF]
    bmax = [-INF, -INF, -INF]
    found = [False]

    def visit(ni, parent_m):
        node = nodes[ni]
        m = mat_mul(parent_m, node_local_matrix(node))
        if 'mesh' in node:
            for prim in meshes[node['mesh']].get('primitives', []):
                pos = prim.get('attributes', {}).get('POSITION')
                if pos is None:
                    continue
                acc = accessors[pos]
                amin = acc.get('min'); amax = acc.get('max')
                if not amin or not amax:
                    continue
                # 8 esquinas del AABB local → mundo
                for cx in (amin[0], amax[0]):
                    for cy in (amin[1], amax[1]):
                        for cz in (amin[2], amax[2]):
                            wp = transform_point(m, (cx, cy, cz))
                            for k in range(3):
                                if wp[k] < bmin[k]: bmin[k] = wp[k]
                                if wp[k] > bmax[k]: bmax[k] = wp[k]
                            found[0] = True
        for ch in node.get('children', []):
            visit(ch, m)

    for r in roots:
        visit(r, mat_identity())

    if not found[0]:
        return None
    center = [(bmin[k] + bmax[k]) / 2 for k in range(3)]
    size   = [bmax[k] - bmin[k] for k in range(3)]
    return bmin, bmax, center, size, roots


def read_accessor_vec3(gltf, bin_bytes, idx):
    acc = gltf['accessors'][idx]
    bv = gltf['bufferViews'][acc['bufferView']]
    base = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    stride = bv.get('byteStride', 12)  # VEC3 float = 12 bytes tightly packed
    count = acc['count']
    out = []
    for i in range(count):
        off = base + i * stride
        out.append(struct.unpack_from('<fff', bin_bytes, off))
    return out


def principal_axis_xz(gltf, bin_bytes):
    """Ángulo (grados) del eje LARGO de la geometría en el plano XZ, espacio del modelo
    (con transforms de nodo aplicados). Devuelve también un punto medio adelantado para
    desambiguar el frente si hiciera falta."""
    accessors = gltf.get('accessors', [])
    meshes    = gltf.get('meshes', [])
    nodes     = gltf.get('nodes', [])
    scene_idx = gltf.get('scene', 0)
    scenes    = gltf.get('scenes', [{'nodes': list(range(len(nodes)))}])
    roots     = scenes[scene_idx].get('nodes', [])

    pts = []
    def visit(ni, parent_m):
        node = nodes[ni]
        m = mat_mul(parent_m, node_local_matrix(node))
        if 'mesh' in node:
            for prim in meshes[node['mesh']].get('primitives', []):
                pos = prim.get('attributes', {}).get('POSITION')
                if pos is None:
                    continue
                for v in read_accessor_vec3(gltf, bin_bytes, pos):
                    pts.append(transform_point(m, v))
        for ch in node.get('children', []):
            visit(ch, m)
    for r in roots:
        visit(r, mat_identity())

    n = len(pts)
    cx = sum(p[0] for p in pts) / n
    cz = sum(p[2] for p in pts) / n
    sxx = sum((p[0]-cx)**2 for p in pts) / n
    szz = sum((p[2]-cz)**2 for p in pts) / n
    sxz = sum((p[0]-cx)*(p[2]-cz) for p in pts) / n
    # ángulo del eje principal (mayor varianza) respecto a +X
    angle = 0.5 * math.atan2(2*sxz, sxx - szz)
    # asegurar que apunte al eje de MAYOR varianza
    import math as _m
    c, s = _m.cos(angle), _m.sin(angle)
    var_along = sxx*c*c + 2*sxz*c*s + szz*s*s
    var_perp  = sxx*s*s - 2*sxz*c*s + szz*c*c
    if var_perp > var_along:
        angle += _m.pi/2
    # normalizar a (-90, 90]
    deg = math.degrees(angle)
    while deg <= -90: deg += 180
    while deg > 90:   deg -= 180
    return deg, n


def fmt3(v):
    return "(" + ", ".join(f"{x:+.4f}" for x in v) + ")"


def inspect(path):
    gltf, _ = read_glb(path)
    nodes = gltf.get('nodes', [])
    print(f"\n── {os.path.basename(path)} ──")
    print(f"  nodos: {len(nodes)} · meshes: {len(gltf.get('meshes', []))} · "
          f"materiales: {len(gltf.get('materials', []))} · "
          f"texturas: {len(gltf.get('textures', []))} · "
          f"animaciones: {len(gltf.get('animations', []))}")
    b = compute_bounds(gltf)
    if not b:
        print("  (sin geometría con POSITION min/max)")
        return None
    bmin, bmax, center, size, roots = b
    print(f"  AABB min   : {fmt3(bmin)}")
    print(f"  AABB max   : {fmt3(bmax)}")
    print(f"  tamaño     : {fmt3(size)}")
    print(f"  CENTRO     : {fmt3(center)}   <- offset del origen")
    off = math.sqrt(sum(c*c for c in center))
    print(f"  desfasaje  : {off:.4f} m  {'(centrado ✓)' if off < 0.02 else '(DESCENTRADO)'}")
    print(f"  raíces     : {roots}")
    return center


def fix(path, axes="XYZ", backup=True):
    gltf, bin_bytes = read_glb(path)
    b = compute_bounds(gltf)
    if not b:
        print("Sin geometría; nada que hacer."); return
    _, _, center, _, roots = b

    mask = [('X' in axes.upper()), ('Y' in axes.upper()), ('Z' in axes.upper())]
    offset = [(-center[k] if mask[k] else 0.0) for k in range(3)]

    print(f"Centro actual: {fmt3(center)}")
    print(f"Traslación a aplicar (ejes {axes.upper()}): {fmt3(offset)}")

    if backup:
        bak = path + ".bak"
        if not os.path.exists(bak):
            shutil.copy2(path, bak)
            print(f"Backup → {os.path.basename(bak)}")
        else:
            print(f"Backup ya existe ({os.path.basename(bak)}), no se sobrescribe")

    # Nodo envoltorio con la traslación; toma las raíces actuales como hijos.
    nodes = gltf.setdefault('nodes', [])
    wrapper = {'name': 'recenter_pivot', 'translation': offset, 'children': list(roots)}
    nodes.append(wrapper)
    wrapper_idx = len(nodes) - 1
    scene_idx = gltf.get('scene', 0)
    scenes = gltf.setdefault('scenes', [{'nodes': list(roots)}])
    scenes[scene_idx]['nodes'] = [wrapper_idx]

    write_glb(path, gltf, bin_bytes)
    print(f"Escrito {os.path.basename(path)}")

    # Verificación
    g2, _ = read_glb(path)
    nb = compute_bounds(g2)
    if nb:
        print(f"Centro nuevo: {fmt3(nb[2])}")


def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    cmd, path = sys.argv[1], sys.argv[2]
    if cmd == 'inspect':
        inspect(path)
    elif cmd == 'anims':
        gltf, _ = read_glb(path)
        anims = gltf.get('animations', [])
        print(f"\n── {os.path.basename(path)} ── {len(anims)} animación(es)")
        for i, a in enumerate(anims):
            ch = len(a.get('channels', []))
            print(f"  [{i}] name={a.get('name', '(sin nombre)')!r}  canales={ch}")
        nodes = gltf.get('nodes', [])
        named = [n.get('name') for n in nodes if n.get('name')]
        print(f"  nodos con nombre: {named[:12]}{' ...' if len(named) > 12 else ''}")
    elif cmd == 'axis':
        gltf, bin_bytes = read_glb(path)
        deg, n = principal_axis_xz(gltf, bin_bytes)
        print(f"\n── {os.path.basename(path)} ── eje principal (PCA, {n} vértices)")
        print(f"  ángulo del eje LARGO respecto a +X : {deg:+.2f}°")
        print(f"  (la trompa está sobre ese eje; el frente es uno de los dos extremos)")
        # offset sugerido si la trompa apunta al extremo +X-ish del eje: modelYawOffset = α - 90
        print(f"  modelYawOffset si trompa→+X-ish : {deg - 90:+.1f}")
        print(f"  modelYawOffset si trompa→-X-ish : {deg + 90:+.1f}")
    elif cmd == 'fix':
        axes = "XYZ"
        backup = True
        for a in sys.argv[3:]:
            if a.startswith('--axes'):
                axes = a.split('=', 1)[1] if '=' in a else sys.argv[sys.argv.index(a)+1]
            elif a == '--no-backup':
                backup = False
        fix(path, axes=axes, backup=backup)
    else:
        print(__doc__); sys.exit(1)


if __name__ == '__main__':
    main()
