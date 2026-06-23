// ─── Atmósfera ambiental ──────────────────────────────────────────────────────
// NOTA: archivo reconstruido tras pérdida de datos (el original no estaba en git
// ni en el bundle). Versión funcional: luciérnagas/partículas emisivas que flotan
// suavemente sobre el escenario para dar ambiente. Ajustable libremente.

import { engine, Transform, MeshRenderer, Material, Entity } from '@dcl/sdk/ecs'
import { Vector3, Color4, Color3 } from '@dcl/sdk/math'
import { WORLD_Y_OFFSET } from './spawnConfig'

type Firefly = { entity: Entity; baseX: number; baseZ: number; phase: number; ySwim: number }

const flies: Firefly[] = []
const COUNT = 40
// Zona aproximada donde flotan (sobre el área jugable principal)
const AREA = { x: -120, z: 60, spread: 220, y: 14 + WORLD_Y_OFFSET, yRange: 10 }

export function setupAtmosphere() {
  for (let i = 0; i < COUNT; i++) {
    const e = engine.addEntity()
    const bx = AREA.x + (Math.random() - 0.5) * AREA.spread
    const bz = AREA.z + (Math.random() - 0.5) * AREA.spread
    const by = AREA.y + Math.random() * AREA.yRange
    Transform.create(e, { position: Vector3.create(bx, by, bz), scale: Vector3.create(0.12, 0.12, 0.12) })
    MeshRenderer.setSphere(e)
    const warm = Math.random() > 0.5
    const col = warm ? Color3.create(1.0, 0.85, 0.4) : Color3.create(0.5, 0.9, 1.0)
    Material.setPbrMaterial(e, {
      albedoColor: Color4.create(col.r, col.g, col.b, 1),
      emissiveColor: col,
      emissiveIntensity: 3.0,
      roughness: 1
    })
    flies.push({ entity: e, baseX: bx, baseZ: bz, phase: Math.random() * Math.PI * 2, ySwim: by })
  }
  engine.addSystem(atmosphereSystem)
}

let t = 0
function atmosphereSystem(dt: number) {
  t += dt
  for (const f of flies) {
    const tr = Transform.getMutableOrNull(f.entity)
    if (!tr) continue
    // deriva suave en círculos lentos + bobbing vertical
    tr.position.x = f.baseX + Math.sin(t * 0.3 + f.phase) * 3.0
    tr.position.z = f.baseZ + Math.cos(t * 0.23 + f.phase) * 3.0
    tr.position.y = f.ySwim + Math.sin(t * 0.6 + f.phase) * 1.2
  }
}
