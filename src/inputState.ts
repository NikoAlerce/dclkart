// inputState.ts
// ─── Capa de Input Desacoplada ───────────────────────────────────────────────
// Paso 4 del plan de arquitectura multijugador:
// Esta estructura separa la LECTURA de inputs de la EJECUCIÓN de físicas.
//
// En el futuro Colyseus:
//   - Este estado se serializa y envía al servidor cada ~50ms (20 ticks/seg)
//   - El servidor calcula la nueva posición autoritativa
//   - El cliente recibe la posición y aplica Lerp visual
//   - kartMovementSystem deja de leer inputSystem directamente y lee
//     la posición interpolada que dicta el servidor
//
// Por ahora: kartMovementSystem lee InputState local (comportamiento actual)
// ─────────────────────────────────────────────────────────────────────────────

export type KartInputPayload = {
  forward:    boolean
  backward:   boolean
  left:       boolean
  right:      boolean
  drift:      boolean   // Barra espaciadora — activa drift
  exit:       boolean
  thrustUp:   boolean   // E — subir (modo nave)
  thrustDown: boolean   // Q — bajar (modo nave)
  tick:       number
}

export const InputState: KartInputPayload = {
  forward:    false,
  backward:   false,
  left:       false,
  right:      false,
  drift:      false,
  exit:       false,
  thrustUp:   false,
  thrustDown: false,
  tick:       0
}
