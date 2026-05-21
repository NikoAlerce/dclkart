import struct, json

with open('assets/models/kart.glb', 'rb') as f:
    magic   = f.read(4)
    version = f.read(4)
    length  = f.read(4)
    jlen    = struct.unpack('<I', f.read(4))[0]; f.read(4)
    jdata   = f.read(jlen)
    f.seek(12 + 8 + jlen)
    blen    = struct.unpack('<I', f.read(4))[0]
    btype   = f.read(4)
    bindata = f.read(blen)

g = json.loads(jdata.decode('utf-8'))

# Replace all materials with a flat RED, matte, no textures
for m in g.get('materials', []):
    m['pbrMetallicRoughness'] = {
        'baseColorFactor': [1.0, 0.0, 0.0, 1.0],  # RED
        'metallicFactor':  0.0,
        'roughnessFactor': 0.9
    }
    m['emissiveFactor'] = [0, 0, 0]
    m.pop('normalTexture', None)
    m.pop('occlusionTexture', None)
    m.pop('emissiveTexture', None)

print('Materials patched to flat RED')

new_json = json.dumps(g, separators=(',', ':')).encode('utf-8')
pad = (4 - len(new_json) % 4) % 4
new_json += b' ' * pad

new_jlen   = struct.pack('<I', len(new_json))
new_total  = 12 + 8 + len(new_json) + 8 + len(bindata)
new_length = struct.pack('<I', new_total)

with open('assets/models/kart_test_red.glb', 'wb') as f:
    f.write(magic)
    f.write(version)
    f.write(new_length)
    f.write(new_jlen)
    f.write(b'JSON')
    f.write(new_json)
    f.write(struct.pack('<I', len(bindata)))
    f.write(btype)
    f.write(bindata)

print('Saved kart_test_red.glb')
