import { engine, Transform, MeshRenderer, Material, Billboard, Entity } from '@dcl/sdk/ecs'
import { Vector3, Quaternion, Color4 } from '@dcl/sdk/math'
import { ArenaCalibration } from './paintballArena'

type ParticleData = {
  entity: Entity
  velocity: Vector3
  spin: number
  timer: number
  maxTimer: number
  startScale: number
}

type DecalData = {
  entity: Entity
  timer: number
  maxTimer: number
  startScale: number
}

const particles: ParticleData[] = []
const decals: DecalData[] = []
const MAX_DECALS = 26 // cada decal ahora tiene 7-10 gotas → bajamos el cap por performance

export function setupPaintballFX() {
  engine.addSystem(particleSystem)
  engine.addSystem(decalSystem)
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function paintBillboard(pos: Vector3, color: Color4, scale: number, sharp = false): Entity {
  const e = engine.addEntity()
  Transform.create(e, { position: Vector3.clone(pos), scale: Vector3.create(scale, scale, scale) })
  MeshRenderer.setPlane(e)
  Billboard.create(e)
  const tex = sharp ? 'assets/textures/glow_sharp.png' : 'assets/textures/glow_soft.png'
  Material.setPbrMaterial(e, {
    texture: Material.Texture.Common({ src: tex }),
    emissiveTexture: Material.Texture.Common({ src: tex }),
    emissiveColor: color,
    emissiveIntensity: 7.0,
    transparencyMode: 2,
    roughness: 1.0,
    specularIntensity: 0
  })
  return e
}

// ── Explosión de pintura al eliminar un bot ────────────────────────────────────
export function spawnBotExplosion(pos: Vector3, color: Color4) {
  const center = Vector3.create(pos.x, pos.y + 1.0, pos.z)

  // Núcleo brillante (flash grande instantáneo)
  const core = paintBillboard(center, color, 2.4, true)
  particles.push({ entity: core, velocity: Vector3.Zero(), spin: 0, timer: 0, maxTimer: 0.18, startScale: 2.4 })

  // Salpicaduras de pintura disparadas en todas direcciones
  const particleCount = 34
  for (let i = 0; i < particleCount; i++) {
    // Mezcla del color de la víctima con destellos blancos para volumen
    const tint = Math.random() < 0.25
      ? Color4.create(1, 1, 1, 1)
      : Color4.create(color.r, color.g, color.b, 1)

    const big = Math.random() < 0.3
    const scale = big ? 0.45 + Math.random() * 0.35 : 0.18 + Math.random() * 0.18
    const p = paintBillboard(center, tint, scale)

    const ang = Math.random() * Math.PI * 2
    const speed = big ? 4 + Math.random() * 6 : 8 + Math.random() * 10
    particles.push({
      entity: p,
      velocity: Vector3.create(Math.cos(ang) * speed, Math.random() * 9 + 4, Math.sin(ang) * speed),
      spin: 0,
      timer: 0,
      maxTimer: (big ? 1.2 : 0.7) + Math.random() * 0.5,
      startScale: scale
    })
  }
}

// ── Chispas/salpicadura de pintura en el punto de impacto (instantáneo) ─────────
export function spawnImpactFX(pos: Vector3, color: Color4) {
  // Flash central gordo al momento del impacto (la pintura "revienta")
  const flash = paintBillboard(pos, color, 0.9, true)
  particles.push({ entity: flash, velocity: Vector3.Zero(), spin: 0, timer: 0, maxTimer: 0.14, startScale: 0.9 })

  const particleCount = 16
  for (let i = 0; i < particleCount; i++) {
    const big = Math.random() < 0.35
    const scale = big ? 0.28 + Math.random() * 0.22 : 0.12 + Math.random() * 0.16
    const p = paintBillboard(pos, color, scale)
    const ang = Math.random() * Math.PI * 2
    const speed = 4 + Math.random() * 8
    particles.push({
      entity: p,
      velocity: Vector3.create(Math.cos(ang) * speed, Math.random() * 6 + 2, Math.sin(ang) * speed),
      spin: 0,
      timer: 0,
      maxTimer: 0.45 + Math.random() * 0.4,
      startScale: scale
    })
  }
}

// ── Destello del cañón (muzzle flash) anclado al arma ──────────────────────────
export function spawnMuzzleFlash(parent: Entity, color: Color4, isBot = false) {
  const flash = engine.addEntity()
  const localPos = isBot ? Vector3.create(0, 1.6, 0.8) : Vector3.create(0.3, -0.3, 1.2)
  Transform.create(flash, { parent, position: localPos, scale: Vector3.create(0.45, 0.45, 0.45) })
  MeshRenderer.setPlane(flash)
  Billboard.create(flash)
  Material.setPbrMaterial(flash, {
    texture: Material.Texture.Common({ src: 'assets/textures/glow_sharp.png' }),
    emissiveTexture: Material.Texture.Common({ src: 'assets/textures/glow_sharp.png' }),
    emissiveColor: color,
    emissiveIntensity: 14.0,
    transparencyMode: 2,
    roughness: 1.0,
    specularIntensity: 0
  })
  particles.push({ entity: flash, velocity: Vector3.Zero(), spin: 0, timer: 0, maxTimer: 0.06, startScale: 0.45 })
}

// ── Salpicadura de pintura (decal cluster) sobre pared/suelo ────────────────────
export function spawnDecal(pos: Vector3, normal: Vector3, color: Color4) {
  if (decals.length >= MAX_DECALS) {
    const oldest = decals.shift()
    if (oldest) engine.removeEntityWithChildren(oldest.entity)
  }

  // Tangentes sobre la superficie para distribuir las gotas del splatter
  const n = Vector3.normalize(normal)
  const ref = Math.abs(n.y) > 0.9 ? Vector3.Right() : Vector3.Up()
  const tan1 = Vector3.normalize(Vector3.cross(n, ref))
  const tan2 = Vector3.normalize(Vector3.cross(n, tan1))

  const base = Vector3.create(pos.x + n.x * 0.02, pos.y + n.y * 0.02, pos.z + n.z * 0.02)
  const rot = Quaternion.fromLookAt(Vector3.Zero(), n)

  // Parent del cluster (la mancha principal + gotas satélite)
  const parent = engine.addEntity()
  Transform.create(parent, { position: base, rotation: rot })

  // Mancha grande y exagerada: blob central gordo + bastantes gotas satélite que
  // salpican lejos, como pintura reventando contra la superficie.
  const blobCount = 7 + Math.floor(Math.random() * 4) // 7..10
  const startScale = 1.15 + Math.random() * 0.7        // mancha central grande
  for (let i = 0; i < blobCount; i++) {
    const blob = engine.addEntity()
    // Distribuir en el plano de la superficie (coordenadas locales del parent)
    const isMain = i === 0
    const spread = isMain ? 0 : 0.4 + Math.random() * 0.9 // gotas más esparcidas
    const a = Math.random() * Math.PI * 2
    const localX = Math.cos(a) * spread
    const localY = Math.sin(a) * spread
    const s = isMain ? startScale : startScale * (0.22 + Math.random() * 0.5)
    Transform.create(blob, {
      parent,
      position: Vector3.create(localX, localY, 0.001 * i),
      rotation: Quaternion.fromEulerDegrees(0, 0, Math.random() * 360),
      scale: Vector3.create(s, s, s)
    })
    MeshRenderer.setPlane(blob)
    const tex = Math.random() > 0.5 ? 'assets/textures/glow_mist.png' : 'assets/textures/glow_soft.png'
    Material.setPbrMaterial(blob, {
      texture: Material.Texture.Common({ src: tex }),
      emissiveTexture: Material.Texture.Common({ src: tex }),
      emissiveColor: color,
      emissiveIntensity: 4.5, // más vívido/brillante (pintura neón)
      transparencyMode: 2,
      roughness: 1.0,
      specularIntensity: 0
    })
  }

  // Evitar warning de variable sin usar (tangentes ya aplicadas vía rot)
  void tan1
  void tan2

  decals.push({ entity: parent, timer: 7.0, maxTimer: 7.0, startScale: 1 })
}

function particleSystem(dt: number) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.timer += dt

    if (p.timer >= p.maxTimer) {
      engine.removeEntity(p.entity)
      particles.splice(i, 1)
      continue
    }

    const t = Transform.getMutable(p.entity)
    const hasParent = Transform.get(p.entity).parent !== undefined

    if (!hasParent) {
      // Gravedad + movimiento
      p.velocity = Vector3.create(p.velocity.x, p.velocity.y - 20 * dt, p.velocity.z)
      t.position.x += p.velocity.x * dt
      t.position.y += p.velocity.y * dt
      t.position.z += p.velocity.z * dt

      // Rebote simple en el piso (altura calibrada del arena en runtime)
      const floorY = ArenaCalibration.floorY
      if (t.position.y < floorY) {
        t.position.y = floorY
        p.velocity = Vector3.create(p.velocity.x * 0.8, Math.abs(p.velocity.y) * 0.5, p.velocity.z * 0.8)
      }
    }

    // Achicar con el tiempo
    const lifeRatio = 1.0 - p.timer / p.maxTimer
    const scale = p.startScale * lifeRatio
    t.scale = Vector3.create(scale, scale, scale)
  }
}

function decalSystem(dt: number) {
  for (let i = decals.length - 1; i >= 0; i--) {
    const d = decals[i]
    d.timer -= dt

    if (d.timer <= 0) {
      engine.removeEntityWithChildren(d.entity)
      decals.splice(i, 1)
      continue
    }

    // Encoger lentamente en el último segundo (sobre el parent del cluster)
    if (d.timer < 1.0) {
      const t = Transform.getMutable(d.entity)
      t.scale = Vector3.create(d.timer, d.timer, d.timer)
    }
  }
}
