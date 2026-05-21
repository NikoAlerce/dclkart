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
  lastSafeX:         Schemas.Float,
  lastSafeY:         Schemas.Float,
  lastSafeZ:         Schemas.Float,
  lastSafeRotY:      Schemas.Float,
  // ── Entidades hijas (solo locales, no se sincronizan) ─────────────────────
  pilotEntity:        Schemas.Optional(Schemas.Entity),
  cameraPivotEntity:  Schemas.Optional(Schemas.Entity),
  modelEntity:        Schemas.Optional(Schemas.Entity),
  floorSensorEntity:  Schemas.Optional(Schemas.Entity),
  wallSensorEntity:   Schemas.Optional(Schemas.Entity),
  sparkEntity:        Schemas.Optional(Schemas.Entity),
  hideAreaEntity:     Schemas.Optional(Schemas.Entity),
  scale:              Schemas.Float
})

// ─── KartOwner: quién está manejando este kart (sincronizado en red) ──────────
// ownerId = '' → kart libre
// ownerId = address del jugador → kart ocupado por ese jugador
export const KartOwner = engine.defineComponent('KartOwner', {
  ownerId: Schemas.String
})