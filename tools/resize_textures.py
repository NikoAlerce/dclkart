# Redimensiona las texturas embebidas de un GLB a máx 512px (lado mayor), preservando
# JSON/materiales y reconstruyendo el buffer binario (recalcula offsets de bufferViews).
# Backup en .texbak/. Verifica que el GLB re-parsee al final.
import sys, os, io, json, struct, shutil
from PIL import Image

MAX = 512
JSON_T, BIN_T = 0x4E4F534A, 0x004E4942

def read_glb(path):
    with open(path, 'rb') as f: data = f.read()
    magic, ver, length = struct.unpack('<4sII', data[:12])
    assert magic == b'glTF', 'no es GLB'
    off = 12; jchunk = bchunk = None
    while off < length:
        clen, ctype = struct.unpack('<II', data[off:off+8])
        cdata = data[off+8:off+8+clen]
        if ctype == JSON_T: jchunk = cdata
        elif ctype == BIN_T: bchunk = cdata
        off += 8 + clen
    return json.loads(jchunk.decode('utf-8')), bytearray(bchunk or b'')

def write_glb(path, gltf, binbuf):
    jb = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    jb += b' ' * ((4 - len(jb) % 4) % 4)
    bb = bytes(binbuf) + b'\x00' * ((4 - len(binbuf) % 4) % 4)
    out = bytearray()
    out += struct.pack('<II', len(jb), JSON_T) + jb
    out += struct.pack('<II', len(bb), BIN_T) + bb
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, 12 + len(out)) + bytes(out))

def resize_bytes(raw, mime):
    im = Image.open(io.BytesIO(raw))
    w, h = im.size
    if max(w, h) <= MAX:
        return None  # ya chico
    s = MAX / max(w, h)
    nw, nh = max(1, round(w * s)), max(1, round(h * s))
    im = im.resize((nw, nh), Image.LANCZOS)
    buf = io.BytesIO()
    if 'jpeg' in mime or 'jpg' in mime:
        im.convert('RGB').save(buf, format='JPEG', quality=85)
    elif 'webp' in mime:
        im.save(buf, format='WEBP', quality=88, method=4)
    else:
        im.save(buf, format='PNG', optimize=True)
    return buf.getvalue(), (w, h), (nw, nh)

def process(path):
    gltf, binbuf = read_glb(path)
    images = gltf.get('images', [])
    bvs = gltf.get('bufferViews', [])
    # nuevos bytes por bufferView de imagen
    new_img = {}  # bvIndex -> new bytes
    log = []
    for im in images:
        bvi = im.get('bufferView')
        if bvi is None:
            continue
        bv = bvs[bvi]
        o = bv.get('byteOffset', 0); ln = bv['byteLength']
        raw = bytes(binbuf[o:o+ln])
        mime = im.get('mimeType', 'image/png')
        try:
            res = resize_bytes(raw, mime)
        except Exception as e:
            log.append(('skip', im.get('name', f'img{bvi}'), str(e)[:40])); continue
        if res is None:
            continue
        data, old, new = res
        new_img[bvi] = data
        log.append(('resize', im.get('name', f'img{bvi}'), f'{old[0]}x{old[1]}->{new[0]}x{new[1]} ({ln}->{len(data)}B)'))
    if not new_img:
        return None, log  # nada que hacer
    # reconstruir buffer: cada bufferView en orden de índice, alineado a 4
    new_buf = bytearray()
    for i, bv in enumerate(bvs):
        if i in new_img:
            data = new_img[i]
        else:
            o = bv.get('byteOffset', 0); ln = bv['byteLength']
            data = bytes(binbuf[o:o+ln])
        # alinear inicio a 4
        while len(new_buf) % 4 != 0: new_buf.append(0)
        bv['byteOffset'] = len(new_buf)
        bv['byteLength'] = len(data)
        new_buf += data
    if gltf.get('buffers'):
        gltf['buffers'][0]['byteLength'] = len(new_buf)
    return (gltf, new_buf), log

def main(paths):
    os.makedirs('.texbak', exist_ok=True)
    grand_before = grand_after = 0
    for p in paths:
        before = os.path.getsize(p)
        grand_before += before
        result, log = process(p)
        if result is None:
            print(f'{os.path.basename(p):28} {before/1048576:7.2f}MB  (sin texturas >512)')
            grand_after += before
            continue
        shutil.copy(p, os.path.join('.texbak', os.path.basename(p)))
        gltf, new_buf = result
        write_glb(p, gltf, new_buf)
        # verificar re-parse
        try:
            read_glb(p)
            ok = 'OK'
        except Exception as e:
            ok = 'CORRUPTO! ' + str(e)[:30]
            shutil.copy(os.path.join('.texbak', os.path.basename(p)), p)  # restaurar
            ok += ' (restaurado)'
        after = os.path.getsize(p)
        grand_after += after
        ntex = len([l for l in log if l[0] == 'resize'])
        print(f'{os.path.basename(p):28} {before/1048576:7.2f}MB -> {after/1048576:6.2f}MB  [{ntex} tex] {ok}')
    print(f'\nTOTAL GLB: {grand_before/1048576:.2f}MB -> {grand_after/1048576:.2f}MB  (ahorro {(grand_before-grand_after)/1048576:.2f}MB)')

if __name__ == '__main__':
    main(sys.argv[1:])
