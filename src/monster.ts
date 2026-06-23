import {
  engine, Transform, GltfContainer, Animator, ColliderLayer, MeshCollider,
  Raycast, RaycastResult, RaycastQueryType, PlayerIdentityData,
  InputAction, pointerEventsSystem, Entity, MeshRenderer, Material,
  Tween, EasingFunction
} from '@dcl/sdk/ecs'
import { Vector3, Quaternion } from '@dcl/sdk/math'
import { syncEntity } from '@dcl/sdk/network'
import { movePlayerTo } from '~system/RestrictedActions'
import { RaceState } from './raceState'
import { isHost, SYNC_IDS } from './net'
import { WORLD_Y_OFFSET } from './spawnConfig'

// ─── Monstruo biomecánico gigante (montable) ──────────────────────────────────
// Camina a destinos aleatorios por el terreno y se lo puede MONTAR. El lomo es una
// PLATAFORMA (caja con collider) emparentada al monstruo: el motor de DCL lleva al
// avatar parado encima (igual que un ascensor), así podés CAMINAR LIBRE sobre el lomo.
//
// CLAVE (docs DCL — skills player-physics / animations-tweens): el Transform del jugador
// es read-only; NO se mueve al rider con movePlayerTo. Las plataformas móviles se mueven
// por TWEEN y el motor arrastra a quien esté parado encima. Por eso el monstruo avanza en
// tramos de Tween, y NO hay delta-carry. El Tween se SINCRONIZA: todos los clientes
// reproducen el MISMO movimiento desde la misma posición inicial → todos lo ven en el
// mismo lugar y cada cliente lleva a su propio avatar de forma nativa (podés montar a la vez).

const MODEL_SRC   = 'assets/models/cck medio medio.glb'
const ANIM_CLIP   = 'chabon'   // clip de caminata dentro del GLB
const SCALE       = 16.0       // kaiju (~7.2m → ~116m de alto)
const SPEED       = 4.0        // velocidad de avance (m/s) — calibrada con ANIM_SPEED (pies no patinan)
const ANIM_SPEED  = 0.27       // velocidad del clip de caminata (proporcional a SPEED → paso natural)
const YAW_OFFSET  = 90         // alinear la cara del modelo (+X crudo → -X en DCL) con el avance
const FOOT_OFFSET = 1.1        // origen→pies (escala 1); entierra un poco las patas (peso)
const ARRIVE_DIST = 14         // distancia para elegir un nuevo destino

// ── Movimiento por TWEEN en tramos SOLAPADOS (el motor lleva al rider; sin micro-frenos) ──
const LEG_DIST    = 14.0       // metros por tramo (más largo = menos reinicios de tween = más fluido)
const TURN_PER_LEG = 25        // giro máximo por tramo (la rotación va DENTRO del tween → suave)

// Plataforma sólida sobre el lomo (collider de caja, emparentada → se mueve/gira con
// el monstruo). La malla animada da colisiones erráticas; esta caja es predecible para
// pararse encima. Valores en espacio del modelo (se multiplican por SCALE).
// ⚠️ AFINAR VISUAL si quedás flotando/hundido al subir: BACK_Y (altura), BACK_CX (centro).
// Calibrado: 0.4 (cuello) → 0.5 (20cm flotando) → 0.488 (justo sobre el lomo).
const BACK_Y      = 0.488
const BACK_CX     = -0.7
const BACK_LEN_X  = 3.4
const BACK_WID_Z  = 2.8

// Piso mínimo: la isla jugable está elevada con WORLD_Y_OFFSET. El sensor de piso debe
// IGNORAR el terreno procedural de DCL (Y≈0) que no se puede apagar — si no, el monstruo
// cae ahí abajo y queda TAPADO bajo la isla. Solo aceptamos suelo a la altura de la isla.
const MIN_GROUND_Y = WORLD_Y_OFFSET + 8   // ≈ 58 (la isla/track ronda Y 60+)

// Zona de paseo (XZ): TODO el terreno (bounds del mapa según el minimapa: X[-538,278] Z[-205,611]).
// Deambula por todas partes y, con el sensor de piso, COPIA las irregularidades del terreno.
// Sobre el vacío flota a la altura mínima en vez de hundirse (MIN_GROUND_Y).
const ROAM = { minX: -500, maxX: 250, minZ: -190, maxZ: 590 }
// Posición inicial ALEATORIA: arranca en un punto al azar del terreno (distinto cada sesión).
// El host es quien manda; su posición/recorrido se propaga por el Tween sincronizado → todos
// los jugadores lo ven en el mismo lugar. (El raycast de spawn ignora su plataforma, así que
// aunque caiga cerca del estacionamiento no rompe el spawn del jugador.)
const START = Vector3.create(
  ROAM.minX + Math.random() * (ROAM.maxX - ROAM.minX),
  MIN_GROUND_Y + FOOT_OFFSET * SCALE,
  ROAM.minZ + Math.random() * (ROAM.maxZ - ROAM.minZ)
)

// Evasión de obstáculos (montañas/edificios con colisión; ignora árboles → los atraviesa)
const AVOID_DIST   = 120
const AVOID_HEIGHT = 28
const AVOID_TURN   = 65

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

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function setupMonster(arbolesEntity?: Entity, screenVideo?: Entity) {
  const monster = engine.addEntity()
  // Sin collider de malla: sobre una malla ANIMADA da colisiones erráticas. La colisión
  // para pararse encima la da la caja del lomo (abajo).
  GltfContainer.create(monster, { src: MODEL_SRC })
  Animator.create(monster, {
    states: [{ clip: ANIM_CLIP, playing: true, loop: true, speed: ANIM_SPEED, weight: 1.0 }]
  })
  Transform.create(monster, {
    position: Vector3.clone(START),
    scale:    Vector3.create(SCALE, SCALE, SCALE),
    rotation: Quaternion.fromEulerDegrees(0, YAW_OFFSET, 0)
  })

  // Tween placeholder para que el componente exista antes de syncEntity.
  Tween.setMove(monster, Vector3.clone(START), Vector3.create(START.x, START.y + 0.01, START.z), 1000, EasingFunction.EF_LINEAR)

  // Multiplayer: sincronizamos el TWEEN (no el Transform). Cada cliente reproduce EXACTAMENTE
  // el mismo movimiento (el random lo decide el host) → todos ven al monstruo igual y en el
  // mismo lugar, y el motor de cada cliente lleva a su propio rider. Sincronizar el Transform
  // (en vez del Tween) hacía que el CRDT lo reconciliara cada frame → ese era el tironeo.
  syncEntity(monster, [Tween.componentId], SYNC_IDS.monster)

  // ── TV NOVENTERA chica sobre el lomo (trompa) con el MISMO stream que la pantalla grande ──
  // A escala 0.3 (×SCALE) la TV mide ~altura de avatar. Reusa el VideoPlayer de screenVideo.
  // ⚠️ AFINAR VISUAL: TV_POS (que quede sobre el lomo, adelante), TV_ROT (pantalla hacia los riders).
  if (screenVideo !== undefined) {
    // El lomo (local X) va de ≈ -2.4 (TROMPA/frente, hacia donde camina) a +1.05 (culo).
    // La TV va en la trompa, mirando al CENTRO del lomo (donde están los riders).
    const TV_POS = Vector3.create(-2.6, BACK_Y, -0.14)       // trompa (frente, dir. de avance)
    const TV_ROT = Quaternion.fromEulerDegrees(0, -90, 0)    // pantalla hacia +X = centro/riders
    const TV_SCALE = Vector3.create(0.3, 0.3, 0.3)           // ≈ altura de avatar (×SCALE)
    const tvAnchor = engine.addEntity()
    Transform.create(tvAnchor, { parent: monster, position: TV_POS, rotation: TV_ROT, scale: TV_SCALE })
    GltfContainer.create(tvAnchor, { src: 'assets/models/screen.glb' })

    const tvVideo = engine.addEntity()
    Transform.create(tvVideo, {
      parent:   tvAnchor,
      position: Vector3.create(0, 0.2684, -0.008), // mismas coords relativas que la pantalla grande
      rotation: Quaternion.fromEulerDegrees(0, 180, 0),
      scale:    Vector3.create(-0.42, 0.32, 1.0)
    })
    MeshRenderer.setPlane(tvVideo)
    Material.setBasicMaterial(tvVideo, { texture: Material.Texture.Video({ videoPlayerEntity: screenVideo }) })
  }

  // ── Plataforma sólida del lomo (collider). El motor lleva al avatar parado encima. ──
  const back = engine.addEntity()
  Transform.create(back, {
    parent:   monster,
    position: Vector3.create(BACK_CX, BACK_Y, -0.14),
    scale:    Vector3.create(BACK_LEN_X, 0.3, BACK_WID_Z)
  })
  MeshCollider.setBox(back, ColliderLayer.CL_PHYSICS)

  // ── Collider de CLICK (pointer) que cubre el cuerpo: clic → te sube al lomo. ──
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
      if (RaceState.ridingMonster) return // ya estás arriba, no re-teletransportar
      const t = Transform.get(monster)
      // Aterrizar un poco por ENCIMA del centro de la plataforma → caés sobre ella.
      const localOffset = Vector3.create(BACK_CX * SCALE, (BACK_Y + 0.4) * SCALE, -0.14 * SCALE)
      const world = Vector3.add(t.position, Vector3.rotate(localOffset, t.rotation))
      movePlayerTo({
        newRelativePosition: world,
        cameraTarget: Vector3.add(world, Vector3.rotate(Vector3.create(0, 0, 5), t.rotation))
      }).catch(() => {})
    }
  )

  // ── Sensores (solo los usa el host para la IA). ──
  // Piso: rayo continuo hacia abajo para seguir el terreno.
  const floor = engine.addEntity()
  Transform.create(floor, { position: Vector3.create(START.x, 100, START.z) })
  Raycast.createOrReplace(floor, {
    direction:     { $case: 'globalDirection', globalDirection: Vector3.create(0, -1, 0) },
    maxDistance:   300,
    queryType:     RaycastQueryType.RQT_QUERY_ALL,
    continuous:    true,
    collisionMask: ColliderLayer.CL_PHYSICS
  })
  // Frontal: rayo continuo hacia el rumbo para esquivar montañas/edificios.
  const front = engine.addEntity()
  Transform.create(front, { position: Vector3.create(START.x, 12, START.z) })
  Raycast.createOrReplace(front, {
    direction:     { $case: 'localDirection', localDirection: Vector3.create(0, 0, 1) },
    maxDistance:   AVOID_DIST,
    queryType:     RaycastQueryType.RQT_QUERY_ALL,
    continuous:    true,
    collisionMask: ColliderLayer.CL_PHYSICS
  })

  // ── Estado de la IA (autoritativo en el host) ──
  let target     = randTarget()
  let currentYaw = 0                    // rumbo de avance (grados, sin YAW_OFFSET)
  let groundY    = MIN_GROUND_Y
  let avoidDir   = 0                    // -1 izq / +1 der / 0 sin esquivar
  let legActive  = false
  let legTimer   = 0                    // segundos restantes del tramo actual
  let wasHost    = false
  let ridingGrace = 0                   // grace para que ridingMonster no parpadee

  engine.addSystem((dt: number) => {
    const t = Transform.getOrNull(monster)
    if (!t) return
    const hosting = isHost()

    // Al tomar la posta de host, re-emitir un tramo desde la posición actual.
    if (hosting && !wasHost) legActive = false
    wasHost = hosting

    // ── IA: solo el host elige rumbo y emite los tramos de Tween (que se sincronizan). ──
    if (hosting) {
      const cur = t.position  // posición REAL actual (la mueve el tween) → re-emitir sin saltos

      // Sensores sobre la posición real.
      const ft = Transform.getMutableOrNull(floor)
      if (ft) { ft.position.x = cur.x; ft.position.z = cur.z; ft.position.y = cur.y + 80 }
      const frt = Transform.getMutableOrNull(front)
      if (frt) {
        frt.position.x = cur.x; frt.position.z = cur.z; frt.position.y = groundY + AVOID_HEIGHT
        frt.rotation   = Quaternion.fromEulerDegrees(0, currentYaw, 0)
      }

      // Leer piso (ignorando árboles, el propio monstruo y los jugadores) → el monstruo
      // COPIA las irregularidades del terreno (cada tramo apoya en el suelo real bajo él).
      const fr = RaycastResult.getOrNull(floor)
      if (fr && fr.hits.length > 0) {
        let best: number | null = null
        for (const h of fr.hits) {
          if (h.position &&
              h.position.y >= MIN_GROUND_Y &&        // ignorar el terreno procedural de DCL (Y≈0)
              h.entityId !== monster &&
              h.entityId !== back &&
              h.entityId !== arbolesEntity &&
              h.entityId !== engine.PlayerEntity &&
              !PlayerIdentityData.has(h.entityId as any)) {
            if (best === null || h.position.y > best) best = h.position.y
          }
        }
        groundY = best !== null ? best : Math.max(groundY, MIN_GROUND_Y)
      }

      // Próximo tramo: emitido ANTES de que termine el actual (solape) → sin micro-freno.
      // Arranca desde la posición REAL → fluido y sin saltos.
      legTimer -= dt
      if (!legActive || legTimer <= 0.2) {
        const dxt = target.x - cur.x
        const dzt = target.z - cur.z
        if (Math.sqrt(dxt * dxt + dzt * dzt) < ARRIVE_DIST) { target = randTarget(); avoidDir = 0 }

        // ¿Obstáculo adelante? (ignora árboles → los atraviesa)
        let blocked = false
        const frontRes = RaycastResult.getOrNull(front)
        if (frontRes && frontRes.hits.length > 0) {
          for (const h of frontRes.hits) {
            if (h.entityId !== monster &&
                h.entityId !== back &&
                h.entityId !== arbolesEntity &&
                h.entityId !== engine.PlayerEntity &&
                !PlayerIdentityData.has(h.entityId as any) &&
                h.length != null && h.length < AVOID_DIST) { blocked = true; break }
          }
        }

        const targetYaw = Math.atan2(target.x - cur.x, target.z - cur.z) * 180 / Math.PI
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

        // Ajuste de rumbo gradual; la rotación visual se suaviza por frame (arriba).
        const turn = Math.max(-TURN_PER_LEG, Math.min(TURN_PER_LEG, angleDiff(currentYaw, desiredYaw)))
        currentYaw += turn

        const hr = currentYaw * Math.PI / 180
        const nextX = clamp(cur.x + Math.sin(hr) * LEG_DIST, ROAM.minX, ROAM.maxX)
        const nextZ = clamp(cur.z + Math.cos(hr) * LEG_DIST, ROAM.minZ, ROAM.maxZ)
        const nextY = groundY + FOOT_OFFSET * SCALE
        const dist  = Math.sqrt((nextX - cur.x) ** 2 + (nextZ - cur.z) ** 2) || LEG_DIST
        const legMs = Math.max(300, (dist / SPEED) * 1000)

        // Tween SINCRONIZADO desde la posición REAL: mueve + rota en UNO (sin escribir el
        // Transform a mano → no pelea con el tween). Todos los clientes reproducen este mismo
        // tween → mismo movimiento + el motor lleva a cada rider sobre la plataforma.
        const startRot = Quaternion.create(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w)
        const faceQ    = Quaternion.fromEulerDegrees(0, currentYaw + YAW_OFFSET, 0)
        Tween.setMoveRotateScale(monster, {
          position: { start: Vector3.create(cur.x, cur.y, cur.z), end: Vector3.create(nextX, nextY, nextZ) },
          rotation: { start: startRot, end: faceQ },
          scale:    { start: Vector3.create(SCALE, SCALE, SCALE), end: Vector3.create(SCALE, SCALE, SCALE) },
          duration: legMs
        })

        legActive = true
        legTimer = legMs / 1000
      }
    }

    // ── Detección "estoy sobre el lomo" (corre en TODOS los clientes) ──
    // Solo para gatear el toggle de árboles (index.ts) y la excepción del rescate.
    // El acarreo del avatar lo hace el MOTOR sobre el collider — acá NO movemos al jugador.
    const pT = Transform.getOrNull(engine.PlayerEntity)
    if (pT) {
      const worldYaw = 2 * Math.atan2(t.rotation.y, t.rotation.w) * 180 / Math.PI
      const inv = Quaternion.fromEulerDegrees(0, -worldYaw, 0)
      const rel = Vector3.rotate(
        Vector3.create(pT.position.x - t.position.x, pT.position.y - t.position.y, pT.position.z - t.position.z),
        inv
      )
      const platTopY = (BACK_Y + 0.15) * SCALE
      const onXZ = Math.abs(rel.x - BACK_CX * SCALE) < (BACK_LEN_X * SCALE) / 2 + 2 &&
                   Math.abs(rel.z + 0.14 * SCALE) < (BACK_WID_Z * SCALE) / 2 + 2
      const dy = rel.y - platTopY
      if (onXZ && dy > -3.0 && dy < 8.0) ridingGrace = 0.6 // sobre el lomo → refrescar grace
      else ridingGrace = Math.max(0, ridingGrace - dt)     // afuera → decae (sin parpadeo)
      RaceState.ridingMonster = ridingGrace > 0
    } else {
      RaceState.ridingMonster = false
    }
  })
}
