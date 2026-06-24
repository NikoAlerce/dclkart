import {
  engine, Transform,
  inputSystem, InputAction, PointerEventType,
  InputModifier, AvatarModifierArea,
  RaycastResult, MainCamera,
  ParticleSystem, LightSource,
  pointerEventsSystem, MeshCollider, ColliderLayer,
  PlayerIdentityData,
  Material, MeshRenderer
} from '@dcl/sdk/ecs'
import { KartData, KartOwner, TurboParticle } from './components'
import { Quaternion, Vector3, Color3, Color4 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { kartColliderMap } from './kart'
import { getMyOwnerId } from './net'
import { PHYS_SCALE_CAP } from './kartConfig'
import { InputState } from './inputState'
import { RaceState } from './raceState'

// ─── Estado de módulo ─────────────────────────────────────────────────────────
let lastKnownGroundY  = 8.6
let lastKnownGroundNormal = Vector3.Up()
let currentGroundNormal = Vector3.Up()
let coyoteFrames      = 0
const COYOTE_TIME     = 6
let turboParticleTimer = 0
let currentYaw = 0
let wasOccupiedLastFrame = false

function spawnTurboParticle(
  transform: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; w: number } },
  scaleMult: number,
  currentSpeed: number
) {
  const fwdVec = Vector3.rotate(Vector3.Forward(), transform.rotation)
  const backVec = Vector3.scale(fwdVec, -1)
  
  // Posicionar partículas con una variación aleatoria detrás de los caños de escape
  const exhaustOffset = Vector3.create(
    (Math.random() - 0.5) * 0.3 * scaleMult,
    0.2 * scaleMult,
    -1.1 * scaleMult
  )
  const exhaustWorldPos = Vector3.add(
    transform.position,
    Vector3.rotate(exhaustOffset, transform.rotation)
  )
  
  const p = engine.addEntity()
  Transform.create(p, {
    position: exhaustWorldPos,
    scale: Vector3.create(0.15, 0.15, 0.15)
  })
  MeshRenderer.setSphere(p)
  
  const isRed = Math.random() > 0.45
  const fireColor = isRed ? Color4.create(1, 0.25, 0, 1) : Color4.create(1, 0.75, 0, 1)
  const fireEmissive = isRed ? Color3.create(2.5, 0.5, 0) : Color3.create(2.5, 1.8, 0)
  
  Material.setPbrMaterial(p, {
    albedoColor: fireColor,
    emissiveColor: fireEmissive,
    emissiveIntensity: 6.0,
    roughness: 1.0
  })
  
  // La velocidad de las partículas hereda la velocidad del kart + empuje hacia atrás
  const exhaustSpeed = 4.0 + Math.random() * 4.0
  const pVelocity = Vector3.create(
    fwdVec.x * (currentSpeed - exhaustSpeed) + (Math.random() - 0.5) * 1.5,
    fwdVec.y * (currentSpeed - exhaustSpeed) + (Math.random() - 0.5) * 0.5,
    fwdVec.z * (currentSpeed - exhaustSpeed) + (Math.random() - 0.5) * 1.5
  )
  
  TurboParticle.create(p, {
    velocity: pVelocity,
    lifeTime: 0,
    maxLife: 0.35 + Math.random() * 0.15
  })
}

// Steering con inercia: el volante no pasa de 0 a 1 en un solo frame
// Simula el "peso" del volante y elimina el giro brusco
let currentSteering   = 0

// Overdrive de recta: se acumula yendo derecho a fondo cerca del tope y sube un
// poco la velocidad final. Se desarma rápido al doblar o soltar el acelerador.
let straightOverdrive = 0

// ── Derrape real (grip lateral) ───────────────────────────────────────────────
// velX/velZ es el vector de velocidad REAL del auto en el mundo (XZ). El auto
// apunta hacia su rumbo (currentYaw) pero se MUEVE según este vector: la diferencia
// es el slip angle. El grip lateral decide cuánto del momentum de costado persiste
// (poco grip en drift = derrapa; mucho grip normal = agarra y va donde apunta).
let velX = 0
let velZ = 0
// Patada inicial: al iniciar el drift el tren trasero se suelta de golpe (un frame).
let driftKick = 0

// Spring-damper para el lean visual del modelo
let leanAngle         = 0    // grados actuales de inclinación
let leanVelocity      = 0    // velocidad de la inclinación (grados/s)
const LEAN_STIFFNESS  = 180
const LEAN_DAMPING    = 14
const MAX_DRIFT_LEAN  = 14   // grados máximos en drift
const MAX_TURN_LEAN   = 6    // grados máximos en giro normal

// Spring-damper para el yaw visual en drift (Slip Angle)
let slipAngle         = 0
let slipVelocity      = 0
const SLIP_STIFFNESS  = 120  // Resortes rígidos para girar rápido visualmente
const SLIP_DAMPING    = 10
const MAX_DRIFT_SLIP  = 45   // grados de cruce visual extra (el derrape físico ya aporta el resto)

// Cooldown del rebote contra paredes
let bounceCooldown    = 0
const BOUNCE_COOLDOWN = 0.5

// Checkpoint timer
let checkpointTimer   = 0

// Avatar sync timer: cada ~0.4s teletransportamos el avatar oculto a la posición del kart
// para que el minimapa nativo de DCL lo siga
let avatarSyncTimer   = 0
const AVATAR_SYNC_INTERVAL = 0.4

// Respawn: si el kart cae por debajo de esta Y, teleport al último checkpoint
const RESPAWN_Y       = 3.0
// ─────────────────────────────────────────────────────────────────────────────


// ── Helpers ──────────────────────────────────────────────────────────────────

/** Interpolación lineal de Vector3 (implementada manualmente por compatibilidad SDK7) */
function lerpV3(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  t: number
) {
  return Vector3.create(
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t,
    a.z + (b.z - a.z) * t
  )
}

/**
 * Calcula el quaternión de rotación para que una cámara en `from` mire hacia `to`.
 * Convención DCL: +Z = adelante, rotación X positiva = mirar hacia ABAJO.
 */
function computeLookAt(
  from: { x: number; y: number; z: number },
  to:   { x: number; y: number; z: number }
) {
  const dx    = to.x - from.x
  const dy    = to.y - from.y
  const dz    = to.z - from.z
  const hDist = Math.sqrt(dx * dx + dz * dz)
  // -dy: si el target está ABAJO (dy < 0), pitchDeg > 0 → mirando hacia abajo ✓
  const pitchDeg = Math.atan2(-dy, hDist) * (180 / Math.PI)
  const yawDeg   = Math.atan2(dx, dz)    * (180 / Math.PI)
  return Quaternion.fromEulerDegrees(pitchDeg, yawDeg, 0)
}

/**
 * Normalized lerp de quaterniones.
 * Aproximación rápida de slerp, precisa para ángulos pequeños (dt * factor ≈ 0.05-0.15).
 */
function nlerp(
  a: { x: number; y: number; z: number; w: number },
  b: { x: number; y: number; z: number; w: number },
  t: number
) {
  // Asegurar que interpolamos por el camino más corto
  const dot = a.x*b.x + a.y*b.y + a.z*b.z + a.w*b.w
  const bx  = dot < 0 ? -b.x : b.x
  const by  = dot < 0 ? -b.y : b.y
  const bz  = dot < 0 ? -b.z : b.z
  const bw  = dot < 0 ? -b.w : b.w
  const x   = a.x + (bx - a.x) * t
  const y   = a.y + (by - a.y) * t
  const z   = a.z + (bz - a.z) * t
  const w   = a.w + (bw - a.w) * t
  const len = Math.sqrt(x*x + y*y + z*z + w*w) || 1
  return Quaternion.create(x/len, y/len, z/len, w/len)
}
// ─────────────────────────────────────────────────────────────────────────────


export function kartMovementSystem(dt: number) {

  // ── Inputs ────────────────────────────────────────────────────────────────
  InputState.tick++
  InputState.forward     = inputSystem.isPressed(InputAction.IA_FORWARD)
  InputState.backward    = inputSystem.isPressed(InputAction.IA_BACKWARD)
  InputState.left        = inputSystem.isPressed(InputAction.IA_LEFT)
  InputState.right       = inputSystem.isPressed(InputAction.IA_RIGHT)
  InputState.drift       = inputSystem.isPressed(InputAction.IA_JUMP)
  InputState.thrustUp    = inputSystem.isPressed(InputAction.IA_PRIMARY)    // E
  InputState.thrustDown  = inputSystem.isPressed(InputAction.IA_SECONDARY)  // F
  InputState.turbo       = inputSystem.isPressed(InputAction.IA_MODIFIER)   // Shift

  // ── Inercia del volante ───────────────────────────────────────────────────
  // rawSteering: señal binaria ±1 del input real
  // currentSteering: interpolado suavemente hacia rawSteering
  // Simula el peso/inercia de las ruedas: elimina el giro brusco frame-a-frame
  const rawSteering   = InputState.right ? 1 : InputState.left ? -1 : 0
  currentSteering    += (rawSteering - currentSteering) * Math.min(1, dt * 2.0)
  // ─────────────────────────────────────────────────────────────────────────

  for (const [entity, kartData] of engine.getEntitiesWith(KartData, Transform)) {
    if (!kartData.isOccupied) continue

    const mutableKart = KartData.getMutable(entity)
    const transform   = Transform.getMutable(entity)
    const scaleMult   = mutableKart.scale || 1.0
    const physScale   = Math.min(scaleMult, PHYS_SCALE_CAP)  // factor para rampas de velocidad (topeado)

    // ── 0.5 POSICIONAR SENSOR DE PISO DINÁMICAMENTE (Compensar lag de Raycast) ──
    if (mutableKart.floorSensorEntity) {
      const sensorT = Transform.getMutableOrNull(mutableKart.floorSensorEntity as any)
      if (sensorT) {
        // Adelantar el sensor según la velocidad actual del kart para compensar la latencia de 1 frame.
        // Limitamos la compensación para evitar valores excesivos durante picos de lag.
        const speedComp = Math.max(0, mutableKart.currentSpeed) * dt
        const maxComp = 3.0 * scaleMult
        const forwardLook = 0.5 * scaleMult + Math.min(speedComp, maxComp)
        sensorT.position = Vector3.create(0, 1.5 * scaleMult, forwardLook)
      }
    }

    // ── 0. SALIR ──────────────────────────────────────────────────────────
    const isShip = mutableKart.vehicleType === 'ship'
    const exitKart = !isShip && inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)
    const exitShip = isShip && inputSystem.isTriggered(InputAction.IA_JUMP, PointerEventType.PET_DOWN)

    // PROPIEDAD PERDIDA: si dos jugadores reclamaron el mismo kart a la vez, syncEntity
    // converge KartOwner.ownerId a UNO solo. El que quedó manejando localmente pero cuyo
    // ownerId sincronizado ya NO es el suyo, se baja solo → evita dos conductores y el glitch.
    const owner = KartOwner.getOrNull(entity)
    const lostOwnership = owner != null && owner.ownerId !== '' && owner.ownerId !== getMyOwnerId()

    if (exitKart || exitShip || lostOwnership) {
      mutableKart.isOccupied    = false
      mutableKart.currentSpeed  = 0
      mutableKart.isDrifting    = false
      mutableKart.driftTime     = 0
      mutableKart.boostTime     = 0
      coyoteFrames              = 0
      RaceState.isOccupied      = false
      leanAngle                 = 0
      leanVelocity              = 0
      checkpointTimer           = 0
      bounceCooldown            = 0
      currentSteering           = 0
      straightOverdrive         = 0
      velX = 0; velZ = 0; driftKick = 0
      wasOccupiedLastFrame      = false

      InputModifier.deleteFrom(engine.PlayerEntity)
      AvatarModifierArea.deleteFrom(entity)

      // Liberar el kart en la red (todos lo ven libre) — SOLO en salida voluntaria.
      // Si salgo por propiedad perdida, el kart es del OTRO jugador: NO tocar su ownerId
      // (resetearlo a '' se lo robaría y dejaría el auto "libre" mientras él lo maneja).
      if (!lostOwnership) {
        const ownerComp = KartOwner.getMutableOrNull(entity)
        if (ownerComp) ownerComp.ownerId = ''
      }

      // Restaurar la caja de FÍSICA del kart (otros karts rebotan). El clic para subirse
      // vive en una entidad CL_POINTER aparte (kartClicker) que nunca se borra, así que
      // no hay que restaurarla acá.
      const colliderEnt = kartColliderMap.get(entity)
      if (colliderEnt !== undefined) {
        MeshCollider.setBox(colliderEnt as any, ColliderLayer.CL_PHYSICS)
      }


      if (mutableKart.floorSensorEntity) {
        engine.removeEntity(mutableKart.floorSensorEntity as any)
        mutableKart.floorSensorEntity = undefined
      }
      if (mutableKart.wallSensorEntity) {
        engine.removeEntity(mutableKart.wallSensorEntity as any)
        mutableKart.wallSensorEntity = undefined
      }
      if (mutableKart.wallSensorLeftEntity) {
        engine.removeEntity(mutableKart.wallSensorLeftEntity as any)
        mutableKart.wallSensorLeftEntity = undefined
      }
      if (mutableKart.wallSensorRightEntity) {
        engine.removeEntity(mutableKart.wallSensorRightEntity as any)
        mutableKart.wallSensorRightEntity = undefined
      }
      if (mutableKart.sparkEntity) {
        engine.removeEntity(mutableKart.sparkEntity as any)
        mutableKart.sparkEntity = undefined
      }
      if (mutableKart.pilotEntity) {
        engine.removeEntity(mutableKart.pilotEntity as any)
        mutableKart.pilotEntity = undefined
      }
      if (mutableKart.cameraPivotEntity) {
        engine.removeEntity(mutableKart.cameraPivotEntity as any)
        mutableKart.cameraPivotEntity = undefined
      }
      if (mutableKart.hideAreaEntity) {
        engine.removeEntity(mutableKart.hideAreaEntity as any)
        mutableKart.hideAreaEntity = undefined
      }
      const camComp = MainCamera.getMutableOrNull(engine.CameraEntity)
      if (camComp) camComp.virtualCameraEntity = undefined

      // ── SALIDA PULIDA ───────────────────────────────────────────────────
      // Distancia lateral escalada con el tamaño del kart para no quedar encima.
      // El collider mide 1.5·scale de ancho → medio ancho = 0.75·scale; le sumamos
      // margen para el avatar. Karts grandes te sueltan más lejos automáticamente.
      const rightVec = Vector3.rotate(Vector3.Right(),   transform.rotation)
      const fwdVec   = Vector3.rotate(Vector3.Forward(), transform.rotation)
      const sideDist = 1.1 * scaleMult + 1.3
      const exitPos  = Vector3.add(transform.position, Vector3.scale(rightVec, sideDist))
      // Nave: te bajás A LA ALTURA donde está volando (caés en el lugar). Kart: a ras del piso.
      // Antes la nave usaba lastKnownGroundY, que volando alto queda obsoleto/bajo → el rescate
      // (Y<2) te mandaba al spawn.
      exitPos.y = isShip ? transform.position.y : lastKnownGroundY + 0.1
      
      const playerT = Transform.getMutableOrNull(engine.PlayerEntity)
      if (playerT) playerT.parent = undefined
      
      // Cámara mirando hacia ADELANTE (rumbo del kart), no de vuelta al kart:
      // evita el latigazo al recuperar la vista del avatar. Salida natural.
      const exitCamTarget = Vector3.create(
        exitPos.x + fwdVec.x * 5,
        exitPos.y + 1.6,
        exitPos.z + fwdVec.z * 5
      )
      movePlayerTo({ newRelativePosition: exitPos, cameraTarget: exitCamTarget }).catch(() => {})
      continue
    }



    // ── RESPAWN ───────────────────────────────────────────────────────────
    if (transform.position.y < RESPAWN_Y) {
      transform.position.x     = mutableKart.lastSafeX
      transform.position.y     = mutableKart.lastSafeY + 0.8
      transform.position.z     = mutableKart.lastSafeZ
      transform.rotation       = Quaternion.fromEulerDegrees(0, mutableKart.lastSafeRotY, 0)
      mutableKart.currentSpeed = 0
      mutableKart.isDrifting   = false
      leanAngle                = 0
      leanVelocity             = 0
      currentSteering          = 0
      coyoteFrames             = 0
      velX = 0; velZ = 0; driftKick = 0
      lastKnownGroundY         = mutableKart.lastSafeY
      continue
    }

    // ── MODO NAVE ─────────────────────────────────────────────────────────
    // Las naves ignoran la gravedad, no usan sensores de piso/pared, y
    // pueden moverse libremente en los 3 ejes con R (subir) y F (bajar).
    if (mutableKart.vehicleType === 'ship') {
      const scaleMult = mutableKart.scale || 1.0
      const physScale = Math.min(scaleMult, PHYS_SCALE_CAP)  // factor para rampas/empuje (topeado)
      const sf = Math.abs(mutableKart.currentSpeed) / mutableKart.maxSpeed

      // Leer el sensor de piso para saber la altura real del terreno
      if (mutableKart.floorSensorEntity) {
        const floorResult = RaycastResult.getOrNull(mutableKart.floorSensorEntity as any)
        if (floorResult && floorResult.hits.length > 0) {
          const validHits = floorResult.hits.filter(h =>
            h.entityId !== engine.PlayerEntity &&
            !PlayerIdentityData.has(h.entityId as any) &&
            h.entityId !== entity &&
            h.position != null
          )
          if (validHits.length > 0) {
            validHits.sort((a, b) => (a.length ?? Infinity) - (b.length ?? Infinity))
            const closest = validHits[0]
            if (closest.position) lastKnownGroundY = closest.position.y
          }
        }
      }

      // ── Velocidad horizontal (W/S) con inercia ─────────────────────────
      const isTurboActive = InputState.turbo && InputState.forward
      const speedRatio   = Math.abs(mutableKart.currentSpeed) / mutableKart.maxSpeed
      let dynamicAccel = mutableKart.acceleration * (1.0 - speedRatio * 0.45)

      if (isTurboActive) {
        dynamicAccel *= 1.8
      }

      if (InputState.forward) {
        mutableKart.currentSpeed += dynamicAccel * dt
      } else if (InputState.backward) {
        mutableKart.currentSpeed -= mutableKart.acceleration * 1.2 * dt
      } else {
        // Fricción baja = la nave desliza, no frena bruscamente
        mutableKart.currentSpeed *= (1 - mutableKart.friction * dt)
      }

      // Boost post-drift también aplica en naves (rampa escalada por tamaño)
      if (mutableKart.boostTime > 0) {
        mutableKart.boostTime -= dt
        const boostCap = mutableKart.maxSpeed * 1.55
        mutableKart.currentSpeed = Math.min(mutableKart.currentSpeed + 55 * physScale * dt, boostCap)
      }

      // Si el turbo está activo y no hay boost de drift, aceleramos hacia el turboCap
      if (isTurboActive && mutableKart.boostTime <= 0) {
        const turboCap = mutableKart.maxSpeed * 2.1
        mutableKart.currentSpeed = Math.min(mutableKart.currentSpeed + 90 * physScale * dt, turboCap)
      }

      const currentMaxCap = mutableKart.boostTime > 0
        ? mutableKart.maxSpeed * 1.65
        : (isTurboActive ? mutableKart.maxSpeed * 2.1 : mutableKart.maxSpeed)

      const MAX_REVERSE = -(mutableKart.maxSpeed * 0.3)
      if (mutableKart.currentSpeed > currentMaxCap)    mutableKart.currentSpeed = currentMaxCap
      if (mutableKart.currentSpeed < MAX_REVERSE) mutableKart.currentSpeed = MAX_REVERSE
      if (Math.abs(mutableKart.currentSpeed) < 0.05) mutableKart.currentSpeed = 0

      // ── Giro (A/D) — igual que kart, eje Y ────────────────────────────
      if (mutableKart.currentSpeed !== 0 && Math.abs(currentSteering) > 0.02) {
        const sfTurn  = Math.abs(mutableKart.currentSpeed) / mutableKart.maxSpeed
        const dynTurn = mutableKart.turnSpeed * (1.8 - sfTurn * 0.3)
        const revMod  = mutableKart.currentSpeed < 0 ? -1 : 1
        const rotDelta = Quaternion.fromEulerDegrees(0, currentSteering * dynTurn * revMod * dt, 0)
        transform.rotation = Quaternion.multiply(transform.rotation, rotDelta)
      }

      // Normalizar al eje Y (evita pitch/roll acumulado)
      const qShip = transform.rotation
      const yawShip = Math.atan2(2 * (qShip.w * qShip.y + qShip.x * qShip.z), 1 - 2 * (qShip.y * qShip.y + qShip.z * qShip.z))
      transform.rotation = Quaternion.fromEulerDegrees(0, yawShip * (180 / Math.PI), 0)

      // ── Movimiento horizontal ──────────────────────────────────────────
      const fwdShip = Vector3.rotate(Vector3.Forward(), transform.rotation)
      transform.position.x += fwdShip.x * mutableKart.currentSpeed * dt
      transform.position.z += fwdShip.z * mutableKart.currentSpeed * dt

      // ── Empuje Vertical (subir/bajar) ─────────────────────────────────
      // Escalado por tamaño: una nave N× más grande sube/baja N× más rápido (mismo feel).
      const SHIP_VERT_ACCEL  = 45.0 * physScale  // aceleración vertical m/s²
      const SHIP_VERT_MAX    = 28.0 * physScale  // velocidad vertical máxima
      const SHIP_VERT_DRAG   = 1.5   // amortiguación al soltar (adimensional, no escala)

      if (InputState.thrustUp) {
        mutableKart.shipVertSpeed = Math.min(SHIP_VERT_MAX, mutableKart.shipVertSpeed + SHIP_VERT_ACCEL * dt)
      } else if (InputState.thrustDown) {
        mutableKart.shipVertSpeed = Math.max(-SHIP_VERT_MAX, mutableKart.shipVertSpeed - SHIP_VERT_ACCEL * dt)
      } else {
        // Desacelerar verticalmente con drag cuando no se presiona nada
        mutableKart.shipVertSpeed *= (1 - SHIP_VERT_DRAG * dt)
        if (Math.abs(mutableKart.shipVertSpeed) < 0.05) mutableKart.shipVertSpeed = 0
      }

      // Altura mínima: la nave puede BAJAR hasta apoyar su panza en el piso. Antes era
      // 1.5·scaleMult (≈20-34m para naves grandes → nunca llegaban al piso). Ahora usa
      // groundOffsetY·scaleMult = distancia origen→panza (igual criterio que apoyar un kart),
      // así la nave aterriza de verdad sin hundirse. Usa scaleMult REAL (geometría, no topeada).
      const minY = (lastKnownGroundY || 5.0) + mutableKart.groundOffsetY * scaleMult
      transform.position.y = Math.max(minY, transform.position.y + mutableKart.shipVertSpeed * dt)

      // Guardar checkpoint seguro
      checkpointTimer += dt
      if (checkpointTimer >= 1.0) {
        checkpointTimer = 0
        mutableKart.lastSafeX    = transform.position.x
        mutableKart.lastSafeY    = transform.position.y
        mutableKart.lastSafeZ    = transform.position.z
        mutableKart.lastSafeRotY = yawShip * (180 / Math.PI)
      }

      // Sincronizar estado global
      RaceState.kartPositionX = transform.position.x
      RaceState.kartPositionY = transform.position.y
      RaceState.kartPositionZ = transform.position.z
      RaceState.vehicleType   = mutableKart.vehicleType
      RaceState.kartSpeedRatio = sf

      // Sincronizar avatar para el minimapa
      avatarSyncTimer += dt
      if (avatarSyncTimer >= AVATAR_SYNC_INTERVAL) {
        avatarSyncTimer = 0
        const fwd2 = Vector3.rotate(Vector3.Forward(), transform.rotation)
        movePlayerTo({
          newRelativePosition: Vector3.create(transform.position.x, transform.position.y, transform.position.z),
          cameraTarget: Vector3.create(transform.position.x + fwd2.x * 5, transform.position.y + 1, transform.position.z + fwd2.z * 5)
        }).catch(() => {})
      }

      // ── Lean visual (roll lateral) en curvas ─────────────────────────
      const sfLean = Math.abs(mutableKart.currentSpeed) / mutableKart.maxSpeed
      const targetLean = -currentSteering * sfLean * MAX_TURN_LEAN * 2.2  // naves inclinan más
      leanVelocity += (-LEAN_STIFFNESS * (leanAngle - targetLean) - LEAN_DAMPING * leanVelocity) * dt
      leanAngle    += leanVelocity * dt

      if (mutableKart.modelEntity) {
        const modelT = Transform.getMutableOrNull(mutableKart.modelEntity as any)
        if (modelT) {
          const q_base = Quaternion.fromEulerDegrees(0, mutableKart.modelYawOffset, 0)
          const q_lean = Quaternion.fromEulerDegrees(leanAngle, 0, 0)
          modelT.rotation = Quaternion.multiply(q_base, q_lean)
        }
      }

      // ── Cámara de nave (más alta y alejada) ───────────────────────────
      if (mutableKart.cameraPivotEntity) {
        const camT = Transform.getMutableOrNull(mutableKart.cameraPivotEntity as any)
        if (camT) {
          const backVec = Vector3.rotate(Vector3.Backward(), transform.rotation)
          const fwdVec  = Vector3.rotate(Vector3.Forward(),  transform.rotation)
          const turboPull = isTurboActive ? 7.5 * scaleMult : 0
          const camDist   = (9.0 + sfLean * 4.0) * scaleMult
          const idealPos  = Vector3.create(
            transform.position.x + backVec.x * (camDist + turboPull),
            transform.position.y + 4.5 * scaleMult,
            transform.position.z + backVec.z * (camDist + turboPull)
          )
          camT.position = lerpV3(camT.position, idealPos, Math.min(1, dt * (isTurboActive ? 2.0 : 4.0)))
          
          // Agregar sacudida de cámara (shake) por vibración de motor a alta velocidad
          const speedRatio = sfLean
          let shakeAmp = 0
          if (isTurboActive) {
            shakeAmp = 0.22 * scaleMult
          } else if (mutableKart.boostTime > 0) {
            shakeAmp = 0.15 * scaleMult
          } else if (speedRatio > 0.9) {
            shakeAmp = 0.05 * (speedRatio - 0.9) * 10 * scaleMult
          }
          
          if (shakeAmp > 0) {
            const shakeX = (Math.random() - 0.5) * shakeAmp
            const shakeY = (Math.random() - 0.5) * shakeAmp
            const shakeZ = (Math.random() - 0.5) * shakeAmp
            camT.position = Vector3.create(
              camT.position.x + shakeX,
              camT.position.y + shakeY,
              camT.position.z + shakeZ
            )
          }

          const lookTarget = Vector3.create(
            transform.position.x + fwdVec.x * sfLean * 4.0 * scaleMult,
            transform.position.y + 1.0 * scaleMult,
            transform.position.z + fwdVec.z * sfLean * 4.0 * scaleMult
          )
          camT.rotation = nlerp(camT.rotation, computeLookAt(camT.position, lookTarget), Math.min(1, dt * 7.0))
        }
      }

      // Sincronizar estado global para el Turbo
      RaceState.isTurboActive = isTurboActive

      // ── Partículas de Turbo (Custom + Native fallback) para Naves ────
      if (isTurboActive) {
        turboParticleTimer += dt
        if (turboParticleTimer >= 0.03) {
          turboParticleTimer = 0
          spawnTurboParticle(transform, scaleMult, mutableKart.currentSpeed)
        }
      }

      if (mutableKart.sparkEntity) {
        const ps = ParticleSystem.getMutableOrNull(mutableKart.sparkEntity as any)
        if (ps) {
          ps.active = isTurboActive
          ps.rate   = isTurboActive ? 80 : 0
          if (isTurboActive) {
            ps.initialColor = {
              start: { r: 1.0, g: 0.2, b: 0.0, a: 1.0 },
              end:   { r: 1.0, g: 0.7, b: 0.1, a: 0.2 }
            }
          }
        }
        const ls = LightSource.getMutableOrNull(mutableKart.sparkEntity as any)
        if (ls) {
          ls.active    = isTurboActive
          ls.intensity = isTurboActive ? 3500 + Math.sin(Date.now() / 75) * 900 : 0
          if (isTurboActive) {
            ls.color = { r: 1.0, g: 0.2, b: 0.0 }
          }
        }
      }

      continue  // skip kart-only physics below
    }

    // ── 1. SENSOR DE PISO ─────────────────────────────────────────────────
    let isGrounded = false

    if (mutableKart.floorSensorEntity) {
      const floorResult = RaycastResult.getOrNull(mutableKart.floorSensorEntity as any)

      if (floorResult && floorResult.hits.length > 0) {
        const validHits = floorResult.hits.filter(hit =>
          hit.entityId !== engine.PlayerEntity &&
          !PlayerIdentityData.has(hit.entityId as any) &&
          hit.entityId !== entity &&
          hit.position != null
        )
        if (validHits.length > 0) {
          validHits.sort((a, b) => (a.length ?? Infinity) - (b.length ?? Infinity))
          for (const hit of validHits) {
            if (hit.position) {
              const normalY = hit.normalHit ? hit.normalHit.y : 1.0
              // Filtramos superficies no transitables (ej: paredes verticales o columnas con normalY <= 0.55)
              if (normalY > 0.55) {
                let projectedGroundY = hit.position.y
                // Proyectar geométricamente la Y de colisión hacia el centro del kart usando la normal
                if (hit.normalHit && hit.normalHit.y > 0.7) {
                  const N = hit.normalHit
                  const dx = transform.position.x - hit.position.x
                  const dz = transform.position.z - hit.position.z
                  projectedGroundY = hit.position.y - (N.x * dx + N.z * dz) / N.y
                  
                  lastKnownGroundY = projectedGroundY
                  lastKnownGroundNormal = hit.normalHit
                } else {
                  lastKnownGroundY = hit.position.y
                  if (hit.normalHit) lastKnownGroundNormal = hit.normalHit
                }
                
                isGrounded       = true
                coyoteFrames     = 0
                break
              }
            }
          }
        }
      }
    }

    if (!isGrounded) {
      coyoteFrames++
      if (coyoteFrames <= COYOTE_TIME) isGrounded = true
    }

    // Lerpear la normal del suelo para suavizar la alineación
    const targetNormal = isGrounded ? lastKnownGroundNormal : Vector3.Up()
    currentGroundNormal = Vector3.create(
      currentGroundNormal.x + (targetNormal.x - currentGroundNormal.x) * Math.min(1.0, dt * 15.0),
      currentGroundNormal.y + (targetNormal.y - currentGroundNormal.y) * Math.min(1.0, dt * 15.0),
      currentGroundNormal.z + (targetNormal.z - currentGroundNormal.z) * Math.min(1.0, dt * 15.0)
    )
    currentGroundNormal = Vector3.normalize(currentGroundNormal)

    // ── 2. SENSOR DE PARED (con cooldown anti-atasco) ─────────────────────
    if (bounceCooldown > 0) bounceCooldown -= dt

    if (mutableKart.wallSensorEntity && bounceCooldown <= 0) {
      const wallResult = RaycastResult.getOrNull(mutableKart.wallSensorEntity as any)
      const wallResultLeft = mutableKart.wallSensorLeftEntity ? RaycastResult.getOrNull(mutableKart.wallSensorLeftEntity as any) : null
      const wallResultRight = mutableKart.wallSensorRightEntity ? RaycastResult.getOrNull(mutableKart.wallSensorRightEntity as any) : null

      const allHits: any[] = []
      if (wallResult && wallResult.hits) allHits.push(...wallResult.hits)
      if (wallResultLeft && wallResultLeft.hits) allHits.push(...wallResultLeft.hits)
      if (wallResultRight && wallResultRight.hits) allHits.push(...wallResultRight.hits)

      if (allHits.length > 0) {
        let isCheckpoint = false
        let closestWallHit = null

        // ── PROCESAR TODOS LOS IMPACTOS (QUERY_ALL) ──────────────────────────
        for (const hit of allHits) {
          const meshName = hit.meshName || ''
          const lowerName = meshName.toLowerCase()
          
          if (lowerName.includes('checkpoint')) {
            isCheckpoint = true
          } else {
            // Buscamos la pared física válida más cercana
            if (!closestWallHit || (hit.length && closestWallHit.length && hit.length < closestWallHit.length)) {
              let isKartChild = false
              if (hit.entityId) {
                const hitT = Transform.getOrNull(hit.entityId as any)
                if (hitT && hitT.parent === entity) isKartChild = true
              }
              
              // Filtro de altura: el impacto debe estar a una altura que el cuerpo físico del kart realmente choque
              // Evita rebotar contra vigas elevadas, techos o puentes por debajo de los cuales pasa el auto
              const hitY = hit.position ? hit.position.y : 0
              const isWithinKartHeight = hit.position && (hitY <= transform.position.y + 0.95 * scaleMult)

              if (!isKartChild && hit.entityId !== entity && hit.entityId !== engine.PlayerEntity && !PlayerIdentityData.has(hit.entityId as any) && isWithinKartHeight) {
                closestWallHit = hit
              }
            }
          }
        }

        // ── ACTUALIZAR VARIABLES DE DEPURACIÓN ──
        if (closestWallHit) {
          const normalY = closestWallHit.normalHit ? Math.abs(closestWallHit.normalHit.y) : 1
          const isWall = normalY < 0.65
          RaceState.debugLastWallHitName = closestWallHit.meshName || 'Unnamed'
          RaceState.debugLastWallHitDist = closestWallHit.length || 0
          RaceState.debugLastWallHitY = closestWallHit.position ? closestWallHit.position.y : 0
          RaceState.debugLastWallHitNormalY = closestWallHit.normalHit ? closestWallHit.normalHit.y : 1
          RaceState.debugLastWallHitIsWall = isWall
        } else {
          RaceState.debugLastWallHitName = 'None'
          RaceState.debugLastWallHitDist = 0
          RaceState.debugLastWallHitY = 0
          RaceState.debugLastWallHitNormalY = 0
          RaceState.debugLastWallHitIsWall = false
        }

        // ── APLICAR REBOTE SI HAY UNA PARED VÁLIDA O INCLINAR SI ES RAMPA ──
        if (closestWallHit && !isCheckpoint) {
          const normalY = closestWallHit.normalHit ? Math.abs(closestWallHit.normalHit.y) : 1
          const isWall = normalY < 0.65

          if (isWall) {
            if (closestWallHit.length != null && closestWallHit.length < 0.65 * scaleMult) {
              console.log(`[COLLISION] BOUNCE! Mesh: ${closestWallHit.meshName}, dist: ${closestWallHit.length.toFixed(2)}, hitY: ${closestWallHit.position?.y.toFixed(2)}, normY: ${closestWallHit.normalHit?.y.toFixed(2)}`)
              mutableKart.currentSpeed = -mutableKart.currentSpeed * 0.35
              const bwd = Vector3.rotate(Vector3.Backward(), transform.rotation)
              transform.position.x += bwd.x * 0.45 * scaleMult
              transform.position.z += bwd.z * 0.45 * scaleMult
              bounceCooldown = BOUNCE_COOLDOWN
              
              leanVelocity = 0
              
              bounceCooldown = 0.5 // medio segundo de invulnerabilidad
            }
          } else {
            // Es una pendiente transitable chocado por el sensor de pared
            // Esto evita que traspase el suelo al subir cuestas empinadas a gran velocidad
            let projectedGroundY = closestWallHit.position.y
            if (closestWallHit.normalHit && closestWallHit.normalHit.y > 0.1) {
              const N = closestWallHit.normalHit
              const dx = transform.position.x - closestWallHit.position.x
              const dz = transform.position.z - closestWallHit.position.z
              projectedGroundY = closestWallHit.position.y - (N.x * dx + N.z * dz) / N.y
            }
            lastKnownGroundY = Math.max(lastKnownGroundY, projectedGroundY)
            isGrounded = true
            coyoteFrames = 0
          }
        }
      } else {
        RaceState.debugLastWallHitName = 'None'
        RaceState.debugLastWallHitDist = 0
        RaceState.debugLastWallHitY = 0
        RaceState.debugLastWallHitNormalY = 0
        RaceState.debugLastWallHitIsWall = false
      }
    }

    // ── 3. ACELERACIÓN (curva ease-out) ───────────────────────────────────
    const isTurboActive = InputState.turbo && InputState.forward
    const speedRatio   = Math.abs(mutableKart.currentSpeed) / mutableKart.maxSpeed

    // Curva de aceleración: fuerte a baja velocidad, se afloja al acercarse a la
    // velocidad final (ease-out cuadrático). El piso de 0.12 garantiza que el auto
    // SIEMPRE llegue al tope (y al sobre-tope de recta) en vez de quedar asintótico.
    let dynamicAccel = mutableKart.acceleration * Math.max(0.28, 1.0 - 0.55 * speedRatio * speedRatio)

    if (isTurboActive) {
      dynamicAccel *= 1.8
    }

    // ── Overdrive de recta ─────────────────────────────────────────────────
    // Yendo derecho (sin doblar), a fondo y ya cerca del tope, se acumula un
    // bonus que sube un poco la velocidad final. Se pierde rápido al doblar/soltar.
    const goingStraight = InputState.forward && !mutableKart.isDrifting && Math.abs(currentSteering) < 0.06
    if (goingStraight && speedRatio > 0.85) {
      straightOverdrive = Math.min(1.0, straightOverdrive + dt * 0.30)   // ~3.3s hasta el máximo
    } else {
      straightOverdrive = Math.max(0.0, straightOverdrive - dt * 1.5)    // se desarma al doblar/soltar
    }

    let isAccelerating = false

    if (InputState.forward) {
      mutableKart.currentSpeed += dynamicAccel * dt
      isAccelerating = true
    } else if (InputState.backward) {
      mutableKart.currentSpeed -= (mutableKart.acceleration * 1.5) * dt
      isAccelerating = true
    } else {
      mutableKart.currentSpeed *= (1 - mutableKart.friction * dt)
    }

    // ── 4. BOOST POST-DRIFT ───────────────────────────────────────────────
    if (mutableKart.boostTime > 0) {
      mutableKart.boostTime -= dt
      const boostCap = mutableKart.maxSpeed * 1.65
      mutableKart.currentSpeed = Math.min(mutableKart.currentSpeed + 60 * physScale * dt, boostCap)
      isAccelerating = true
    }

    // Si el turbo está activo y no hay boost de drift, aceleramos hacia el turboCap
    if (isTurboActive && mutableKart.boostTime <= 0) {
      const turboCap = mutableKart.maxSpeed * 2.1
      mutableKart.currentSpeed = Math.min(mutableKart.currentSpeed + 90 * physScale * dt, turboCap)
      isAccelerating = true
    }

    // Tope normal extendido por el overdrive de recta (hasta +18% de la velocidad final)
    const STRAIGHT_TOP_BONUS = 0.18
    const normalCap = mutableKart.maxSpeed * (1.0 + straightOverdrive * STRAIGHT_TOP_BONUS)

    const currentMaxCap = mutableKart.boostTime > 0
      ? mutableKart.maxSpeed * 1.65
      : (isTurboActive ? mutableKart.maxSpeed * 2.1 : normalCap)

    const MAX_REVERSE = -(mutableKart.maxSpeed * 0.35)
    if (mutableKart.currentSpeed > currentMaxCap)    mutableKart.currentSpeed = currentMaxCap
    if (mutableKart.currentSpeed < MAX_REVERSE) mutableKart.currentSpeed = MAX_REVERSE
    if (!isAccelerating && Math.abs(mutableKart.currentSpeed) < 0.05) mutableKart.currentSpeed = 0

    // ── 5. DRIFT + GIRO CON INERCIA ───────────────────────────────────────
    // Inicializar el rumbo Y limpio al subir al auto
    if (!wasOccupiedLastFrame) {
      wasOccupiedLastFrame = true
      const q_init = transform.rotation
      const yaw_init = Math.atan2(2 * (q_init.w * q_init.y + q_init.x * q_init.z), 1 - 2 * (q_init.y * q_init.y + q_init.z * q_init.z))
      currentYaw = yaw_init * (180 / Math.PI)
      velX = 0; velZ = 0; driftKick = 0
    }

    const isTurningRaw = InputState.left || InputState.right  // Señal cruda para drift
    const driftHeld    = InputState.drift
    const speedOk      = Math.abs(mutableKart.currentSpeed) > mutableKart.maxSpeed * 0.25
    const canDrift     = driftHeld && isTurningRaw && speedOk

    if (canDrift) {
      if (!mutableKart.isDrifting) {
        mutableKart.isDrifting     = true
        mutableKart.driftDirection = InputState.right ? 1 : -1
        // El tren trasero se suelta de golpe hacia afuera de la curva (sentido opuesto al rumbo)
        driftKick = -mutableKart.driftDirection
      }
      mutableKart.driftTime += dt

      // Rampa de la rotación del rumbo (llega al radio máximo en ~0.5s)
      const driftPhysProgression = Math.min(1.0, mutableKart.driftTime / 0.5)
      const revMod   = mutableKart.currentSpeed < 0 ? -1 : 1
      // Contravolante: volanteando HACIA la curva cierra (gira más), hacia afuera abre el drift.
      let steerMod = 1.0 + currentSteering * mutableKart.driftDirection * 0.45
      steerMod = Math.max(0.5, Math.min(1.5, steerMod))
      currentYaw += mutableKart.driftDirection * mutableKart.turnSpeed * 0.5 * driftPhysProgression * steerMod * revMod * dt

      // Scrub de neumático: el derrape raspa y baja un poco la velocidad (se recupera con el boost)
      const scrub = isAccelerating ? 0.5 : 1.6
      mutableKart.currentSpeed *= (1 - scrub * dt)

    } else {
      // ── Giro normal con inercia del volante ──────────────────────────────
      if (mutableKart.currentSpeed !== 0 && Math.abs(currentSteering) > 0.02) {
        const sfTurn   = Math.abs(mutableKart.currentSpeed) / mutableKart.maxSpeed
        const speedCurve = 1.6 - (sfTurn * 0.2)
        const dynTurn  = mutableKart.turnSpeed * speedCurve
        const revMod   = mutableKart.currentSpeed < 0 ? -1 : 1
        currentYaw += currentSteering * dynTurn * revMod * dt
      }

      // Fin de drift → boost
      if (mutableKart.isDrifting) {
        mutableKart.isDrifting = false
        if (mutableKart.driftTime > 2.2)      mutableKart.boostTime = 2.0
        else if (mutableKart.driftTime > 0.9) mutableKart.boostTime = 1.0
        mutableKart.driftTime      = 0
        mutableKart.driftDirection = 0
      }
    }

    // ── 5.5 ALINEAR CON EL TERRENO (PITCH & ROLL) ──────────────────────────
    const baseRotation = Quaternion.fromEulerDegrees(0, currentYaw, 0)
    const baseFwd = Vector3.rotate(Vector3.Forward(), baseRotation)
    
    // Proyectar el rumbo hacia el plano del terreno para evitar que el auto doble solo en bajadas
    let R = Vector3.cross(currentGroundNormal, baseFwd)
    R = Vector3.normalize(R)
    let F_aligned = Vector3.cross(R, currentGroundNormal)
    F_aligned = Vector3.normalize(F_aligned)
    
    transform.rotation = Quaternion.lookRotation(F_aligned, currentGroundNormal)

    // ── 6. MOVIMIENTO con DERRAPE REAL (grip lateral) ─────────────────────
    // El auto apunta a su rumbo (fwd) pero se mueve según el vector velX/velZ.
    // Cuando el rumbo gira, parte del momentum viejo queda "de costado": ese es
    // el derrape. El grip decide cuánto persiste: poco en drift (desliza), mucho
    // en manejo normal (agarra y va donde apunta).
    const fwd   = Vector3.rotate(Vector3.Forward(), transform.rotation)
    const right = Vector3.rotate(Vector3.Right(),   transform.rotation)

    // Componente lateral del momentum actual respecto al rumbo nuevo
    let latSpeed = velX * right.x + velZ * right.z

    // Patada inicial del drift (un frame): suelta el tren trasero hacia afuera
    if (driftKick !== 0) {
      latSpeed += driftKick * Math.abs(mutableKart.currentSpeed) * 0.22
      driftKick = 0
    }

    // Grip lateral: drift = bajo (el derrape persiste ~varios frames) · normal = alto
    const gripRate = mutableKart.isDrifting ? 1.3 : 12.0
    latSpeed *= Math.max(0, 1 - gripRate * dt)

    // Techo del derrape para no trompear (drift permite más ángulo que el manejo normal)
    const latCap = Math.abs(mutableKart.currentSpeed) * (mutableKart.isDrifting ? 0.85 : 0.35)
    if (latSpeed >  latCap) latSpeed =  latCap
    if (latSpeed < -latCap) latSpeed = -latCap

    // Velocidad real = empuje del motor (adelante) + derrape lateral
    velX = fwd.x * mutableKart.currentSpeed + right.x * latSpeed
    velZ = fwd.z * mutableKart.currentSpeed + right.z * latSpeed

    transform.position.x += velX * dt
    transform.position.z += velZ * dt

    // ── 7. GRAVEDAD Y SEGUIMIENTO DE TERRENO ──────────────────────────────
    // Offset por kart (mitad de la altura del modelo) para apoyar las ruedas en el
    // terreno. Modelos altos (kart10) usan más; sin esto se hunden al manejar.
    const targetY = lastKnownGroundY + mutableKart.groundOffsetY * scaleMult
    if (isGrounded) {
      if (targetY > transform.position.y) {
        // En subidas, snap instantáneo para evitar atravesar el terreno
        transform.position.y = targetY
      } else {
        // En bajadas, seguir el terreno con suavidad rápida para mantener adherencia
        transform.position.y += (targetY - transform.position.y) * Math.min(1.0, dt * 35.0)
      }
    } else {
      // Gravedad al estar en el aire (vuelo libre)
      transform.position.y -= 12.0 * dt
    }
    transform.position.y = Math.max(0.1, transform.position.y)

      // ── ACTUALIZAR ESTADO GLOBAL PARA MINIMAPA      // Compartir posición y tipo de vehículo con la UI
      RaceState.kartPositionX = transform.position.x
      RaceState.kartPositionY = transform.position.y
      RaceState.kartPositionZ = transform.position.z
      RaceState.vehicleType   = mutableKart.vehicleType
      RaceState.kartSpeedRatio = Math.abs(mutableKart.currentSpeed) / mutableKart.maxSpeed

      // ── SINCRONIZAR AVATAR OCULTO CON EL KART (para minimap nativo) ────
      // Cada 0.4s teletransportamos el avatar invisible a la posición del kart.
      // Así el minimapa nativo de DCL muestra la flechita siguiendo al auto.
      avatarSyncTimer += dt
      if (avatarSyncTimer >= AVATAR_SYNC_INTERVAL) {
        avatarSyncTimer = 0
        const kartPos = transform.position
        const fwd = Vector3.rotate(Vector3.Forward(), transform.rotation)
        movePlayerTo({
          newRelativePosition: Vector3.create(kartPos.x, kartPos.y, kartPos.z),
          cameraTarget: Vector3.create(kartPos.x + fwd.x * 5, kartPos.y + 1, kartPos.z + fwd.z * 5)
        }).catch(() => {})
      }

      // ── 8. CHECKPOINT ─────────────────────────────────────────────────────
    if (isGrounded && Math.abs(mutableKart.currentSpeed) > 2.0) {
      checkpointTimer += dt
      if (checkpointTimer >= 1.0) {
        checkpointTimer          = 0
        mutableKart.lastSafeX    = transform.position.x
        mutableKart.lastSafeY    = transform.position.y
        mutableKart.lastSafeZ    = transform.position.z
        mutableKart.lastSafeRotY = currentYaw
      }
    }

    // ── 9. LEAN & SLIP VISUAL — Spring-Damper ─────────────────────────────
    const sf         = Math.abs(mutableKart.currentSpeed) / mutableKart.maxSpeed
    
    // Lean (Roll)
    const normalLean = -currentSteering * sf * MAX_TURN_LEAN
    const targetLean = mutableKart.isDrifting
      ? mutableKart.driftDirection * MAX_DRIFT_LEAN
      : normalLean

    leanVelocity += (-LEAN_STIFFNESS * (leanAngle - targetLean) - LEAN_DAMPING * leanVelocity) * dt
    leanAngle    += leanVelocity * dt

    // Slip Angle (Yaw) visual rápido para entrar, suave para salir
    const targetSlip = mutableKart.isDrifting
      ? mutableKart.driftDirection * MAX_DRIFT_SLIP
      : 0
      
    const currentSlipStiff = mutableKart.isDrifting ? SLIP_STIFFNESS : 35
    const currentSlipDamp  = mutableKart.isDrifting ? SLIP_DAMPING : 6
      
    slipVelocity += (-currentSlipStiff * (slipAngle - targetSlip) - currentSlipDamp * slipVelocity) * dt
    slipAngle    += slipVelocity * dt

    if (mutableKart.modelEntity) {
      const modelT = Transform.getMutableOrNull(mutableKart.modelEntity as any)
      if (modelT) {
        // Base: el .glb viene rotado. -90 para el modelo estándar; configurable por kart.
        const q_base = Quaternion.fromEulerDegrees(0, mutableKart.modelYawOffset, 0)
        // Slip visual (Yaw)
        const q_slip = Quaternion.fromEulerDegrees(0, slipAngle, 0)
        // Inclinación (Roll) -> Se aplica sobre X en el espacio local
        const q_lean = Quaternion.fromEulerDegrees(leanAngle, 0, 0)
        
        // Multiplicar en orden: base * slip * lean
        modelT.rotation = Quaternion.multiply(Quaternion.multiply(q_base, q_slip), q_lean)
      }
    }

    // ── 9b. CHISPAS DE DRIFT / TURBO + LUZ PULSANTE ──────────────────────────
    // Color como Mario Kart: Blanco/amarillo → Naranja → Azul/morado para drift, rojo/naranja para turbo.
    if (mutableKart.sparkEntity) {
      const ps = ParticleSystem.getMutableOrNull(mutableKart.sparkEntity as any)
      const isTurboActive = InputState.turbo && InputState.forward
      
      if (ps) {
        ps.active = mutableKart.isDrifting || isTurboActive
        ps.rate   = mutableKart.isDrifting ? 55 : (isTurboActive ? 80 : 0)
        
        if (isTurboActive && !mutableKart.isDrifting) {
          // Partículas de Turbo (Fuego)
          ps.initialColor = {
            start: { r: 1.0, g: 0.2, b: 0.0, a: 1.0 },
            end:   { r: 1.0, g: 0.7, b: 0.1, a: 0.2 }
          }
        } else if (mutableKart.isDrifting) {
          if (mutableKart.driftTime > 2.2) {
            // Ultra Mini-Turbo — Azul/morado
            ps.initialColor = { start: { r: 0.4, g: 0.2, b: 1.0, a: 1 }, end: { r: 0.8, g: 0.5, b: 1.0, a: 1 } }
          } else if (mutableKart.driftTime > 0.9) {
            // Super Mini-Turbo — Naranja
            ps.initialColor = { start: { r: 1.0, g: 0.4, b: 0.0, a: 1 }, end: { r: 1.0, g: 0.7, b: 0.1, a: 1 } }
          } else {
            // Mini-Turbo — Blanco/amarillo
            ps.initialColor = { start: { r: 1.0, g: 0.85, b: 0.2, a: 1 }, end: { r: 1.0, g: 1.0, b: 0.5, a: 1 } }
          }
        }
      }

      const ls = LightSource.getMutableOrNull(mutableKart.sparkEntity as any)
      if (ls) {
        ls.active    = mutableKart.isDrifting || isTurboActive
        ls.intensity = (mutableKart.isDrifting || isTurboActive)
          ? 3500 + Math.sin(Date.now() / 75) * 900   // pulso rápido
          : 0
          
        if (isTurboActive && !mutableKart.isDrifting) {
          ls.color = { r: 1.0, g: 0.2, b: 0.0 }   // rojo fuego
        } else if (mutableKart.isDrifting) {
          if (mutableKart.driftTime > 2.2) {
            ls.color = { r: 0.5, g: 0.2, b: 1.0 }   // morado
          } else if (mutableKart.driftTime > 0.9) {
            ls.color = { r: 1.0, g: 0.4, b: 0.0 }   // naranja
          } else {
            ls.color = { r: 1.0, g: 0.85, b: 0.2 }  // amarillo
          }
        }
      }
    }

    // ── 10. CÁMARA BANDA ELÁSTICA ─────────────────────────────────────────
    // La cámara vive en espacio mundial (sin parent).
    // Cada frame: calculamos dónde DEBERÍA estar y la interpolamos hacia allí.
    //
    // Factor de posición 4.5 → la cámara alcanza el punto ideal en ~0.4s (se reduce en turbo para dar más lag visual)
    // Factor de rotación 8.0 → mira al kart más rápido que se mueve
    if (mutableKart.cameraPivotEntity) {
      const camT = Transform.getMutableOrNull(mutableKart.cameraPivotEntity as any)
      if (camT) {
        const backVec = Vector3.rotate(Vector3.Backward(), transform.rotation)
        const fwdVec  = Vector3.rotate(Vector3.Forward(),  transform.rotation)

        // Distancia dinámica escalada
        const camDist   = (7.0 + sf * 3.0) * scaleMult
        // Pull-back extra durante boost o turbo activo
        const turboPull = isTurboActive ? 6.5 * scaleMult : 0
        const boostPull = (mutableKart.boostTime > 0 ? mutableKart.boostTime * 1.5 * scaleMult : 0) + turboPull

        const idealPos  = Vector3.create(
          transform.position.x + backVec.x * (camDist + boostPull),
          transform.position.y + (3.2 + sf * 0.8) * scaleMult + (isTurboActive ? 0.3 * scaleMult : 0),
          transform.position.z + backVec.z * (camDist + boostPull)
        )
        const posFactor = Math.min(1, dt * (isTurboActive ? 2.5 : 4.5))
        camT.position   = lerpV3(camT.position, idealPos, posFactor)

        // Agregar sacudida de cámara (shake) por vibración de motor a alta velocidad
        const speedRatio = sf
        let shakeAmp = 0
        if (isTurboActive) {
          shakeAmp = 0.22 * scaleMult
        } else if (mutableKart.boostTime > 0) {
          shakeAmp = 0.15 * scaleMult
        } else if (speedRatio > 0.9) {
          shakeAmp = 0.05 * (speedRatio - 0.9) * 10 * scaleMult
        }
        
        if (shakeAmp > 0) {
          const shakeX = (Math.random() - 0.5) * shakeAmp
          const shakeY = (Math.random() - 0.5) * shakeAmp
          const shakeZ = (Math.random() - 0.5) * shakeAmp
          camT.position = Vector3.create(
            camT.position.x + shakeX,
            camT.position.y + shakeY,
            camT.position.z + shakeZ
          )
        }

        // Look-ahead escalado: la cámara mira hacia adelante del kart
        const lookTarget = Vector3.create(
          transform.position.x + fwdVec.x * sf * 3.0 * scaleMult,
          transform.position.y + 1.0 * scaleMult,
          transform.position.z + fwdVec.z * sf * 3.0 * scaleMult
        )
        const targetRot = computeLookAt(camT.position, lookTarget)
        const rotFactor = Math.min(1, dt * 8.0)
        camT.rotation   = nlerp(camT.rotation, targetRot, rotFactor)
      }
    }

    // Sincronizar estado global para el Turbo
    RaceState.isTurboActive = isTurboActive

    // ── Partículas de Turbo (Custom) para Karts ──────────────────────
    if (isTurboActive) {
      turboParticleTimer += dt
      if (turboParticleTimer >= 0.03) {
        turboParticleTimer = 0
        spawnTurboParticle(transform, scaleMult, mutableKart.currentSpeed)
      }
    }
  }
}

export function turboParticleSystem(dt: number) {
  for (const [entity, particle, transform] of engine.getEntitiesWith(TurboParticle, Transform)) {
    const mutableTransform = Transform.getMutable(entity)
    const mutableParticle = TurboParticle.getMutable(entity)
    
    // Mover la partícula hacia atrás
    mutableTransform.position = Vector3.add(mutableTransform.position, Vector3.scale(particle.velocity, dt))
    
    // Escalar la partícula hacia abajo según su vida
    mutableParticle.lifeTime += dt
    const ratio = 1.0 - (mutableParticle.lifeTime / particle.maxLife)
    if (ratio <= 0) {
      engine.removeEntity(entity)
    } else {
      // Las partículas se expanden visualmente a medida que se dispersan en el aire
      const size = (0.4 + (1.0 - ratio) * 1.25) * 0.4
      mutableTransform.scale = Vector3.create(size, size, size)
    }
  }
}
