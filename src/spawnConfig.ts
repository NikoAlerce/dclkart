import { Vector3 } from '@dcl/sdk/math'

// X/Z capturados caminando en Bevy hasta el parking lot.
// Y=15 es un fallback seguro: el ground probe lo corrige a la altura real del GLB.
export const SPAWN_POSITION      = Vector3.create(-187.2, 15.0, -20.4)
export const SPAWN_CAMERA_TARGET = Vector3.create(-187.2, 11.0, -15.4)
export const SPAWN_ROTATION_Y    = 0.0
