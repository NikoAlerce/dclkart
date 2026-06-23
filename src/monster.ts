import {
  engine, Transform, GltfContainer, Animator, ColliderLayer, MeshCollider,
  Raycast, RaycastResult, RaycastQueryType, PlayerIdentityData,
  InputAction, pointerEventsSystem, Entity
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { movePlayerTo } from '~system/RestrictedActions'
import { RaceState } from './raceState'

// ─── Monstruo biomecánico gigante que deambula por el escenario ───────────────
// Camina a destinos ALEATORIOS por todo el terreno, sigue la altura del piso, ESQUIVA
// montañas/edificios con un rayo frontal, y se lo puede MONTAR: clic para subir al lomo,
// y mientras estás sobre la plataforma del lomo te LLEVA (delta-carry) y caminás libre.
// Caés/saltás fuera del borde → dejás de ser llevado. Todo tuneable acá.

const MODEL_SRC   = 'assets/models/cck medio medio.glb'
const ANIM_CLIP   = 'chabon'   // clip de caminata dentro del GLB
const SCALE       = 16.0       // kaiju (~7.2m → ~116m de alto)
const SPEED       = 4.0        // velocidad de avance (m/s) — lumbering de gigante
const ANIM_SPEED  = 0.27       // velocidad de la animación (proporcional a SPEED para no patinar)
const TURN_RATE   = 0.8        // qué tan rápido rota hacia el rumbo (mayor = gira más ágil)
const YAW_OFFSET  = 90         // alinear la cara (patas delanteras, +X crudo → -X en DCL) con el avance
const FOOT_OFFSET = 1.1        // origen→pies (escala 1); 1.1 entierra un poco las patas (peso)
const ARRIVE_DIST = 14         // distancia para elegir un nuevo destino

// Plataforma sólida sobre el lomo (collider de caja). La malla animada daba colisiones
// erráticas; esta caja es predecible para pararse encima. Valores en espacio del modelo
// (se multiplican por SCALE). Si quedás flotando/hundido sobre el lomo, ajustá BACK_Y.
const BACK_Y      = 0.4        // altura del lomo donde te parás (raw)
const BACK_CX     = -0.7       // centro de la plataforma a lo largo de la columna (raw)
const BACK_LEN_X  = 3.4        // largo de la plataforma (a lo largo del cuerpo, raw)
const BACK_WID_Z  = 2.8        // ancho de la plataforma (raw)

// Zona de paseo (XZ): elige destinos aleatorios acá adentro → recorre todo el terreno.
const ROAM = { minX: -235, maxX: -30, minZ: -155, maxZ: 90 }

// Evasión de obstáculos (montañas/edificios/karts con colisión física)
const AVOID_DIST   = 120       // distancia de detección (m) — mayor que el ancho del gigante
const AVOID_HEIGHT = 28        // altura del rayo (m): detecta montañas/edificios; pasa por
                               // encima de arbolitos chicos (lógico para un gigante)
const AVOID_TURN   = 65        // cuántos grados gira para esquivar

function randTarget() {
  return {
    x: ROAM.minX + Math.random() * (ROAM.maxX - ROAM.minX),
    z: ROAM.minZ + Math.random() * (ROAM.maxZ - ROAM.minZ)
  }
}

// Diferencia angular más corta (grados), resultado en (-180, 180]
function angleDiff(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180
}

export function setupMonster(_arbolesEntity?: Entity, _screenVideo?: Entity) {
  const monster = engine.addEntity()
  // Sin collider de malla: sobre una malla ANIMADA da colisiones erráticas (pose de reposo,
  // 58k tris). La colisión para pararse encima la da la caja del lomo (abajo).
  GltfContainer.create(monster, { src: MODEL_SRC })
  Animator.create(monster, {
    states: [{ clip: ANIM_CLIP, playing: true, loop: true, speed: ANIM_SPEED, weight: 1.0 }]
  })

  const start = randTarget()
  Transform.create(monster, {
    position: Vector3.create(start.x, 30, start.z),
    scale:    Vector3.create(SCALE, SCALE, SCALE),
    rotation: Quaternion.Identity()
  })

  // Plataforma sólida sobre el lomo (parented → se mueve/gira con el monstruo).
  const back = engine.addEntity()
  Transform.create(back, {
    parent:   monster,
    position: Vector3.create(BACK_CX, BACK_Y, -0.14),  // centro del lomo (espacio del modelo)
    scale:    Vector3.create(BACK_LEN_X, 0.3, BACK_WID_Z)
  })
  MeshCollider.setBox(back, ColliderLayer.CL_PHYSICS)

  // Collider de CLICK (pointer) que cubre el cuerpo: clic → te sube al lomo.
  const clickCollider = engine.addEntity()
  Transform.create(clickCollider, {
    parent:   monster,
    position: Vector3.create(0, 0.5, 0),
    scale:    Vector3.create(3, 4, 3)
  })
  MeshCollider.setBox(clickCollider, ColliderLayer.CL_POINTER)
  pointerEventsSystem.onPointerDown(
    { entity: clickCollider, opts: { button: InputAction.IA_POINTER, hoverText: 'Subir al lomo', maxDistance: 120 } },
    () => {
      if (RaceState.isOccupied) return
      const t = Transform.get(monster)
      // Aterrizar un poco por ENCIMA del centro de la plataforma → cae sobre ella
      const localOffset = Vector3.create(BACK_CX * SCALE, (BACK_Y + 0.15) * SCALE + 3, -0.14 * SCALE)
      const world = Vector3.add(t.position, Vector3.rotate(localOffset, t.rotation))
      movePlayerTo({
        newRelativePosition: world,
        cameraTarget: Vector3.add(world, Vector3.rotate(Vector3.create(0, 0, 5), t.rotation))
      }).catch(() => {})
    }
  )

  // Sensor de PISO: rayo continuo hacia abajo para seguir el terreno.
  const floor = engine.addEntity()
  Transform.create(floor, { position: Vector3.create(start.x, 100, start.z) })
  Raycast.createOrReplace(floor, {
    direction:     { $case: 'globalDirection', globalDirection: Vector3.create(0, -1, 0) },
    maxDistance:   300,
    queryType:     RaycastQueryType.RQT_QUERY_ALL,
    continuous:    true,
    collisionMask: ColliderLayer.CL_PHYSICS
  })

  // Sensor FRONTAL: rayo continuo hacia el rumbo (localDirection sigue la rotación del sensor).
  const front = engine.addEntity()
  Transform.create(front, { position: Vector3.create(start.x, 12, start.z) })
  Raycast.createOrReplace(front, {
    direction:     { $case: 'localDirection', localDirection: Vector3.create(0, 0, 1) },
    maxDistance:   AVOID_DIST,
    queryType:     RaycastQueryType.RQT_QUERY_ALL,
    continuous:    true,
    collisionMask: ColliderLayer.CL_PHYSICS
  })

  let target     = randTarget()
  let currentYaw = 0      // rumbo de caminata actual (grados; dirección de avance)
  let groundY    = 20
  let avoidDir   = 0      // -1 izquierda / +1 derecha / 0 sin esquivar
  let stuckTimer = 0
  let lastX = start.x, lastZ = start.z
  // Pose ANTERIOR del monstruo, para llevar al jugador por delta sobre el lomo
  let prevX = start.x, prevZ = start.z, prevY = 30, prevYaw = YAW_OFFSET

  engine.addSystem((dt: number) => {
    const t = Transform.getMutableOrNull(monster)
    if (!t) return

    // ── PISO: mantener el sensor encima y leer el hit más alto (NO el monstruo ni su lomo) ──
    const ft = Transform.getMutableOrNull(floor)
    if (ft) { ft.position.x = t.position.x; ft.position.z = t.position.z; ft.position.y = t.position.y + 80 }
    const fr = RaycastResult.getOrNull(floor)
    if (fr && fr.hits.length > 0) {
      let best: number | null = null
      for (const h of fr.hits) {
        if (h.position &&
            h.entityId !== monster &&
            h.entityId !== back &&
            h.entityId !== engine.PlayerEntity &&
            !PlayerIdentityData.has(h.entityId as any)) {
          if (best === null || h.position.y > best) best = h.position.y
        }
      }
      if (best !== null) groundY = best
    }

    // ── EVASIÓN: posicionar y apuntar el sensor frontal al rumbo actual ──
    const frt = Transform.getMutableOrNull(front)
    if (frt) {
      frt.position.x = t.position.x
      frt.position.z = t.position.z
      frt.position.y = groundY + AVOID_HEIGHT
      frt.rotation   = Quaternion.fromEulerDegrees(0, currentYaw, 0)
    }
    let blockedDist: number | null = null
    const frontRes = RaycastResult.getOrNull(front)
    if (frontRes && frontRes.hits.length > 0) {
      for (const h of frontRes.hits) {
        if (h.entityId !== monster &&
            h.entityId !== back &&
            h.entityId !== engine.PlayerEntity &&
            !PlayerIdentityData.has(h.entityId as any) &&
            h.length != null) {
          if (blockedDist === null || h.length < blockedDist) blockedDist = h.length
        }
      }
    }
    const blocked = blockedDist !== null && blockedDist < AVOID_DIST

    // ── Elegir nuevo destino al llegar o si queda trabado ──
    const dx = target.x - t.position.x
    const dz = target.z - t.position.z
    const dist = Math.sqrt(dx * dx + dz * dz)

    const moved = Math.sqrt((t.position.x - lastX) ** 2 + (t.position.z - lastZ) ** 2)
    lastX = t.position.x; lastZ = t.position.z
    stuckTimer = moved < SPEED * dt * 0.3 ? stuckTimer + dt : 0

    if (dist < ARRIVE_DIST || stuckTimer > 3.0) {
      target = randTarget()
      avoidDir = 0
      stuckTimer = 0
    }

    // ── Rumbo deseado: hacia el destino, o esquivando si hay obstáculo ──
    const targetYaw = Math.atan2(target.x - t.position.x, target.z - t.position.z) * 180 / Math.PI
    let desiredYaw: number
    if (blocked) {
      if (avoidDir === 0) {
        const d = angleDiff(currentYaw, targetYaw)
        avoidDir = d !== 0 ? Math.sign(d) : (Math.random() < 0.5 ? -1 : 1)
      }
      desiredYaw = currentYaw + avoidDir * AVOID_TURN
    } else {
      avoidDir = 0
      desiredYaw = targetYaw
    }

    // ── Rotar suavemente el rumbo y avanzar ──
    currentYaw += angleDiff(currentYaw, desiredYaw) * Math.min(1, dt * TURN_RATE)
    const hr = currentYaw * Math.PI / 180
    t.position.x += Math.sin(hr) * SPEED * dt
    t.position.z += Math.cos(hr) * SPEED * dt

    // ── Mantener dentro de la zona de paseo ──
    if (t.position.x < ROAM.minX) t.position.x = ROAM.minX
    if (t.position.x > ROAM.maxX) t.position.x = ROAM.maxX
    if (t.position.z < ROAM.minZ) t.position.z = ROAM.minZ
    if (t.position.z > ROAM.maxZ) t.position.z = ROAM.maxZ

    // ── Orientar el modelo (cara hacia el avance) y pegar los pies al terreno ──
    const worldYaw = currentYaw + YAW_OFFSET
    t.rotation   = Quaternion.fromEulerDegrees(0, worldYaw, 0)
    t.position.y = groundY + FOOT_OFFSET * SCALE

    // ── LLEVAR AL JUGADOR sobre el lomo (delta-carry, SIN parentar) ───────────
    // Si el jugador está sobre la plataforma, le sumamos el desplazamiento + giro del
    // monstruo de este frame (preservando su propia caminata). Si camina fuera del
    // borde, deja de ser llevado y cae. Sin parenting → sin deformación ni teleports raros.
    const pT = Transform.getMutableOrNull(engine.PlayerEntity)
    if (pT) {
      // Posición del jugador relativa a la pose ANTERIOR del monstruo (donde lo dejamos)
      const invPrev = Quaternion.fromEulerDegrees(0, -prevYaw, 0)
      const rel = Vector3.rotate(
        Vector3.create(pT.position.x - prevX, pT.position.y - prevY, pT.position.z - prevZ),
        invPrev
      )
      const platTopY = (BACK_Y + 0.15) * SCALE
      const onXZ = Math.abs(rel.x - BACK_CX * SCALE) < BACK_LEN_X * SCALE / 2 &&
                   Math.abs(rel.z + 0.14 * SCALE) < BACK_WID_Z * SCALE / 2
      const dy = rel.y - platTopY
      if (onXZ && dy > -2.5 && dy < 4.0) {
        RaceState.ridingMonster = true
        // Girar al jugador alrededor del centro del monstruo por el delta de yaw, + trasladar
        const dRad = ((worldYaw - prevYaw) * Math.PI) / 180
        const rx = pT.position.x - prevX, rz = pT.position.z - prevZ
        const nx = prevX + (rx * Math.cos(dRad) + rz * Math.sin(dRad)) + (t.position.x - prevX)
        const nz = prevZ + (-rx * Math.sin(dRad) + rz * Math.cos(dRad)) + (t.position.z - prevZ)
        const ny = pT.position.y + (t.position.y - prevY)
        movePlayerTo({ newRelativePosition: Vector3.create(nx, ny, nz) }).catch(() => {})
      } else {
        RaceState.ridingMonster = false
      }
    }
    prevX = t.position.x; prevZ = t.position.z; prevY = t.position.y; prevYaw = worldYaw
  })
}
