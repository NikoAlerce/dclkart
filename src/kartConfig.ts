import { Vector3 } from '@dcl/sdk/math'

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface KartConfig {
  id:         number    // 1-10 — también es el enumId de syncEntity (debe ser único y estable)
  modelPath:  string    // ruta al .glb dentro del proyecto
  spawnPos:   Vector3   // posición de largada en el mundo
  spawnRotY:  number    // rotación Y en grados (todos miran al mismo lado)
  scale?:     number    // multiplicador de escala opcional (por defecto 1.0)
}

// ─── Geometría de la grilla de largada ───────────────────────────────────────
// El kart original estaba en (366.3, 8.6, 316.2) con rotación Y=50°.
// Usamos esa posición como CENTRO de la fila delantera.
//
// Con rotación Y=50°:
//   Facing dir  : (sin50°, 0, cos50°) = ( 0.766, 0,  0.643)
//   Left dir    : (-cos50°, 0, sin50°) = (-0.643, 0,  0.766)
//   Back dir    : (-sin50°, 0,-cos50°) = (-0.766, 0, -0.643)
//
// 5 karts por fila, separados 2.5 m lateralmente (centrado en col=2).
// 2 filas separadas 4 m hacia atrás.

const BASE_X    = 366.3
const BASE_Y    = 8.6
const BASE_Z    = 316.2
const ROT_Y     = 50

const LAT_DX    = -0.643   // left_x  = -cos(50°)
const LAT_DZ    =  0.766   // left_z  =  sin(50°)
const BACK_DX   = -0.766   // back_x  = -sin(50°)
const BACK_DZ   = -0.643   // back_z  = -cos(50°)

const LATERAL   = 2.5      // separación lateral entre karts (m)
const ROW_GAP   = 4.0      // separación entre filas (m)

function kartPos(row: number, col: number): Vector3 {
  // col 0-4, centrado en col 2  →  offset lateral = (col-2) * LATERAL
  const lat  = (col - 2) * LATERAL
  const x = BASE_X + lat * LAT_DX  + row * ROW_GAP * BACK_DX
  const z = BASE_Z + lat * LAT_DZ  + row * ROW_GAP * BACK_DZ
  return Vector3.create(x, BASE_Y, z)
}

// ─── Configuración de los 10 karts ───────────────────────────────────────────
// Para añadir un kart nuevo:
//   1. Copiá el .glb a assets/models/kart<N>.glb
//   2. Descomentá (o copiá) la línea correspondiente aquí.
//
// IMPORTANTE: el campo `id` es el enumId de red → no lo cambies una vez publicado.

export const KART_CONFIGS: KartConfig[] = [
  // ── Fila delantera (1-5) ──────────────────────────────────────────────────
  { id: 1,  modelPath: 'assets/models/kart.glb',  spawnPos: kartPos(0, 0), spawnRotY: ROT_Y },
  { id: 2,  modelPath: 'assets/models/kart2.glb', spawnPos: kartPos(0, 1), spawnRotY: ROT_Y, scale: 3.0 },
  { id: 3,  modelPath: 'assets/models/kart3.glb', spawnPos: kartPos(0, 2), spawnRotY: ROT_Y, scale: 3.0 },
  { id: 4,  modelPath: 'assets/models/kart4.glb', spawnPos: kartPos(0, 3), spawnRotY: ROT_Y, scale: 3.0 },
  { id: 5,  modelPath: 'assets/models/kart5.glb', spawnPos: kartPos(0, 4), spawnRotY: ROT_Y },
  // ── Fila trasera (6-10) ───────────────────────────────────────────────────
  { id: 6,  modelPath: 'assets/models/kart6.glb', spawnPos: kartPos(1, 0), spawnRotY: ROT_Y },
  { id: 7,  modelPath: 'assets/models/kart7.glb', spawnPos: kartPos(1, 1), spawnRotY: ROT_Y },
  { id: 8,  modelPath: 'assets/models/kart8.glb', spawnPos: kartPos(1, 2), spawnRotY: ROT_Y },
  { id: 9,  modelPath: 'assets/models/kart9.glb', spawnPos: kartPos(1, 3), spawnRotY: ROT_Y },
  { id: 10, modelPath: 'assets/models/kart10.glb',spawnPos: kartPos(1, 4), spawnRotY: ROT_Y },
]
