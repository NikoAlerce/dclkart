import struct, json

with open('assets/models/kart.glb', 'rb') as f:
    magic   = f.read(4)
    version = f.read(4)
    length  = f.read(4)
    jlen    = struct.unpack('<I', f.read(4))[0]
    jtype   = f.read(4)
    jdata   = f.read(jlen)
    f.seek(12 + 8 + jlen)
    blen    = struct.unpack('<I', f.read(4))[0]
    btype   = f.read(4)
    bindata = f.read(blen)

g = json.loads(jdata.decode('utf-8'))

for m in g.get('materials', []):
    pbr = m.get('pbrMetallicRoughness', {})
    if 'metallicRoughnessTexture' in pbr:
        print('Removing broken metallicRoughnessTexture (roughness=0 = mirror effect)')
        del pbr['metallicRoughnessTexture']
    # Set high roughness (matte) and no metallic
    pbr['roughnessFactor'] = 0.9
    pbr['metallicFactor']  = 0.0
    # Clear emissive just in case
    m['emissiveFactor'] = [0, 0, 0]
    print(f'Material fixed: {m.get("name")} -> roughness=0.9, metallic=0, no emissive')

new_json = json.dumps(g, separators=(',', ':')).encode('utf-8')
pad = (4 - len(new_json) % 4) % 4
new_json += b' ' * pad

new_jlen   = struct.pack('<I', len(new_json))
new_total  = 12 + 8 + len(new_json) + 8 + len(bindata)
new_length = struct.pack('<I', new_total)

with open('assets/models/kart.glb', 'wb') as f:
    f.write(magic)
    f.write(version)
    f.write(new_length)
    f.write(new_jlen)
    f.write(jtype)
    f.write(new_json)
    f.write(struct.pack('<I', len(bindata)))
    f.write(btype)
    f.write(bindata)

print('Done! kart.glb patched successfully.')
