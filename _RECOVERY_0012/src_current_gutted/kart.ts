
      // Reclamar el kart: sincronizado para que todos vean que está ocupado
      const myId = myProfile?.userId ?? 'local'
      ownership.ownerId   = myId
      kartData.isOccupied = true
      RaceState.isOccupied = true

      const kartTransform = Transform.get(kartEntity)

      // ── PASO 1: Ocultar Avatar y bloquear controles ──────────────────────
      InputModifier.createOrReplace(engine.PlayerEntity, {
        mode: InputModifier.Mode.Standard({ disableAll: true })
      })

      const hideAreaEntity = engine.addEntity()
      Transform.create(hideAreaEntity, {
        parent:   engine.PlayerEntity,
        position: Vector3.Zero()
      })
      AvatarModifierArea.create(hideAreaEntity, {
        area:      Vector3.create(4, 4, 4),
        modifiers: [AvatarModifierType.AMT_HIDE_AVATARS],
        excludeIds: []
      })
      kartData.hideAreaEntity = hideAreaEntity

      // ── PASO 1.5: Registrar posición actual como checkpoint seguro ───────
      kartData.currentSpeed = 0
      kartData.lastSafeX    = kartTransform.position.x
      kartData.lastSafeY    = kartTransform.position.y
      kartData.lastSafeZ    = kartTransform.position.z
      const euler           = Quaternion.toEulerAngles(kartTransform.rotation)
      kartData.lastSafeRotY = euler.y

      // Quitar collider mientras manejás (el raycast de pared no se rebota contra sí mismo)
      MeshCollider.deleteFrom(kartCollider)

      // ── PASO 2: Cámara virtual banda elástica ────────────────────────────
      const bwd = Vector3.rotate(Vector3.Backward(), kartTransform.rotation)
      const cameraPivot = engine.addEntity()
      Transform.create(cameraPivot, {