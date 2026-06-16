export const RaceState = {
  isOccupied: false,
  isTurboActive: false,
  // Posición en vivo del kart para el minimapa
  kartPositionX: 0,
  kartPositionY: 0,
  kartPositionZ: 0,
  vehicleType: 'kart',
  kartSpeedRatio: 0,

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
