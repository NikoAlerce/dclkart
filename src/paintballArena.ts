// ─── Config del campo de batalla (paintball area dentro de track.glb) ──────────
// Cada spawn point se calibra individualmente con un raycast vertical — el arena
// es multinivel, así que un solo probe central no sirve. Las XZ se editan a mano
// abajo; las Y se ajustan en runtime al primer collider que cada probe encuentra.

import { engine, Transform, Raycast, RaycastResult, RaycastQueryType, ColliderLayer, Entity, PointerEvents, GltfContainer } from '@dcl/sdk/ecs'
import { Vector3, Color4 } from '@dcl/sdk/math'
import { WORLD_Y_OFFSET } from './spawnConfig'
import { trackEntity } from './index'
import { isChildOf } from './utils'

// ── Colores de equipo (T = naranja, CT = celeste) ──────────────────────────────
export const TEAM_COLOR_T = Color4.create(1.0, 0.55, 0.1, 1)
export const TEAM_COLOR_CT = Color4.create(0.2, 0.6, 1.0, 1)

// Piso REAL del arena: los datos del PLAYER (DCL physics) muestran Y≈108-117 caminando.
// El piso real ronda 108.
const FALLBACK_FLOOR_Y = 58 + WORLD_Y_OFFSET // ≈ 108

export const ArenaCalibration = {
  floorY: FALLBACK_FLOOR_Y, // promedio aprox (uso informativo)
  ready: false
}

export function applyArenaCalibration(y: number) {
  if (!ArenaCalibration.ready || y < ArenaCalibration.floorY) {
    ArenaCalibration.floorY = y
  }
  ArenaCalibration.ready = true
}

export const ARENA_FLOOR_Y = FALLBACK_FLOOR_Y // alias para código viejo

// ── Centro aprox del mapa en XZ (sólo para info; el NPC vive aparte).
export const ARENA_CENTER = Vector3.create(2.4, FALLBACK_FLOOR_Y, 424.0)

// ── NPC recepcionista (FIJO — empty "NPC PAINTBALL" del track, REPOSICIONADO) ──
// Empty local (-65.774, 14.465, 231.356). Resuelto a mundo con el X-flip de DCL y el
// track en (-88, 60, 38.19): x = -88-(-65.774) = -22.23 ; y = 60+14.465 ; z = 38.19+231.356
export const ARENA_NPC = Vector3.create(-22.23, 72.97, 269.55) // -1.5 vs el empty: estaba flotando

// ── Spawns. .y inicial = fallback; cada uno se calibra individualmente.
export const TEAM_SPAWN_T = Vector3.create(2.4, FALLBACK_FLOOR_Y + 1, 280.0)
export const TEAM_SPAWN_CT = Vector3.create(2.4, FALLBACK_FLOOR_Y + 1, 560.0)
export const FFA_SPAWNS = [
  Vector3.create(-20.0, FALLBACK_FLOOR_Y + 1, 310.0),
  Vector3.create(25.0, FALLBACK_FLOOR_Y + 1, 360.0),
  Vector3.create(-15.0, FALLBACK_FLOOR_Y + 1, 430.0),
  Vector3.create(20.0, FALLBACK_FLOOR_Y + 1, 480.0),
  Vector3.create(0.0, FALLBACK_FLOOR_Y + 1, 530.0),
  Vector3.create(-25.0, FALLBACK_FLOOR_Y + 1, 400.0)
]

// ── Banda de geometría del dust a considerar como POSIBLE piso (coords de mundo) ──
// El dust es una ciudad multinivel (calles, casas con interiores, escaleras, balcones).
// Por debajo de ~73.5 está la pista de karts (otra cosa); por encima de ~115 es skybox/
// techos altos. Entre medio queda TODO lo caminable. NO filtramos por altura para decidir
// qué es piso — eso lo decide la ALCANZABILIDAD (flood-fill desde los spawns, estilo CS):
// es navegable solo lo que se puede pisar caminando desde un spawn. Así interiores/
// escaleras/balcones entran y los techos sueltos quedan afuera solos.
export const DUST_FLOOR_MIN = 73.5
export const DUST_FLOOR_MAX = 115.0

// ── Límites XZ del arena (para el navmesh). Ajustados al área jugable real del dust
// (X≈-120..60, Z≈300..572 según la topología) + margen. Antes era enorme (X[-250,100]
// Z[200,600]) y muestreaba geometría no-dust → nodos espurios/altos.
export const ARENA_BOUNDS = { minX: -140, maxX: 75, minZ: 265, maxZ: 585 }

// ── Rango vertical a muestrear (multinivel: pisos/escaleras/puentes).
// Los spawns van de Y=56.72 a Y=84.91 (raw, antes del offset). Con offset → 106..134.
export const ARENA_Y_SAMPLE = { top: FALLBACK_FLOOR_Y + 75, bottom: FALLBACK_FLOOR_Y - 38 }

// ─── Calibración por spawn ──────────────────────────────────────────────────────
// Lanza un raycast vertical sobre cada spawn point, desde Y alta hacia abajo.
// Cada Vector3 se actualiza con el hit más alto que encontró su columna. Esto
// es lo que necesita un mapa multinivel: cada punto encuentra SU piso, no el
// promedio de toda el arena.

type ProbeRef = { probe: Entity; target: Vector3 }

export function setupSpawnCalibration() {
  const points: Vector3[] = [TEAM_SPAWN_T, TEAM_SPAWN_CT, ...FFA_SPAWNS]
  const probes: ProbeRef[] = []

  for (const target of points) {
    const probe = engine.addEntity()
    Transform.create(probe, { position: Vector3.create(target.x, 300, target.z) })
    Raycast.createOrReplace(probe, {
      direction: { $case: 'globalDirection', globalDirection: Vector3.create(0, -1, 0) },
      maxDistance: 600,
      queryType: RaycastQueryType.RQT_QUERY_ALL,
      continuous: true,
      collisionMask: ColliderLayer.CL_PHYSICS
    })
    probes.push({ probe, target })
  }

  let remaining = probes.length
  const ys: number[] = []
  let elapsed = 0

  engine.addSystem((dt: number) => {
    if (remaining === 0) return
    elapsed += dt
    
    // A los 8 segundos de espera, aceptamos cualquier hit de fallback (ej: plataforma invisible)
    const forceFallback = elapsed > 8.0

    for (let i = probes.length - 1; i >= 0; i--) {
      const { probe, target } = probes[i]
      if (!RaycastResult.has(probe)) continue
      const r = RaycastResult.get(probe)
      if (r.hits.length === 0) continue

      // Tomar el hit más cercano al Y esperado del spawn point para soportar multinivel.
      // Priorizar track.glb; sólo aceptar otros si forceFallback es activo.
      let bestY: number | null = null
      let bestDist = Infinity
      for (const h of r.hits) {
        if (!h.position) continue
        if (h.entityId !== undefined) {
          if ((h.entityId as Entity) === engine.PlayerEntity) continue
          
          if (!forceFallback) {
            if (h.entityId !== trackEntity && !isChildOf(h.entityId as Entity, trackEntity)) {
              continue
            }
          }
          
          if (h.position.y < 70.0) continue // Ignorar pistas o colisiones debajo de la arena (ej: pista de carrera a Y=73)
          
          const dist = Math.abs(h.position.y - (target.y - 1.0)) // target.y tiene +1 de offset inicial
          if (dist < bestDist) {
            bestDist = dist
            bestY = h.position.y
          }
        }
      }

      if (bestY !== null || forceFallback) {
        const finalY = bestY !== null ? bestY : (target.y - 1.0)
        ;(target as any).y = finalY + 1.2
        ys.push(finalY)
        
        // Limpiar probe (solo si lo pudimos resolver o si venció el timeout)
        Raycast.deleteFrom(probe)
        RaycastResult.deleteFrom(probe)
        engine.removeEntity(probe)
        probes.splice(i, 1)
        remaining--
      }
    }

    if (remaining === 0 && ys.length > 0) {
      // Floor mínimo para nav / fallback (evita loops de teletransporte en multinivel)
      ys.sort((a, b) => a - b)
      ArenaCalibration.floorY = ys[0]
      ArenaCalibration.ready = true
    }
  })
}
