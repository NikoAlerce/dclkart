import { Vector3 } from '@dcl/sdk/math'

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface KartConfig {
  id:           number    // 1-10 — también es el enumId de syncEntity (debe ser único y estable)
  modelPath:    string    // ruta al .glb dentro del proyecto
  spawnPos:     Vector3   // posición de largada en el mundo
  spawnRotY:    number    // rotación Y en grados (todos miran al mismo lado)
  scale?:       number    // multiplicador de escala visual/física (por defecto 1.0)
  vehicleType?: 'kart' | 'ship'  // 'ship' = modo nave: sin gravedad, E/Q para subir/bajar

  // ── Parámetros de manejo individuales (todos opcionales) ──────────────────
  // Si no los ponés, se usan los valores por defecto del kart estándar.
  // Ejemplos:
  //   Camión lento:  maxSpeed: 18, acceleration: 10, turnSpeed: 45, friction: 0.95
  //   Nave ágil:     maxSpeed: 50, acceleration: 35, turnSpeed: 100, friction: 0.6
  maxSpeed?:    number    // velocidad máxima en m/s        (default: 32)
  acceleration?:number    // aceleración                    (default: 20)
  friction?:    number    // rozamiento al soltar el gas     (default: 0.8)
  turnSpeed?:   number    // velocidad de giro en grados/s  (default: 75)
}

// ─── Valores por defecto de física ────────────────────────────────────────────
export const DEFAULT_PHYSICS = {
  maxSpeed:     32,
  acceleration: 20,
  friction:     0.8,
  turnSpeed:    75,
}

// ─── Geometría de la grilla de largada ───────────────────────────────────────
// El kart original estaba en (366.3, 8.6, 316.2) con rotación Y=50°.
//
// Con rotación Y=50°:
//   Facing dir  : (sin50°, 0, cos50°) = ( 0.766, 0,  0.643)
//   Left dir    : (-cos50°, 0, sin50°) = (-0.643, 0,  0.766)
//   Back dir    : (-sin50°, 0,-cos50°) = (-0.766, 0, -0.643)
//
// 5 karts por fila, separados lateralmente.
// 2 filas separadas hacia atrás.

const BASE_X    = -193.7
const BASE_Y    = 8.6
const BASE_Z    = -3.8
const ROT_Y     = 50

const LAT_DX    = -0.643   // left_x  = -cos(50°)
const LAT_DZ    =  0.766   // left_z  =  sin(50°)
const BACK_DX   = -0.766   // back_x  = -sin(50°)
const BACK_DZ   = -0.643   // back_z  = -cos(50°)

// Separación aumentada a 4.5m para que los karts grandes (scale 1.5) no se solapen
const LATERAL   = 4.5      // separación lateral entre karts (m)
const ROW_GAP   = 6.0      // separación entre filas (m)

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
//
// ┌─── EJEMPLO de kart personalizado ──────────────────────────────────────────┐
// │  { id: 2, modelPath: 'assets/models/kart2.glb',                           │
// │    spawnPos: Vector3.create(27.3, 9.1, 1.5), spawnRotY: 0.0,                             │
// │    ← 1.5× el tamaño normal                        │
// │    maxSpeed: 18,          ← más lento (camión)                            │
// │    acceleration: 10,      ← arranca despacio                              │
// │    turnSpeed: 45,         ← gira más lento                                │
// │    friction: 0.95 },      ← se frena más rápido                           │
// └─────────────────────────────────────────────────────────────────────────────┘

// Posiciones fijadas sobre el parking lot real (capturado en Bevy: spawn ~ -187, -20).
// Fila de 10 vehículos separados 3m sobre el eje X, a Z=-26 (al lado del spawn).
export const KART_CONFIGS: KartConfig[] = [
  { id: 1,  modelPath: 'assets/models/kart.glb',  spawnPos: Vector3.create(-200.5, 10.85, -26), spawnRotY: 0.0},
  { id: 2,  modelPath: 'assets/models/kart2.glb', spawnPos: Vector3.create(-197.5, 10.85, -26), spawnRotY: 0.0},
  { id: 3,  modelPath: 'assets/models/kart3.glb', spawnPos: Vector3.create(-194.5, 10.85, -26), spawnRotY: 0.0,
    vehicleType: 'ship',
    maxSpeed: 48, acceleration: 28, friction: 0.55, turnSpeed: 95 },
  { id: 4,  modelPath: 'assets/models/kart4.glb', spawnPos: Vector3.create(-191.5, 10.85, -26), spawnRotY: 0.0},
  { id: 5,  modelPath: 'assets/models/kart5.glb', spawnPos: Vector3.create(-188.5, 10.85, -26), spawnRotY: 0.0},
  { id: 6,  modelPath: 'assets/models/kart6.glb', spawnPos: Vector3.create(-185.5, 10.85, -26), spawnRotY: 0.0},
  { id: 7,  modelPath: 'assets/models/kart7.glb', spawnPos: Vector3.create(-182.5, 10.85, -26), spawnRotY: 0.0},
  { id: 8,  modelPath: 'assets/models/kart8.glb', spawnPos: Vector3.create(-179.5, 10.85, -26), spawnRotY: 0.0},
  { id: 9,  modelPath: 'assets/models/kart9.glb', spawnPos: Vector3.create(-176.5, 10.85, -26), spawnRotY: 0.0},
  { id: 10, modelPath: 'assets/models/kart10.glb',spawnPos: Vector3.create(-173.5, 10.85, -26), spawnRotY: 0.0},
]
