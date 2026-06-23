export const RaceState = {
  isOccupied: false,
  isTurboActive: false,
  ridingMonster: false,   // true mientras el jugador está montado sobre el monstruo
  // Posición en vivo del kart para el minimapa
  kartPositionX: 0,
  kartPositionY: 0,
  kartPositionZ: 0,
  vehicleType: 'kart',
  kartSpeedRatio: 0,
  justExitedKartTimer: 0,  // cooldown tras bajarse del kart (evita re-subir al toque)

  // Coordenadas de la pista para diagnóstico en UI
  trackX: 0,
  trackY: 0,
  trackZ: 0,

  // Variables de depuración para colisiones
  debugLastWallHitName: 'None',
  debugLastWallHitDist: 0,
  debugLastWallHitY: 0,
  debugLastWallHitNormalY: 0,
  debugLastWallHitIsWall: false
}
