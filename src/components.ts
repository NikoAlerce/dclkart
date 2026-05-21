import { Schemas, engine } from '@dcl/sdk/ecs'

export const Spinner = engine.defineComponent('spinner', { speed: Schemas.Number })
export const Cube    = engine.defineComponent('cube-id', {})

export const KartData = engine.defineComponent('KartData', {
  // ── Física base ───────────────────────────────────────────────────────────
  currentSpeed:      Schemas.Float,
  maxSpeed:          Schemas.Float,
  acceleration:      Schemas.Float,
  friction:          Schemas.Float,
  turnSpeed:         Schemas.Float,
  isOccupied:        Schemas.Boolean,
  // ── Sistema de drift ─────────────────────────────────────────────────────
  isDrifting:        Schemas.Boolean,
  driftTime:         Schemas.Float,
  driftDirection:    Schemas.Float,
  boostTime:         Schemas.Float,
  // ── Checkpoint de seguridad (respawn) ────────────────────────────────────
  // Posición y rotación del último punto seguro sobre el asfalto.
  // Se actualiza cada segundo cuando el kart está grounded y en movimiento.
  lastSafeX:         Schemas.Float,
  lastSafeY:         Schemas.Float,
  lastSafeZ:         Schemas.Float,
  lastSafeRotY:      Schemas.Float,
  // ── Entidades hijas ──────────────────────────────────────────────────────
  pilotEntity:        Schemas.Optional(Schemas.Entity),
  cameraPivotEntity:  Schemas.Optional(Schemas.Entity),
  modelEntity:        Schemas.Optional(Schemas.Entity),
  floorSensorEntity:  Schemas.Optional(Schemas.Entity),
  wallSensorEntity:   Schemas.Optional(Schemas.Entity),
  sparkEntity:        Schemas.Optional(Schemas.Entity),
  hideAreaEntity:     Schemas.Optional(Schemas.Entity)
})