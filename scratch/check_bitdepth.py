import struct, json

with open('assets/models/kart.glb', 'rb') as f:
    f.read(4); f.read(4); f.read(4)
    jlen = struct.unpack('<I', f.read(4))[0]; f.read(4)
    jdata = f.read(jlen)
    f.seek(12 + 8 + jlen)
    blen = struct.unpack('<I', f.read(4))[0]; f.read(4)
    bindata = f.read(blen)

g = json.loads(jdata.decode('utf-8'))
views = g['bufferViews']
images = g['images']

color_type_names = {0:'Grayscale', 2:'RGB', 3:'Indexed', 4:'GrayAlpha', 6:'RGBA'}

for i, img in enumerate(images):
    bv = img.get('bufferView')
    if bv is not None:
        view   = views[bv]
        offset = view.get('byteOffset', 0)
        raw    = bindata[offset:offset+32]
        if raw[:8] == b'\x89PNG\r\n\x1a\n':
            w          = struct.unpack('>I', raw[16:20])[0]
            h          = struct.unpack('>I', raw[20:24])[0]
            bit_depth  = raw[24]
            color_type = raw[25]
            ct_name    = color_type_names.get(color_type, 'Unknown')
            ok = '✓ OK' if bit_depth == 8 else '!!! PROBLEM: DCL requires 8-bit PNG'
            print('Image', i, ':', str(w)+'x'+str(h), str(bit_depth)+'-bit', ct_name, ok)
        else:
            print('Image', i, ': not standard PNG, header=', raw[:8])
