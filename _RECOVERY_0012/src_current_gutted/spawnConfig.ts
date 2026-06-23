import { Vector3 } from '@dcl/sdk/math'

// ─── Offset global de altura ──────────────────────────────────────────────────
// Toda la escena (track, karts, monstruo, spawn) se eleva esta cantidad en Y para
// quedar POR ENCIMA del terreno procedural de Decentraland (que no se puede apagar).
// Cambiá SOLO este número para subir/bajar todo el mundo de golpe.
export const WORLD_Y_OFFSET = 50

export const SPAWN_POSITION = Vector3.create(-197.4, 15.0 + WORLD_Y_OFFSET, 89.8)
export const SPAWN_CAMERA_TARGET = Vector3.create(-197.4, 15.0 + WORLD_Y_OFFSET, 94.8)
export const SPAWN_ROTATION_Y = 0.0
