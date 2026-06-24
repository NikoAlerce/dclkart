import json, struct, io

def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, ver, length = struct.unpack('<4sII', data[:12])
    assert magic == b'glTF', 'no es GLB'
    off = 12
    jchunk = None
    bchunk = None
    while off < length:
        clen, ctype = struct.unpack('<II', data[off:off+8])
        cdata = data[off+8:off+8+clen]
        if ctype == 0x4E4F534A: # JSON
            jchunk = cdata
        elif ctype == 0x004E4942: # BIN
            bchunk = cdata
        off += 8 + clen
    return json.loads(jchunk.decode('utf-8')), bchunk

gltf, bin = read_glb('assets/models/track.glb')
nodes = gltf.get('nodes', [])
meshes = gltf.get('meshes', [])

print(f"Total nodes: {len(nodes)}")
print(f"Total meshes: {len(meshes)}")

# Print nodes with names containing "paint", "dust", "arena", "cs", or similar
matching_nodes = []
for idx, node in enumerate(nodes):
    name = node.get('name', '')
    if any(k in name.lower() for k in ['paint', 'dust', 'arena', 'cs', 'spawn', 'referee']):
        matching_nodes.append((idx, name, node.get('translation'), node.get('mesh')))

print("\nMatching nodes:")
for idx, name, trans, mesh_idx in matching_nodes:
    mesh_name = meshes[mesh_idx].get('name', '') if mesh_idx is not None else 'None'
    print(f"Node {idx}: '{name}' | Translation: {trans} | Mesh: {mesh_idx} ('{mesh_name}')")
