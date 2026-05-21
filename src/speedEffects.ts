/** Estado global de efectos de velocidad — actualizado por kartSystem, leído por UI */
export const SpeedEffects = {
  speedFactor: 0,    // 0..1 (velocidad actual / max velocidad)
  boostFlash:  0,    // 0..1 (destello al activar boost, decae rápido)
  boostActive: false,
  driftActive: false,
}
