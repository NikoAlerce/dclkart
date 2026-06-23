// ─── Paintball — Paleta de colores de pintura ────────────────────────────────
// Cada tirador (jugador y bots) tiene un color de pintura propio. Los tracers,
// salpicaduras, explosiones y el muzzle flash usan el color del tirador, así el
// campo se llena de pintura multicolor.

import { Color4 } from '@dcl/sdk/math'

export type PaintColor = {
  name: string
  /** Color base (con algo de alpha para splats/decals) */
  albedo: Color4
  /** Color de emisión (glow) — full alpha */
  emissive: Color4
}

function mk(name: string, r: number, g: number, b: number): PaintColor {
  return {
    name,
    albedo: Color4.create(r, g, b, 0.95),
    emissive: Color4.create(r, g, b, 1)
  }
}

// Paleta de pintura SÚPER saturada y vibrante (neón). Cada tirador agarra una.
export const PAINT_PALETTE: PaintColor[] = [
  mk('Magenta',    1.0,  0.0,  0.62),
  mk('Cyan',       0.0,  0.95, 1.0),
  mk('Orange',     1.0,  0.38, 0.0),
  mk('Purple',     0.65, 0.0,  1.0),
  mk('Acid',       0.6,  1.0,  0.0),
  mk('Red',        1.0,  0.04, 0.12),
  mk('Blue',       0.05, 0.32, 1.0),
  mk('Yellow',     1.0,  0.92, 0.0)
]

// Color firma del jugador: verde volt vibrante, distinto del resto del palette
export const PLAYER_PAINT: PaintColor = mk('Volt', 0.45, 1.0, 0.0)

// Color "tóxico" del monstruo (verde enfermo apagado)
export const MONSTER_PAINT: PaintColor = mk('Toxic', 0.45, 0.7, 0.15)

let _botColorCursor = Math.floor(Math.random() * PAINT_PALETTE.length)

/** Devuelve un color del palette rotando, para que los bots no repitan tanto. */
export function nextBotPaint(): PaintColor {
  const c = PAINT_PALETTE[_botColorCursor % PAINT_PALETTE.length]
  _botColorCursor++
  return c
}
