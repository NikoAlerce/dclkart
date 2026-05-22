import {
  engine, Transform,
  inputSystem, InputAction, PointerEventType,
  InputModifier, AvatarModifierArea,
  RaycastResult, MainCamera,
  ParticleSystem, LightSource,
  pointerEventsSystem, MeshCollider, ColliderLayer
} from '@dcl/sdk/ecs'
import { KartData, KartOwner } from './components'
import { Quaternion, Vector3 } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { kartColliderMap } from './kart'
import { InputState } from './inputState'
import { RaceState, RacePhase } from './raceState'

// ─── Estado de módulo ─────────────────────────────────────────────────────────
let lastKnownGroundY  = 8.6
let coyoteFrames      = 0
const COYOTE_TIME     = 6

// Steering con inercia: el volante no pasa de 0 a 1 en un solo frame
// Simula el "peso" del volante y elimina el giro brusco
let currentSteering   = 0

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
const MAX_DRIFT_SLIP  = 65   // 65 grados de cruce al derrapar

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
const RESPAWN_Y       = 5.0
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
  InputState.exit        = inputSystem.isTriggered(InputAction.IA_PRIMARY, PointerEventType.PET_DOWN)
  InputState.thrustUp    = inputSystem.isPressed(InputAction.IA_JUMP)       // ESPACIO (DCL no permite leer la letra R)
  InputState.thrustDown  = inputSystem.isPressed(InputAction.IA_SECONDARY)  // F

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

    // ── 0. SALIR ──────────────────────────────────────────────────────────
    if (InputState.exit) {
      mutableKart.isOccupied    = false
      mutableKart.currentSpeed  = 0
      mutableKart.isDrifting    = false
      mutableKart.driftTime     = 0
      mutableKart.boostTime     = 0
      coyoteFrames              = 0
      RaceState.phase           = RacePhase.LOBBY
      leanAngle                 = 0
      leanVelocity              = 0
      checkpointTimer           = 0
      bounceCooldown            = 0
      currentSteering           = 0

      InputModifier.deleteFrom(engine.PlayerEntity)
      AvatarModifierArea.deleteFrom(entity)

      // Liberar el kart en la red (todos los jugadores ven que quedó libre)
      const ownerComp = KartOwner.getMutableOrNull(entity)
      if (ownerComp) ownerComp.ownerId = ''

      // Restaurar el collider hijo con el tamaño real del kart
      // (PHYSICS: otros karts rebotan, POINTER: otros jugadores pueden subirse)
      const colliderEnt = kartColliderMap.get(entity)
      if (colliderEnt !== undefined) {
        MeshCollider.setBox(colliderEnt as any, ColliderLayer.CL_PHYSICS | ColliderLayer.CL_POINTER)
      }


      if (mutableKart.floorSensorEntity) {
        engine.removeEntity(mutableKart.floorSensorEntity as any)
        mutableKart.floorSensorEntity = undefined
      }
      if (mutableKart.wallSensorEntity) {
        engine.removeEntity(mutableKart.wallSensorEntity as any)
        mutableKart.wallSensorEntity = undefined
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

      const rightVec = Vector3.rotate(Vector3.Right(), transform.rotation)
      const exitPos  = Vector3.add(transform.position, Vector3.scale(rightVec, 2.0))
      exitPos.y = Math.max(exitPos.y, lastKnownGroundY + 0.1)
      
      const playerT = Transform.getMutableOrNull(engine.PlayerEntity)
      if (playerT) playerT.parent = undefined
      
      movePlayerTo({ newRelativePosition: exitPos, cameraTarget: transform.position }).catch(() => {})
      continue
    }

    // ── GESTION DE CARRERA (Timers) ───────────────────────────────────────
    if (RaceState.phase === RacePhase.COUNTDOWN) {
      RaceState.countdownTimer -= dt
      if (RaceState.countdownTimer <= 0) {
        RaceState.phase = RacePhase.RACING
      }
    }
    
    if (RaceState.showCheckpointText) {
      RaceState.checkpointTextTimer -= dt
      if (RaceState.checkpointTextTimer <= 0) {
        RaceState.showCheckpointText = false
      }
    }

    // Congelar controles si no estamos corriendo
    const canDrive = RaceState.phase === RacePhase.RACING
    if (!canDrive) {
      InputState.forward = false
      InputState.backward = false
      InputState.left = false
      InputState.right = false
      InputState.drift = false
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
      lastKnownGroundY         = mutableKart.lastSafeY
      continue
    }

    // ── MODO NAVE ─────────────────────────────────────────────────────────
    // Las naves ignoran la gravedad, no usan sensores de piso/pared, y
    // pueden moverse libremente en los 3 ejes con R (subir) y F (bajar).
    if (mutableKart.vehicleType === 'ship') {
      const scaleMult = mutableKart.scale || 1.0
      const sf = Math.abs(mutableKart.currentSpeed) / mutableKart.maxSpeed

      // Leer el sensor de piso para saber la altura real del terreno
      if (mutableKart.floorSensorEntity) {
        const floorResult = RaycastResult.getOrNull(mutableKart.floorSensorEntity as any)
        if (floorResult && floorResult.hits.length > 0) {
          const validHits = floorResult.hits.filter(h =>
            h.entityId !== engine.PlayerEntity && h.entityId !== entity && h.position != null
          )
          if (validHits.length > 0) {
            validHits.sort((a, b) => (a.length ?? Infinity) - (b.length ?? Infinity))
            const closest = validHits[0]
            if (closest.position) lastKnownGroundY = closest.position.y
          }
        }
      }

      // ── Velocidad horizontal (W/S) con inercia ─────────────────────────
      const speedRatio   = Math.abs(mutableKart.currentSpeed) / mutableKart.maxSpeed
      const dynamicAccel = mutableKart.acceleration * (1.0 - speedRatio * 0.45)

      if (InputState.forward) {
        mutableKart.currentSpeed += dynamicAccel * dt
      } else if (InputState.backward) {
        mutableKart.currentSpeed -= mutableKart.acceleration * 1.2 * dt
      } else {
        // Fricción baja = la nave desliza, no frena bruscamente
        mutableKart.currentSpeed *= (1 - mutableKart.friction * dt)
      }

      // Boost post-drift también aplica en naves
      if (mutableKart.boostTime > 0) {
        mutableKart.boostTime -= dt
        const boostCap = mutableKart.maxSpeed * 1.35
        mutableKart.currentSpeed = Math.min(mutableKart.currentSpeed + 55 * dt, boostCap)
      }

      const boostCap    = mutableKart.maxSpeed * 1.35
      const MAX_REVERSE = -(mutableKart.maxSpeed * 0.3)
      if (mutableKart.currentSpeed > boostCap)    mutableKart.currentSpeed = boostCap
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
      transform.position.x = Math.max(2, Math.min(942, transform.position.x + fwdShip.x * mutableKart.currentSpeed * dt))
      transform.position.z = Math.max(2, Math.min(494, transform.position.z + fwdShip.z * mutableKart.currentSpeed * dt))

      // ── Empuje Vertical R/F ───────────────────────────────────────────
      const SHIP_VERT_ACCEL  = 45.0  // aceleración vertical m/s²
      const SHIP_VERT_MAX    = 28.0  // velocidad vertical máxima
      const SHIP_VERT_DRAG   = 1.5   // amortiguación al soltar (frena más rápido al soltar)

      if (InputState.thrustUp) {
        mutableKart.shipVertSpeed = Math.min(SHIP_VERT_MAX, mutableKart.shipVertSpeed + SHIP_VERT_ACCEL * dt)
      } else if (InputState.thrustDown) {
        mutableKart.shipVertSpeed = Math.max(-SHIP_VERT_MAX, mutableKart.shipVertSpeed - SHIP_VERT_ACCEL * dt)
      } else {
        // Desacelerar verticalmente con drag cuando no se presiona nada
        mutableKart.shipVertSpeed *= (1 - SHIP_VERT_DRAG * dt)
        if (Math.abs(mutableKart.shipVertSpeed) < 0.05) mutableKart.shipVertSpeed = 0
      }

      // Altura mínima: la nave no puede atravesar el suelo
      const minY = (lastKnownGroundY || 5.0) + 1.5 * scaleMult
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
      RaceState.kartPositionZ = transform.position.z
      RaceState.vehicleType   = mutableKart.vehicleType

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
          const q_base = Quaternion.fromEulerDegrees(0, -90, 0)
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
          const camDist   = (9.0 + sfLean * 4.0) * scaleMult
          const idealPos  = Vector3.create(
            transform.position.x + backVec.x * camDist,
            transform.position.y + 4.5 * scaleMult,
            transform.position.z + backVec.z * camDist
          )
          camT.position = lerpV3(camT.position, idealPos, Math.min(1, dt * 4.0))
          const lookTarget = Vector3.create(
            transform.position.x + fwdVec.x * sfLean * 4.0 * scaleMult,
            transform.position.y + 1.0 * scaleMult,
            transform.position.z + fwdVec.z * sfLean * 4.0 * scaleMult
          )
          camT.rotation = nlerp(camT.rotation, computeLookAt(camT.position, lookTarget), Math.min(1, dt * 7.0))
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
          hit.entityId !== entity &&
          hit.position != null
        )
        if (validHits.length > 0) {
          validHits.sort((a, b) => (a.length ?? Infinity) - (b.length ?? Infinity))
          const scaleMult = mutableKart.scale || 1.0
          const KART_ROOF_Y = transform.position.y + 1.5 * scaleMult
          for (const hit of validHits) {
            if (hit.position && hit.position.y <= KART_ROOF_Y) {
              lastKnownGroundY = hit.position.y
              isGrounded       = true
              coyoteFrames     = 0
              break
            }
          }
        }
      }
    }

    if (!isGrounded) {
      coyoteFrames++
      if (coyoteFrames <= COYOTE_TIME) isGrounded = true
    }

    // ── 2. SENSOR DE PARED (con cooldown anti-atasco) ─────────────────────
    if (bounceCooldown > 0) bounceCooldown -= dt

    if (mutableKart.wallSensorEntity && bounceCooldown <= 0) {
      const wallResult = RaycastResult.getOrNull(mutableKart.wallSensorEntity as any)

      if (wallResult && wallResult.hits.length > 0) {
        let isCheckpoint = false
        let closestWallHit = null

        // ── PROCESAR TODOS LOS IMPACTOS (QUERY_ALL) ──────────────────────────
        for (const hit of wallResult.hits) {
          const meshName = hit.meshName || ''
          const lowerName = meshName.toLowerCase()
          
          if (lowerName.includes('checkpoint')) {
            const match = lowerName.match(/checkpoint_(\d+)/)
            if (match) {
              RaceState.passCheckpoint(parseInt(match[1]))
            }
            isCheckpoint = true
          } else {
            // Buscamos la pared física válida más cercana
            if (!closestWallHit || (hit.length && closestWallHit.length && hit.length < closestWallHit.length)) {
              let isKartChild = false
              if (hit.entityId) {
                const hitT = Transform.getOrNull(hit.entityId as any)
                if (hitT && hitT.parent === entity) isKartChild = true
              }
              
              if (!isKartChild && hit.entityId !== entity && hit.entityId !== engine.PlayerEntity) {
                closestWallHit = hit
              }
            }
          }
        }

        // ── APLICAR REBOTE SI HAY UNA PARED VÁLIDA ────────────────────────
        if (closestWallHit && !isCheckpoint) {
          // Ampliamos el rango de normal (< 0.9) para rebotar contra paredes inclinadas.
          const normalY = closestWallHit.normalHit ? Math.abs(closestWallHit.normalHit.y) : 1
          const isWall = normalY < 0.9

          const scaleMult = mutableKart.scale || 1.0
          if (isWall && closestWallHit.length != null && closestWallHit.length < 2.5 * scaleMult) {
            mutableKart.currentSpeed = -mutableKart.currentSpeed * 0.35
            const bwd = Vector3.rotate(Vector3.Backward(), transform.rotation)
            transform.position.x += bwd.x * 0.8 * scaleMult
            transform.position.z += bwd.z * 0.8 * scaleMult
            bounceCooldown = BOUNCE_COOLDOWN
            
            leanVelocity = 0
            
            bounceCooldown = 0.5 // medio segundo de invulnerabilidad
          }
        }
      }
    }

    // ── 3. ACELERACIÓN (curva dinámica) ───────────────────────────────────
    const speedRatio   = Math.abs(mutableKart.currentSpeed) / mutableKart.maxSpeed
    const dynamicAccel = mutableKart.acceleration * (1.0 - speedRatio * 0.55)
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
      const boostCap = mutableKart.maxSpeed * 1.45
      mutableKart.currentSpeed = Math.min(mutableKart.currentSpeed + 60 * dt, boostCap)
      isAccelerating = true
    }

    const boostCap    = mutableKart.maxSpeed * 1.45
    const MAX_REVERSE = -(mutableKart.maxSpeed * 0.35)
    if (mutableKart.currentSpeed > boostCap)    mutableKart.currentSpeed = boostCap
    if (mutableKart.currentSpeed < MAX_REVERSE) mutableKart.currentSpeed = MAX_REVERSE
    if (!isAccelerating && Math.abs(mutableKart.currentSpeed) < 0.05) mutableKart.currentSpeed = 0

    // ── 5. DRIFT + GIRO CON INERCIA ───────────────────────────────────────
    const isTurningRaw = InputState.left || InputState.right  // Señal cruda para drift
    const driftHeld    = InputState.drift
    const speedOk      = Math.abs(mutableKart.currentSpeed) > mutableKart.maxSpeed * 0.25
    const canDrift     = driftHeld && isTurningRaw && speedOk

    if (canDrift) {
      if (!mutableKart.isDrifting) {
        mutableKart.isDrifting     = true
        mutableKart.driftDirection = InputState.right ? 1 : -1
      }
      mutableKart.driftTime += dt

      // Rampa suave para la rotación física del drift (tarda 0.6s en llegar al radio máximo)
      const driftPhysProgression = Math.min(1.0, mutableKart.driftTime / 0.6)
      const revMod   = mutableKart.currentSpeed < 0 ? -1 : 1
      const rotDelta = Quaternion.fromEulerDegrees(
        0,
        mutableKart.driftDirection * mutableKart.turnSpeed * 0.42 * driftPhysProgression * revMod * dt,
        0
      )
      transform.rotation = Quaternion.multiply(transform.rotation, rotDelta)
      if (!isAccelerating) mutableKart.currentSpeed *= (1 - 1.6 * dt)

    } else {
      // ── Giro normal con inercia del volante ──────────────────────────────
      // currentSteering ya viene suavizado desde el inicio del frame
      if (mutableKart.currentSpeed !== 0 && Math.abs(currentSteering) > 0.02) {
        const sf       = Math.abs(mutableKart.currentSpeed) / mutableKart.maxSpeed
        // Curva arcade: mayor giro a baja velocidad (x1.6), muy similar a alta velocidad (x1.4)
        const speedCurve = 1.6 - (sf * 0.2)
        const dynTurn  = mutableKart.turnSpeed * speedCurve
        const revMod   = mutableKart.currentSpeed < 0 ? -1 : 1
        const rotDelta = Quaternion.fromEulerDegrees(0, currentSteering * dynTurn * revMod * dt, 0)
        transform.rotation = Quaternion.multiply(transform.rotation, rotDelta)
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

    // Normalizar al eje Y (evita pitch/roll acumulado en el quaternión)
    const q      = transform.rotation
    const yaw    = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z))
    const yawDeg = yaw * (180 / Math.PI)
    transform.rotation = Quaternion.fromEulerDegrees(0, yawDeg, 0)

    // ── 6. MOVIMIENTO ─────────────────────────────────────────────────────
    const fwd = Vector3.rotate(Vector3.Forward(), transform.rotation)
    let moveX: number, moveZ: number

    if (mutableKart.isDrifting) {
      const side     = Vector3.rotate(Vector3.Right(), transform.rotation)
      const blend    = 0.28
      const driftDir = mutableKart.driftDirection
      moveX = (fwd.x * (1 - blend) + side.x * driftDir * blend) * mutableKart.currentSpeed * dt
      moveZ = (fwd.z * (1 - blend) + side.z * driftDir * blend) * mutableKart.currentSpeed * dt
    } else {
      moveX = fwd.x * mutableKart.currentSpeed * dt
      moveZ = fwd.z * mutableKart.currentSpeed * dt
    }

    transform.position.x = Math.max(2, Math.min(942, transform.position.x + moveX))
    transform.position.z = Math.max(2, Math.min(494, transform.position.z + moveZ))

    // ── 7. GRAVEDAD ───────────────────────────────────────────────────────
    const scaleMult = mutableKart.scale || 1.0
    const targetY = lastKnownGroundY + 0.05 * scaleMult
    if (isGrounded) {
      transform.position.y += (targetY - transform.position.y) * 0.6
    } else {
      transform.position.y -= 9.8 * dt
    }
    transform.position.y = Math.max(lastKnownGroundY - 3.0, transform.position.y)
    transform.position.y = Math.max(0.1, transform.position.y)

      // ── ACTUALIZAR ESTADO GLOBAL PARA MINIMAPA      // Compartir posición y tipo de vehículo con la UI
      RaceState.kartPositionX = transform.position.x
      RaceState.kartPositionZ = transform.position.z
      RaceState.vehicleType   = mutableKart.vehicleType

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
        mutableKart.lastSafeRotY = yawDeg
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
        // Base -90 en Y porque el .glb viene rotado
        const q_base = Quaternion.fromEulerDegrees(0, -90, 0)
        // Slip visual (Yaw)
        const q_slip = Quaternion.fromEulerDegrees(0, slipAngle, 0)
        // Inclinación (Roll) -> Se aplica sobre X en el espacio local
        const q_lean = Quaternion.fromEulerDegrees(leanAngle, 0, 0)
        
        // Multiplicar en orden: base * slip * lean
        modelT.rotation = Quaternion.multiply(Quaternion.multiply(q_base, q_slip), q_lean)
      }
    }

    // ── 9b. CHISPAS DE DRIFT + LUZ PULSANTE ──────────────────────────────────
    // Color como Mario Kart: Blanco/amarillo → Naranja → Azul/morado
    if (mutableKart.sparkEntity) {
      const ps = ParticleSystem.getMutableOrNull(mutableKart.sparkEntity as any)
      if (ps) {
        ps.active = mutableKart.isDrifting
        ps.rate   = mutableKart.isDrifting ? 55 : 0
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

      const ls = LightSource.getMutableOrNull(mutableKart.sparkEntity as any)
      if (ls) {
        ls.active    = mutableKart.isDrifting
        ls.intensity = mutableKart.isDrifting
          ? 3500 + Math.sin(Date.now() / 75) * 900   // pulso rápido
          : 0
        if (mutableKart.driftTime > 2.2) {
          ls.color = { r: 0.5, g: 0.2, b: 1.0 }   // morado
        } else if (mutableKart.driftTime > 0.9) {
          ls.color = { r: 1.0, g: 0.4, b: 0.0 }   // naranja
        } else {
          ls.color = { r: 1.0, g: 0.85, b: 0.2 }  // amarillo
        }
      }
    }

    // ── 10. CÁMARA BANDA ELÁSTICA ─────────────────────────────────────────
    // La cámara vive en espacio mundial (sin parent).
    // Cada frame: calculamos dónde DEBERÍA estar y la interpolamos hacia allí.
    //
    // Factor de posición 4.5 → la cámara alcanza el punto ideal en ~0.4s
    // Factor de rotación 8.0 → mira al kart más rápido que se mueve
    if (mutableKart.cameraPivotEntity) {
      const camT = Transform.getMutableOrNull(mutableKart.cameraPivotEntity as any)
      if (camT) {
        const scaleMult = mutableKart.scale || 1.0
        const backVec = Vector3.rotate(Vector3.Backward(), transform.rotation)
        const fwdVec  = Vector3.rotate(Vector3.Forward(),  transform.rotation)

        // Distancia dinámica escalada
        const camDist   = (7.0 + sf * 3.0) * scaleMult
        // Pull-back extra durante boost escalado
        const boostPull = mutableKart.boostTime > 0 ? mutableKart.boostTime * 1.5 * scaleMult : 0

        const idealPos  = Vector3.create(
          transform.position.x + backVec.x * (camDist + boostPull),
          transform.position.y + (3.2 + sf * 0.8) * scaleMult,
          transform.position.z + backVec.z * (camDist + boostPull)
        )
        const posFactor = Math.min(1, dt * 4.5)
        camT.position   = lerpV3(camT.position, idealPos, posFactor)

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
  }
}
