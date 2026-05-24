export enum RacePhase {
  LOBBY,
  COUNTDOWN,
  RACING,
  FINISHED
}

export const RaceState = {
  phase: RacePhase.LOBBY,
  currentLap: 1,
  maxLaps: 3,
  
  // Usamos un Set para que no importe el orden o nombre de los checkpoints en Blender.
  // El jugador solo debe coleccionar 4 checkpoints únicos por vuelta.
  currentLapCheckpoints: new Set<number>(),
  totalCheckpoints: 4,
  // Posición en vivo del kart para el minimapa
  kartPositionX: 0,
  kartPositionZ: 0,
  vehicleType: 'kart',
  
  countdownTimer: 3,  // 3... 2... 1...
  
  // Para mostrar UI popups
  showCheckpointText: false,
  checkpointTextTimer: 0,
  
  startCountdown() {
    this.phase = RacePhase.COUNTDOWN
    this.countdownTimer = 3
    this.currentLap = 1
    this.currentLapCheckpoints.clear()
    this.showCheckpointText = false
  },
  
  passCheckpoint(index: number) {
    if (this.phase !== RacePhase.RACING) return

    // Si es un checkpoint nuevo en esta vuelta, lo agregamos
    if (!this.currentLapCheckpoints.has(index)) {
      this.currentLapCheckpoints.add(index)
      console.log(`[RACE] ¡Checkpoint ${index} alcanzado! Progreso: ${this.currentLapCheckpoints.size}/${this.totalCheckpoints}`)
      
      // Animación UI (Pop-up en pantalla)
      this.showCheckpointText = true
      this.checkpointTextTimer = 1.5 // Mostrar por 1.5 segundos
      
      // Si ya recolectamos todos los checkpoints de la pista
      if (this.currentLapCheckpoints.size >= this.totalCheckpoints) {
        this.currentLapCheckpoints.clear() // Reseteamos para la siguiente vuelta
        this.currentLap++
        console.log(`[RACE] ¡Vuelta ${this.currentLap}/${this.maxLaps} completada!`)
        
        // Si cruzó la última vuelta
        if (this.currentLap > this.maxLaps) {
          this.phase = RacePhase.FINISHED
          console.log(`[RACE] ¡CARRERA TERMINADA!`)
        }
      }
    }
  }
}
