import json
import math
from collections import defaultdict

with open('scratch/detected_focos.json', 'r') as f:
    focos = json.load(f)

# Group by horizontal position (X, Z) with threshold 3.0m
horizontal_groups = []
threshold = 3.0

for f in focos:
    placed = False
    for g in horizontal_groups:
        gx = g['sum_x'] / g['count']
        gz = g['sum_z'] / g['count']
        dist = math.sqrt((f[0] - gx)**2 + (f[2] - gz)**2)
        if dist < threshold:
            g['sum_x'] += f[0]
            g['sum_z'] += f[2]
            g['y_values'].append(f[1])
            g['count'] += 1
            placed = True
            break
    if not placed:
        horizontal_groups.append({
            'sum_x': f[0],
            'sum_z': f[2],
            'y_values': [f[1]],
            'count': 1
        })

print(f"Total unique horizontal locations: {len(horizontal_groups)}")
print("First 30 horizontal locations and their Y values:")
for idx, g in enumerate(horizontal_groups[:30]):
    hx = g['sum_x'] / g['count']
    hz = g['sum_z'] / g['count']
    print(f"  Loc {idx+1:2d}: [{hx:.2f}, {hz:.2f}] | Y values: {[round(y,2) for y in g['y_values']]}")
