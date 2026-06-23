import { engine, Transform, MeshRenderer, Material, Entity } from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { spawnImpactFX, spawnDecal } from './paintballFX'
import { playImpactAt } from './paintballAudio'

type ProjectileData = {
  entity: Entity
  blob: Entity | null
  from: Vector3
  to: Vector3
  timer: number
  targetPos: Vector3
  hitNormal: Vector3
  color: Color4
}

const projectiles: ProjectileData[] = []
const LASER_DURATION = 0.22

export function setupLasers() {
  engine.addSystem(projectileSystem)
}

// Trazo de pintura (tracer) grueso del color del tirador + "blob" hasta el impacto.
export function spawnLaser(from: Vector3, to: Vector3, color: Color4, normal?: Vector3) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dz = to.z - from.z
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (distance === 0) return

  const laserEntity = engine.addEntity()
  const midPos = Vector3.create(from.x + dx * 0.5, from.y + dy * 0.5, from.z + dz * 0.5)
  const directionRotation = Quaternion.fromLookAt(from, to)
  const cylinderRotation = Quaternion.multiply(directionRotation, Quaternion.fromEulerDegrees(90, 0, 0))
  const initialDiameter = 0.13
  Transform.create(laserEntity, {
    position: midPos,
    rotation: cylinderRotation,
    scale: Vector3.create(initialDiameter, distance, initialDiameter)
  })
  MeshRenderer.setCylinder(laserEntity)
  Material.setPbrMaterial(laserEntity, {
    albedoColor: Color4.create(1, 1, 1, 0.85),
    emissiveColor: color,
    emissiveIntensity: 7.0,
    transparencyMode: 2,
    roughness: 1.0,
    specularIntensity: 0
  })

  const blob = engine.addEntity()
  Transform.create(blob, { position: Vector3.clone(to), scale: Vector3.create(0.32, 0.32, 0.32) })
  MeshRenderer.setSphere(blob)
  Material.setPbrMaterial(blob, {
    albedoColor: color,
    emissiveColor: color,
    emissiveIntensity: 9.0,
    transparencyMode: 2,
    roughness: 1.0,
    specularIntensity: 0
  })

  projectiles.push({
    entity: laserEntity,
    blob,
    from: Vector3.clone(from),
    to: Vector3.clone(to),
    timer: LASER_DURATION,
    targetPos: Vector3.clone(to),
    hitNormal: normal ? Vector3.clone(normal) : Vector3.Zero(),
    color
  })
}

function projectileSystem(dt: number) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i]
    p.timer -= dt

    if (p.timer <= 0) {
      spawnImpactFX(p.targetPos, p.color)
      playImpactAt(p.targetPos)
      if (p.hitNormal && (p.hitNormal.x !== 0 || p.hitNormal.y !== 0 || p.hitNormal.z !== 0)) {
        spawnDecal(p.targetPos, p.hitNormal, p.color)
      }
      engine.removeEntity(p.entity)
      if (p.blob) engine.removeEntity(p.blob)
      projectiles.splice(i, 1)
      continue
    }

    const lifeRatio = p.timer / LASER_DURATION
    const t = Transform.getMutable(p.entity)
    const diameter = 0.13 * lifeRatio
    t.scale.x = diameter
    t.scale.z = diameter

    if (p.blob) {
      const bt = Transform.getMutable(p.blob)
      const grow = 0.32 + (1 - lifeRatio) * 0.18
      bt.scale.x = grow
      bt.scale.y = grow
      bt.scale.z = grow
    }
  }
}
