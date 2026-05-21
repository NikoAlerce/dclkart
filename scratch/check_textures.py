import struct, json, zlib, io

with open('assets/models/kart.glb', 'rb') as f:
    magic   = f.read(4)
    version = f.read(4)
    length  = f.read(4)
    jlen    = struct.unpack('<I', f.read(4))[0]
    jtype   = f.read(4)
    jdata   = f.read(jlen)
    # BIN chunk
    if f.read(4):   # bin length
        pass
    blen_bytes = f.seek(12 + 8 + jlen)
    f.seek(12 + 8 + jlen)
    blen = struct.unpack('<I', f.read(4))[0]
    btype = f.read(4)
    bindata = f.read(blen)

g = json.loads(jdata.decode('utf-8'))

images  = g.get('images', [])
views   = g.get('bufferViews', [])

print("=== IMAGES IN GLB ===")
for i, img in enumerate(images):
    mime = img.get('mimeType', 'unknown')
    bv   = img.get('bufferView')
    view = views[bv] if bv is not None else None
    if view:
        offset = view.get('byteOffset', 0)
        length2 = view.get('byteLength', 0)
        raw = bindata[offset:offset+length2]
        # Try to get PNG dimensions
        if raw[:4] == b'\x89PNG':
            w = struct.unpack('>I', raw[16:20])[0]
            h = struct.unpack('>I', raw[20:24])[0]
            pw2_w = (w & (w-1)) == 0
            pw2_h = (h & (h-1)) == 0
            print(f"  Image {i}: PNG {w}x{h}, power-of-2: {pw2_w and pw2_h}, size: {length2} bytes")
        elif raw[:2] == b'\xff\xd8':
            print(f"  Image {i}: JPEG, size: {length2} bytes (no dimension check)")
        else:
            print(f"  Image {i}: UNKNOWN format {raw[:4]}, size: {length2} bytes")
    else:
        uri = img.get('uri', 'no uri')
        print(f"  Image {i}: external uri={uri}")

print()
print("=== MATERIALS ===")
for i, m in enumerate(g.get('materials', [])):
    print(f"  Mat {i}: {m}")
