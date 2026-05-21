import struct, json, math

def read_glb(path):
    with open(path, 'rb') as f:
        f.read(4)   # magic
        f.read(4)   # version
        f.read(4)   # length
        json_len = struct.unpack('<I', f.read(4))[0]
        f.read(4)   # json_type
        json_data = json.loads(f.read(json_len).decode('utf-8'))
        return json_data

def mat4_multiply(a, b):
    result = [0]*16
    for row in range(4):
        for col in range(4):
            for k in range(4):
                result[row*4+col] += a[row*4+k] * b[k*4+col]
    return result

def mat4_identity():
    m = [0]*16
    m[0] = m[5] = m[10] = m[15] = 1.0
    return m

def trs_to_mat4(node):
    t = node.get('translation', [0,0,0])
    r = node.get('rotation', [0,0,1,0])  # x,y,z,w
    s = node.get('scale', [1,1,1])
    
    # rotation to matrix
    x,y,z,w = r
    rm = [
        1-2*(y*y+z*z), 2*(x*y-z*w),   2*(x*z+y*w),   0,
        2*(x*y+z*w),   1-2*(x*x+z*z), 2*(y*z-x*w),   0,
        2*(x*z-y*w),   2*(y*z+x*w),   1-2*(x*x+y*y), 0,
        0,             0,             0,             1
    ]
    # apply scale and translation
    m = list(rm)
    for i in range(3):
        m[i*4+0] *= s[0]
        m[i*4+1] *= s[1]
        m[i*4+2] *= s[2]
    m[12] = t[0]; m[13] = t[1]; m[14] = t[2]
    return m

gltf = read_glb('assets/models/track.glb')
nodes = gltf.get('nodes', [])

# Build parent lookup
parent_of = {}
for i, n in enumerate(nodes):
    for child in n.get('children', []):
        parent_of[child] = i

# Get world matrix for a node
def world_matrix(idx):
    chain = []
    cur = idx
    while cur is not None:
        chain.insert(0, cur)
        cur = parent_of.get(cur)
    m = mat4_identity()
    for ci in chain:
        local = trs_to_mat4(nodes[ci])
        m = mat4_multiply(m, local)
    return m

# Also check track offset in scene
TRACK_OFFSET_X = 472.0
TRACK_OFFSET_Y = 10.0
TRACK_OFFSET_Z = 248.0

print("=== CHECKPOINT / START / FINISH NODES ===")
for i, n in enumerate(nodes):
    name = n.get('name','')
    lo = name.lower()
    if any(kw in lo for kw in ['checkpoint','start','finish','largada','meta','salida']):
        m = world_matrix(i)
        lx, ly, lz = m[12], m[13], m[14]
        # World coords = track_offset + local_pos
        wx = TRACK_OFFSET_X + lx
        wy = TRACK_OFFSET_Y + ly
        wz = TRACK_OFFSET_Z + lz
        print(f"  {name}: local=({lx:.1f},{ly:.1f},{lz:.1f})  world=({wx:.1f},{wy:.1f},{wz:.1f})")

print()
print("=== ALL NODES (for reference) ===")
for i, n in enumerate(nodes):
    name = n.get('name','')
    t = n.get('translation', [0,0,0])
    if t != [0,0,0]:
        print(f"  [{i}] {name}: ({t[0]:.1f},{t[1]:.1f},{t[2]:.1f})")
