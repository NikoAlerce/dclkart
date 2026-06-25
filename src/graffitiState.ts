import { Color3 } from '@dcl/sdk/math'

// ─── Estado del aerosol (lo lee la UI) ────────────────────────────────────────
// v1 EN-SESIÓN: los graffitis se sincronizan por syncEntity (los ven todos los que
// están en la sesión, incluso los que entran después) pero NO persisten entre
// sesiones — eso será el backend más adelante. Cupo con FIFO (el más viejo se borra).
export const GraffitiState = {
  sprayMode: false,     // ¿aerosol equipado/activo?
  selectedColor: 0,     // índice en GRAFFITI_PALETTE
  selectedBrush: 1,     // índice en GRAFFITI_BRUSHES (default: Suave)
  selectedSize: 1,      // índice en GRAFFITI_SIZES (default: M)
  rainbow: false,       // 🌈 el color cicla solo mientras trazás → degradé arcoíris
  eraser: false,        // 🧽 modo borrador: pintar borra en vez de pintar
  hoveredAuthor: '',    // 🖊 autor del graffiti que estás mirando (firma)
  lastUiClickTime: 0    // anti-rebote: clickear la UI (paleta/botón) no debe pintar
}

// Pinceles: de más DIFUSO (spray) a más DEFINIDO (bordes marcados) + Neón (brilla fuerte).
// Cada uno usa una textura de mancha. `glow` = emisividad (cuánto brilla).
export const GRAFFITI_BRUSHES: { name: string; tex: string; glow: number }[] = [
  { name: 'Spray',    tex: 'assets/textures/glow_mist.png',  glow: 0.55 }, // muy difuso
  { name: 'Suave',    tex: 'assets/textures/glow_soft.png',  glow: 0.40 }, // medio
  { name: 'Definido', tex: 'assets/textures/glow_sharp.png', glow: 0.25 }, // bordes marcados
  { name: 'Neón',     tex: 'assets/textures/glow_soft.png',  glow: 3.0 }   // brilla en la oscuridad
]

// Tamaños del trazo (metros, lado del plano).
export const GRAFFITI_SIZES: number[] = [0.5, 1.0, 2.0, 3.5]
export const GRAFFITI_SIZE_LABELS: string[] = ['S', 'M', 'L', 'XL']

// ─── Side-game "Tag the City" (se entra hablando con el NPC) ──────────────────
export const GraffitiMission = {
  inviteOpen: false,  // modal del NPC abierto
  active: false,      // misión en curso
  tagged: 0,          // spots tagueados
  total: 0,           // spots totales
  timeLeft: 0,        // segundos restantes
  completed: false,   // ¿completada?
  resultMsg: ''       // mensaje de resultado
}

// Paleta de colores del spray.
export const GRAFFITI_PALETTE: Color3[] = [
  Color3.create(0.95, 0.15, 0.15), // 0 rojo
  Color3.create(1.00, 0.50, 0.05), // 1 naranja
  Color3.create(1.00, 0.90, 0.10), // 2 amarillo
  Color3.create(0.20, 0.90, 0.25), // 3 verde
  Color3.create(0.10, 0.85, 0.92), // 4 cyan
  Color3.create(0.20, 0.45, 1.00), // 5 azul
  Color3.create(0.62, 0.20, 0.95), // 6 violeta
  Color3.create(1.00, 0.35, 0.72), // 7 rosa
  Color3.create(0.98, 0.98, 0.98), // 8 blanco
  Color3.create(0.04, 0.04, 0.06)  // 9 negro
]
