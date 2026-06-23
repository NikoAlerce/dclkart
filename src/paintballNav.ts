// ─── Navmesh auto-muestreado + A* para los bots ───────────────────────────────
// Muestrea el piso del mapa con un pool de raycasts hacia abajo (descubre pisos,
// escaleras y niveles SOLO, sin que nadie tenga que mapear a mano). Arma un grafo
// de nodos caminables y resuelve caminos con A*. Solo lo usa el host (que simula
// los bots); si el muestreo no encuentra piso (coords sin calibrar), findPath()
// devuelve [] y los bots caen a su steering directo.

import { engine, Entity, Transform, Raycast, RaycastResult, RaycastQueryType, ColliderLayer, PlayerIdentityData, GltfContainer } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { ARENA_BOUNDS, ARENA_Y_SAMPLE } from './paintballArena'

type NavNode = { x: number; y: number; z: number; edges: number[] }

const CELL = 5.0 // tamaño de celda (m)
const STEP_MAX = 2.6 // desnivel máximo caminable entre celdas vecinas (escalones)
const POOL = 20 // raycasts simultáneos para muestrear

const nodes: NavNode[] = []
const cellNodes = new Map<string, number[]>() // "ix_iz" → índices de nodos
let ready = false
let started = false

// Pool de muestreo
const pool: Entity[] = []
let queue: Array<[number, number]> = [] // celdas (ix, iz) por muestrear
const poolCell: Array<[number, number] | null> = []

export function isNavReady(): boolean {
  return ready
}

/** Altura del piso caminable (Y) cerca de (x,z), eligiendo el nivel MÁS CERCANO a
 * currentY → soporta multinivel sin elegir techos. null si está fuera del navmesh.
 * Esta es la fuente de verdad para la altura de los bots (el navmesh ya muestreó el
 * piso real con raycasts una sola vez; leerlo evita el snap por-frame que glitchea). */
export function groundYAt(x: number, z: number, currentY: number): number | null {
  if (!ready || nodes.length === 0) return null
  const ix = Math.floor((x - ARENA_BOUNDS.minX) / CELL)
  const iz = Math.floor((z - ARENA_BOUNDS.minZ) / CELL)
  let best: number | null = null
  let bestD = Infinity
  // Celda + vecinas (robustez en bordes de celda)
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const list = cellNodes.get(ix + dx + '_' + (iz + dz))
      if (!list) continue
      for (const ni of list) {
        const d = Math.abs(nodes[ni].y - currentY)
        if (d < bestD) { bestD = d; best = nodes[ni].y }
      }
    }
  }
  return best
}

export function setupNav() {
  engine.addSystem(navSampleSystem)
}

/** Arranca el muestreo (lo llama el host una vez). Idempotente. */
export function startNavSampling() {
  if (started) return
  started = true

  const nx = Math.ceil((ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX) / CELL)
  const nz = Math.ceil((ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ) / CELL)
  queue = []
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) queue.push([ix, iz])
  }

  for (let i = 0; i < POOL; i++) {
    const e = engine.addEntity()
    Transform.create(e, { position: Vector3.create(0, -500, 0) })
    pool.push(e)
    poolCell.push(null)
  }
}

function cellWorld(ix: number, iz: number): { x: number; z: number } {
  return { x: ARENA_BOUNDS.minX + ix * CELL + CELL / 2, z: ARENA_BOUNDS.minZ + iz * CELL + CELL / 2 }
}

function recordCell(ix: number, iz: number, e: Entity) {
  const res = RaycastResult.getOrNull(e)
  if (!res || res.hits.length === 0) return
  // Niveles de piso distintos (multinivel) ignorando entidades dinámicas y no pertenecientes a la pista
  const ys: number[] = []
  for (const h of res.hits) {
    if (!h.position) continue
    if (h.entityId !== undefined) {
      if (PlayerIdentityData.has(h.entityId as Entity)) continue
      const gltf = GltfContainer.getOrNull(h.entityId as Entity)
      if (!gltf || !gltf.src || !gltf.src.toLowerCase().includes('track.glb')) {
        continue
      }
    }
    const y = h.position.y
    if (y < 95.0) continue // Ignorar pistas de carrera por debajo de la arena paintball
    if (!ys.some((v) => Math.abs(v - y) < 1.0)) ys.push(y)
  }
  if (ys.length === 0) return
  const w = cellWorld(ix, iz)
  const key = ix + '_' + iz
  const list = cellNodes.get(key) || []
  for (const y of ys) {
    const idx = nodes.length
    nodes.push({ x: w.x, y, z: w.z, edges: [] })
    list.push(idx)
  }
  cellNodes.set(key, list)
}

function buildEdges() {
  const nx = Math.ceil((ARENA_BOUNDS.maxX - ARENA_BOUNDS.minX) / CELL)
  const nz = Math.ceil((ARENA_BOUNDS.maxZ - ARENA_BOUNDS.minZ) / CELL)
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      const here = cellNodes.get(ix + '_' + iz)
      if (!here) continue
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dz === 0) continue
          const there = cellNodes.get(ix + dx + '_' + (iz + dz))
          if (!there) continue
          for (const a of here) {
            for (const b of there) {
              if (Math.abs(nodes[a].y - nodes[b].y) <= STEP_MAX) {
                if (!nodes[a].edges.includes(b)) nodes[a].edges.push(b)
              }
            }
          }
        }
      }
    }
  }
}

function navSampleSystem(_dt: number) {
  if (!started || ready) return

  for (let i = 0; i < pool.length; i++) {
    const e = pool[i]
    // Leer el resultado de la celda asignada el frame anterior
    if (poolCell[i]) {
      recordCell(poolCell[i]![0], poolCell[i]![1], e)
      poolCell[i] = null
    }
    // Asignar la próxima celda
    const next = queue.pop()
    if (next) {
      const w = cellWorld(next[0], next[1])
      const t = Transform.getMutable(e)
      t.position.x = w.x
      t.position.z = w.z
      t.position.y = ARENA_Y_SAMPLE.top
      Raycast.createOrReplace(e, {
        direction: { $case: 'globalDirection', globalDirection: Vector3.create(0, -1, 0) },
        maxDistance: ARENA_Y_SAMPLE.top - ARENA_Y_SAMPLE.bottom + 5,
        queryType: RaycastQueryType.RQT_QUERY_ALL,
        collisionMask: ColliderLayer.CL_PHYSICS,
        continuous: false
      })
      poolCell[i] = next
    }
  }

  // ¿Terminó? (queue vacía y nada pendiente de leer)
  if (queue.length === 0 && poolCell.every((c) => c === null)) {
    buildEdges()
    // Limpiar el pool de muestreo
    for (const e of pool) engine.removeEntity(e)
    pool.length = 0
    ready = nodes.length > 0
    started = ready // si no hay nodos, permitir re-intento (coords malas)
    console.log(`[NAV] Muestreo completo: ${nodes.length} nodos. Bounds: X[${ARENA_BOUNDS.minX}..${ARENA_BOUNDS.maxX}] Z[${ARENA_BOUNDS.minZ}..${ARENA_BOUNDS.maxZ}]. YSample: [${ARENA_Y_SAMPLE.bottom.toFixed(1)}..${ARENA_Y_SAMPLE.top.toFixed(1)}]. Ready=${ready}`)
  }
}

function nearestNode(p: Vector3): number {
  let best = -1
  let bestD = Infinity
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]
    const dx = n.x - p.x
    const dy = n.y - p.y
    const dz = n.z - p.z
    const d = dx * dx + dy * dy * 0.5 + dz * dz
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

function h(a: number, b: number): number {
  const na = nodes[a]
  const nb = nodes[b]
  return Math.sqrt((na.x - nb.x) ** 2 + (na.y - nb.y) ** 2 + (na.z - nb.z) ** 2)
}

/** Camino (lista de puntos mundo) desde `from` a `to`. [] si no hay navmesh/ruta. */
export function findPath(from: Vector3, to: Vector3): Vector3[] {
  if (!ready || nodes.length === 0) return []
  const start = nearestNode(from)
  const goal = nearestNode(to)
  if (start < 0 || goal < 0) return []
  if (start === goal) return [Vector3.create(nodes[goal].x, nodes[goal].y, nodes[goal].z)]

  const open = new Set<number>([start])
  const came = new Map<number, number>()
  const g = new Map<number, number>([[start, 0]])
  const f = new Map<number, number>([[start, h(start, goal)]])
  let guard = 0

  while (open.size > 0 && guard++ < 4000) {
    // nodo con menor f
    let cur = -1
    let curF = Infinity
    for (const n of open) {
      const fn = f.get(n) ?? Infinity
      if (fn < curF) {
        curF = fn
        cur = n
      }
    }
    if (cur === goal) {
      const path: Vector3[] = []
      let c: number | undefined = cur
      while (c !== undefined) {
        path.unshift(Vector3.create(nodes[c].x, nodes[c].y, nodes[c].z))
        c = came.get(c)
      }
      return path
    }
    open.delete(cur)
    for (const nb of nodes[cur].edges) {
      const tentative = (g.get(cur) ?? Infinity) + h(cur, nb)
      if (tentative < (g.get(nb) ?? Infinity)) {
        came.set(nb, cur)
        g.set(nb, tentative)
        f.set(nb, tentative + h(nb, goal))
        open.add(nb)
      }
    }
  }
  return []
}
