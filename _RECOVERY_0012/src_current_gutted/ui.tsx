
      {/* ── BOTTOM RIGHT: CUSTOM MINIMAP ── */}
      {(() => {
        // ── Bordes en coords world XZ = ventana exacta de images/minimap.png ──
        const TRACK_MIN_X = -466
        const TRACK_MAX_X = 192
        const TRACK_MIN_Z = -300
        const TRACK_MAX_Z = 358

        // Posición a mostrar: el KART si vas manejando; si no, el AVATAR a pie.
        const wx = RaceState.isOccupied ? RaceState.kartPositionX : (playerTransform ? playerTransform.position.x : TRACK_MIN_X)
        const wz = RaceState.isOccupied ? RaceState.kartPositionZ : (playerTransform ? playerTransform.position.z : TRACK_MIN_Z)
        const pctX = Math.max(0, Math.min(100, ((wx - TRACK_MIN_X) / (TRACK_MAX_X - TRACK_MIN_X)) * 100))
        const pctZ = Math.max(0, Math.min(100, ((wz - TRACK_MIN_Z) / (TRACK_MAX_Z - TRACK_MIN_Z)) * 100))

        return (
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { bottom: 32, right: 32 },
              width: 320, height: 320,
              flexDirection: 'column'
            }}
            uiBackground={{ textureMode: 'stretch', texture: { src: 'images/minimap.png' } }}
          >
            {/* Borde exterior */}
            <UiEntity uiTransform={{ width: '100%', height: 2, positionType: 'absolute', position: { top: 0 } }}    uiBackground={{ color: Color4.create(1, 1, 1, 0.5) }} />
            <UiEntity uiTransform={{ width: '100%', height: 2, positionType: 'absolute', position: { bottom: 0 } }} uiBackground={{ color: Color4.create(1, 1, 1, 0.5) }} />
            <UiEntity uiTransform={{ width: 2, height: '100%', positionType: 'absolute', position: { left: 0 } }}   uiBackground={{ color: Color4.create(1, 1, 1, 0.5) }} />
            <UiEntity uiTransform={{ width: 2, height: '100%', positionType: 'absolute', position: { right: 0 } }}  uiBackground={{ color: Color4.create(1, 1, 1, 0.5) }} />
