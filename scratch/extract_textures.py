import struct, json

with open('assets/models/kart.glb', 'rb') as f:
    f.read(4); f.read(4); f.read(4)
    jlen = struct.unpack('<I', f.read(4))[0]
    f.read(4)
    jdata = f.read(jlen)
    f.seek(12 + 8 + jlen)
    blen = struct.unpack('<I', f.read(4))[0]
    f.read(4)
    bindata = f.read(blen)

g = json.loads(jdata.decode('utf-8'))
views = g.get('bufferViews', [])
images = g.get('images', [])

# Extract each image
for i, img in enumerate(images):
    bv = img.get('bufferView')
    if bv is not None:
        view = views[bv]
        offset = view.get('byteOffset', 0)
        length = view.get('byteLength', 0)
        raw = bindata[offset:offset+length]
        fname = f'scratch/kart_texture_{i}.png'
        with open(fname, 'wb') as out:
            out.write(raw)
        print(f'Saved {fname} ({length} bytes)')
