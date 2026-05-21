import struct, json

with open('assets/models/kart.glb', 'rb') as f:
    magic   = f.read(4)
    version = f.read(4)
    length  = f.read(4)
    jlen    = struct.unpack('<I', f.read(4))[0]
    jtype   = f.read(4)
    jdata   = f.read(jlen)
    rest    = f.read()

g = json.loads(jdata.decode('utf-8'))

fixed = 0
for m in g.get('materials', []):
    ef = m.get('emissiveFactor', [0,0,0])
    if ef != [0, 0, 0]:
        name = m.get('name', 'unknown')
        print('Fixing:', name, 'emissive', ef, '-> [0,0,0]')
        m['emissiveFactor'] = [0, 0, 0]
        fixed += 1

new_json = json.dumps(g, separators=(',', ':')).encode('utf-8')
pad = (4 - len(new_json) % 4) % 4
new_json += b' ' * pad

new_jlen   = struct.pack('<I', len(new_json))
new_total  = 12 + 8 + len(new_json) + len(rest)
new_length = struct.pack('<I', new_total)

with open('assets/models/kart.glb', 'wb') as f:
    f.write(magic)
    f.write(version)
    f.write(new_length)
    f.write(new_jlen)
    f.write(jtype)
    f.write(new_json)
    f.write(rest)

print('Fixed', fixed, 'materials. emissiveFactor patched to [0,0,0]')
