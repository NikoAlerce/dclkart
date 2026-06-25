import { Color3 } from '@dcl/sdk/math'

// ─── Estado del aerosol (lo lee la UI) ────────────────────────────────────────
// v1 EN-SESIÓN: los graffitis se sincronizan por syncEntity (los ven todos los que
// están en la sesión, incluso los que entran después) pero NO persisten entre
// sesiones — eso será el backend más adelante. Cupo con FIFO (el más viejo se borra).
export const GraffitiState = {
  sprayMode: false,     // ¿aerosol equipado/activo?
  selectedColor: 0,     // índice en GRAFFITI_PALETTE
  brushSize: 1.0,       // tamaño del spray (m)
  lastUiClickTime: 0    // anti-rebote: clickear la UI (paleta/botón) no debe pintar
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
