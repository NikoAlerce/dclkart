import json

with open('scratch/detected_focos.json', 'r') as f:
    focos = json.load(f)

# Write to src/lightsConfig.ts
with open('src/lightsConfig.ts', 'w') as f_out:
    f_out.write("// Auto-generated streetlight (focos) coordinates\n")
    f_out.write("import { Vector3 } from '@dcl/sdk/math'\n\n")
    f_out.write("export const FOCO_POSITIONS: { x: number, y: number, z: number }[] = [\n")
    for idx, f in enumerate(focos):
        f_out.write(f"  {{ x: {f[0]:.2f}, y: {f[1]:.2f}, z: {f[2]:.2f} }},\n")
    f_out.write("]\n")

print(f"Generated src/lightsConfig.ts with {len(focos)} focos positions.")
