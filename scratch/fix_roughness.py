import struct, json, glob, os

# Buscar todos los karts en assets/models
files = glob.glob('assets/models/kart*.glb')

for filepath in files:
    filename = os.path.basename(filepath)
    # Ignorar archivos de backup o de prueba
    if filename.startswith('kart_'):
        continue
        
    print(f'Procesando {filepath}...')
    try:
        with open(filepath, 'rb') as f:
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

        fixed = False
        for m in g.get('materials', []):
            pbr = m.get('pbrMetallicRoughness', {})
            # Quitar la textura de rugosidad metálica defectuosa que causa que se vea blanco/espejado
            if 'metallicRoughnessTexture' in pbr:
                print(f'  Eliminando textura defectuosa en material {m.get("name")}')
                del pbr['metallicRoughnessTexture']
                fixed = True
            
            # Forzar una rugosidad alta (mate) y nada metálico para que se vean bien
            if pbr.get('roughnessFactor') != 0.9 or pbr.get('metallicFactor') != 0.0:
                pbr['roughnessFactor'] = 0.9
                pbr['metallicFactor']  = 0.0
                fixed = True
                
            # Limpiar factor emissive si existe (evita brillo fantasmal blanco)
            if m.get('emissiveFactor') != [0, 0, 0]:
                m['emissiveFactor'] = [0, 0, 0]
                fixed = True
                
        if fixed:
            new_json = json.dumps(g, separators=(',', ':')).encode('utf-8')
            pad = (4 - len(new_json) % 4) % 4
            new_json += b' ' * pad

            new_jlen   = struct.pack('<I', len(new_json))
            new_total  = 12 + 8 + len(new_json) + 8 + len(bindata)
            new_length = struct.pack('<I', new_total)

            with open(filepath, 'wb') as f:
                f.write(magic)
                f.write(version)
                f.write(new_length)
                f.write(new_jlen)
                f.write(jtype)
                f.write(new_json)
                f.write(struct.pack('<I', len(bindata)))
                f.write(btype)
                f.write(bindata)
            print(f'  ¡Completado! {filename} parchado con éxito.')
        else:
            print(f'  No se requirieron cambios en {filename}.')
            
    except Exception as e:
        print(f'  Error procesando {filename}: {e}')

print('Proceso finalizado.')
