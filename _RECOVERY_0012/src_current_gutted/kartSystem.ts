    transform.position.y = Math.max(0.1, transform.position.y)

      // ── ACTUALIZAR ESTADO GLOBAL PARA MINIMAPA      // Compartir posición y tipo de vehículo con la UI
      RaceState.kartPositionX = transform.position.x
      RaceState.kartPositionY = transform.position.y
      RaceState.kartPositionZ = transform.position.z
      RaceState.vehicleType   = mutableKart.vehicleType
      RaceState.kartSpeedRatio = Math.abs(mutableKart.currentSpeed) / mutableKart.maxSpeed

      // ── SINCRONIZAR AVATAR OCULTO CON EL KART (para minimap nativo) ────
      // Cada 0.4s teletransportamos el avatar invisible a la posición del kart.
      // Así el minimapa nativo de DCL muestra la flechita siguiendo al auto.
      avatarSyncTimer += dt
      if (avatarSyncTimer >= AVATAR_SYNC_INTERVAL) {
        avatarSyncTimer = 0
        const kartPos = transform.position
        const fwd = Vector3.rotate(Vector3.Forward(), transform.rotation)
        movePlayerTo({
          newRelativePosition: Vector3.create(kartPos.x, kartPos.y, kartPos.z),
          cameraTarget: Vector3.create(kartPos.x + fwd.x * 5, kartPos.y + 1, kartPos.z + fwd.z * 5)
        }).catch(() => {})
      }

      // ── 8. CHECKPOINT ─────────────────────────────────────────────────────
    if (isGrounded && Math.abs(mutableKart.currentSpeed) > 2.0) {
      checkpointTimer += dt
      if (checkpointTimer >= 1.0) {
        checkpointTimer          = 0
        mutableKart.lastSafeX    = transform.position.x
        mutableKart.lastSafeY    = transform.position.y
        mutableKart.lastSafeZ    = transform.position.z