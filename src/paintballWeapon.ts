import { engine, Transform, GltfContainer, Entity } from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'

// ── Ajuste del modelo del blaster (relativo al anchor que sigue la cámara) ──────
// El GLB mide ~0.57m sobre el eje X (cañón en X) y su origen está en la base.
// Si queda mal orientado/posicionado/de tamaño, tocá SOLO estas 3 constantes.
const GUN_POS = Vector3.create(0, 0, 0.1)
const GUN_ROT = Quaternion.fromEulerDegrees(0, -90, 0)
const GUN_SCALE = Vector3.create(1.1, 1.1, 1.1)

let weaponParent: Entity | null = null
let holoSight: Entity | null = null
let recoilTimer = 0

let lastPlayerPos = Vector3.Zero()
let bobAccum = 0
let lastCamRot = Quaternion.Identity()
let swayX = 0
let swayY = 0

export function setupWeaponSystem() {
  engine.addSystem(weaponAnimationSystem)
}

export function createWeapon() {
  if (weaponParent) removeWeapon()

  weaponParent = engine.addEntity()
  Transform.create(weaponParent, {
    parent: engine.CameraEntity,
    position: Vector3.create(0.3, -0.4, 0.8),
    rotation: Quaternion.fromEulerDegrees(0, -5, 0),
    scale: Vector3.create(0.5, 0.5, 0.5)
  })

  // Modelo del blaster (reemplaza la pistola procedural). Orientación/escala en el hijo.
  const gun = engine.addEntity()
  Transform.create(gun, { parent: weaponParent, position: GUN_POS, rotation: GUN_ROT, scale: GUN_SCALE })
  GltfContainer.create(gun, { src: 'assets/models/blaster.glb' })

  holoSight = null // el modelo trae su propia mira
}

export function removeWeapon() {
  if (weaponParent) {
    engine.removeEntityWithChildren(weaponParent)
    weaponParent = null
  }
}

export function playWeaponRecoil() {
  recoilTimer = 0.15
}

function weaponAnimationSystem(dt: number) {
  if (!weaponParent) return

  const playerTransform = Transform.getOrNull(engine.PlayerEntity)
  if (!playerTransform) return

  const playerPos = playerTransform.position
  const movementDist = Vector3.distance(playerPos, lastPlayerPos)
  lastPlayerPos = Vector3.clone(playerPos)

  // Bobbing al caminar
  let isMoving = false
  if (movementDist > 0.01 && movementDist < 1.0) {
    isMoving = true
    bobAccum += dt * 10
  } else {
    const targetAccum = Math.round(bobAccum / (2 * Math.PI)) * (2 * Math.PI)
    bobAccum = bobAccum + (targetAccum - bobAccum) * dt * 5
  }
  const bobY = isMoving ? Math.sin(bobAccum * 2) * 0.015 : 0
  const bobX = isMoving ? Math.cos(bobAccum) * 0.02 : 0

  // Sway (inercia al mover la cámara)
  const cameraTransform = Transform.getOrNull(engine.CameraEntity)
  if (cameraTransform) {
    const camRot = cameraTransform.rotation
    const fwd = Vector3.rotate(Vector3.Forward(), camRot)
    const lastFwd = Vector3.rotate(Vector3.Forward(), lastCamRot)
    lastCamRot = Quaternion.create(camRot.x, camRot.y, camRot.z, camRot.w)
    const diffX = fwd.x - lastFwd.x
    const diffY = fwd.y - lastFwd.y
    const diffZ = fwd.z - lastFwd.z
    const totalDiff = Math.sqrt(diffX * diffX + diffY * diffY + diffZ * diffZ)
    if (totalDiff > 0.0005 && totalDiff < 0.5) {
      const right = Vector3.rotate(Vector3.Right(), camRot)
      const dotRight = Vector3.dot(right, Vector3.create(diffX, diffY, diffZ))
      swayX -= dotRight * 0.35
      swayY -= diffY * 0.35
    }
  }
  swayX = swayX + (0 - swayX) * dt * 6
  swayY = swayY + (0 - swayY) * dt * 6
  const maxSway = 0.04
  swayX = Math.max(-maxSway, Math.min(maxSway, swayX))
  swayY = Math.max(-maxSway, Math.min(maxSway, swayY))

  const t = Transform.getMutable(weaponParent)
  if (recoilTimer > 0) {
    recoilTimer -= dt
    t.position = Vector3.create(0.3 + bobX + swayX, -0.4 + 0.05 + bobY + swayY, 0.8 - 0.2)
    t.rotation = Quaternion.fromEulerDegrees(-10 + swayY * 70, -5 + swayX * 70, 0)
  } else {
    const targetPos = Vector3.create(0.3 + bobX + swayX, -0.4 + bobY + swayY, 0.8)
    const targetRot = Quaternion.fromEulerDegrees(swayY * 70, -5 + swayX * 70, 0)
    t.position = Vector3.lerp(t.position, targetPos, dt * 10)
    t.rotation = Quaternion.slerp(t.rotation, targetRot, dt * 10)
  }

  void holoSight
}
