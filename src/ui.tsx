import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { engine, Transform } from '@dcl/sdk/ecs'
import { RaceState } from './raceState'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}

const uiComponent = () => {
  const playerTransform = Transform.has(engine.PlayerEntity) ? Transform.get(engine.PlayerEntity) : undefined
  const posX = playerTransform ? playerTransform.position.x.toFixed(2) : '0.00'
  const posY = playerTransform ? playerTransform.position.y.toFixed(2) : '0.00'
  const posZ = playerTransform ? playerTransform.position.z.toFixed(2) : '0.00'

  return (
    <UiEntity
      uiTransform={{ width: '100%', height: '100%', flexDirection: 'column' }}
    >
      {/* ── TOP RIGHT: COORDINATES DIAGNOSTIC PANEL ── */}
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 32, right: 32 },
          width: 240,
          height: 110,
          padding: 8,
          flexDirection: 'column',
          justifyContent: 'center',
        }}
        uiBackground={{ color: Color4.create(0.05, 0.05, 0.1, 0.8) }}
      >
        <Label
          value="👤 AVATAR COORDINATES"
          fontSize={10}
          color={Color4.create(0.4, 0.8, 1, 1)}
          uiTransform={{ width: '100%', height: 16 }}
        />
        <Label
          value={`X: ${posX}  Y: ${posY}  Z: ${posZ}`}
          fontSize={11}
          color={Color4.create(1, 1, 1, 1)}
          uiTransform={{ width: '100%', height: 18 }}
        />
        
        {/* Separator line */}
        <UiEntity uiTransform={{ width: '100%', height: 1, margin: { top: 4, bottom: 4 } }} uiBackground={{ color: Color4.create(1, 1, 1, 0.1) }} />
        
        <Label
          value="🛤️ TRACK ENTITY POSITION"
          fontSize={10}
          color={Color4.create(0.4, 1, 0.5, 1)}
          uiTransform={{ width: '100%', height: 16 }}
        />
        <Label
          value={`X: ${RaceState.trackX.toFixed(2)}  Y: ${RaceState.trackY.toFixed(2)}  Z: ${RaceState.trackZ.toFixed(2)}`}
          fontSize={11}
          color={Color4.create(1, 1, 1, 1)}
          uiTransform={{ width: '100%', height: 18 }}
        />
      </UiEntity>

      {/* ── TOP LEFT: DEBUG PANEL ── */}
      {RaceState.isOccupied && (
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 160, left: 32 },
          width: 320,
          height: 120,
          padding: 10,
          flexDirection: 'column',
          justifyContent: 'center',
        }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.75) }}
      >
        <Label
          value="🔍 DEBUG PHYSICS & COLLISION"
          fontSize={12}
          color={Color4.create(1, 0.4, 0.1, 1)}
          uiTransform={{ width: '100%', height: 20 }}
        />
        <Label
          value={`Pos: X=${RaceState.kartPositionX.toFixed(2)} Y=${RaceState.kartPositionY.toFixed(2)} Z=${RaceState.kartPositionZ.toFixed(2)}`}
          fontSize={10}
          color={Color4.create(1, 1, 1, 0.9)}
          uiTransform={{ width: '100%', height: 16 }}
        />
        <Label
          value={`Wall Hit Mesh: ${RaceState.debugLastWallHitName}`}
          fontSize={10}
          color={Color4.create(1, 1, 1, 0.9)}
          uiTransform={{ width: '100%', height: 16 }}
        />
        <Label
          value={`Dist: ${RaceState.debugLastWallHitDist.toFixed(2)}m | HitY: ${RaceState.debugLastWallHitY.toFixed(2)}`}
          fontSize={10}
          color={Color4.create(1, 1, 1, 0.9)}
          uiTransform={{ width: '100%', height: 16 }}
        />
        <Label
          value={`NormalY: ${RaceState.debugLastWallHitNormalY.toFixed(3)} | IsWall: ${RaceState.debugLastWallHitIsWall ? 'YES ❌' : 'NO'}`}
          fontSize={10}
          color={Color4.create(1, 1, 1, 0.9)}
          uiTransform={{ width: '100%', height: 16 }}
        />
      </UiEntity>
    )}

    {/* ── BOTTOM LEFT: CONTROLS ── */}
    {RaceState.isOccupied && (
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { bottom: 32, left: 32 },
          width: 240,
          height: RaceState.vehicleType === 'ship' ? 100 : 80,
          padding: 10,
          flexDirection: 'column',
          justifyContent: 'center',
        }}
        uiBackground={{ color: Color4.create(0, 0, 0, 0.45) }}
      >
        <Label
          value="🏎️  CONTROLS"
          fontSize={13}
          color={Color4.create(1, 0.9, 0.1, 1)}
          uiTransform={{ width: '100%', height: 22 }}
        />
        {RaceState.vehicleType === 'kart' ? (
          <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
            <Label value="[W A S D] Drive" fontSize={11} color={Color4.create(0.8, 0.8, 0.8, 0.8)} uiTransform={{ width: '100%', height: 16 }} />
            <Label value="[Space] Drift" fontSize={11} color={Color4.create(0.8, 0.8, 0.8, 0.8)} uiTransform={{ width: '100%', height: 16 }} />
          </UiEntity>
        ) : (
          <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
            <Label value="[W A S D] Fly" fontSize={11} color={Color4.create(0.8, 0.8, 0.8, 0.8)} uiTransform={{ width: '100%', height: 16 }} />
            <Label value="[Space] Ascend" fontSize={11} color={Color4.create(0.8, 0.8, 0.8, 0.8)} uiTransform={{ width: '100%', height: 16 }} />
            <Label value="[F] Descend" fontSize={11} color={Color4.create(0.8, 0.8, 0.8, 0.8)} uiTransform={{ width: '100%', height: 16 }} />
          </UiEntity>
        )}
        <Label value="[E] Exit" fontSize={11} color={Color4.create(0.8, 0.8, 0.8, 0.8)} uiTransform={{ width: '100%', height: 16 }} />
      </UiEntity>
    )}

    {/* ── BOTTOM RIGHT: CUSTOM MINIMAP ── */}
    {RaceState.isOccupied && (() => {
      // ── Coordenadas locales de los bordes del track (calibradas para base 35,20) ──
      const TRACK_MIN_X = -90
      const TRACK_MAX_X = 149
      const TRACK_MIN_Z = -253
      const TRACK_MAX_Z = 83

      // Mapear posición del kart a porcentaje en la imagen
      // En Blender: X crece hacia la derecha, Z crece hacia arriba
      const pctX = Math.max(0, Math.min(100, ((RaceState.kartPositionX - TRACK_MIN_X) / (TRACK_MAX_X - TRACK_MIN_X)) * 100))
      const pctZ = Math.max(0, Math.min(100, ((RaceState.kartPositionZ - TRACK_MIN_Z) / (TRACK_MAX_Z - TRACK_MIN_Z)) * 100))

      return (
        <UiEntity
          uiTransform={{
            positionType: 'absolute',
            position: { bottom: 32, right: 32 },
            width: 240,
            height: 140,
            flexDirection: 'column'
          }}
          uiBackground={{
            textureMode: 'stretch',
            texture: { src: 'images/minimap.png' }
          }}
        >
          {/* Borde exterior */}
          <UiEntity uiTransform={{ width: '100%', height: 2, positionType: 'absolute', position: { top: 0 } }} uiBackground={{ color: Color4.create(1, 1, 1, 0.5) }} />
          <UiEntity uiTransform={{ width: '100%', height: 2, positionType: 'absolute', position: { bottom: 0 } }} uiBackground={{ color: Color4.create(1, 1, 1, 0.5) }} />
          <UiEntity uiTransform={{ width: 2, height: '100%', positionType: 'absolute', position: { left: 0 } }} uiBackground={{ color: Color4.create(1, 1, 1, 0.5) }} />
          <UiEntity uiTransform={{ width: 2, height: '100%', positionType: 'absolute', position: { right: 0 } }} uiBackground={{ color: Color4.create(1, 1, 1, 0.5) }} />

          {/* KART BLIP - Punto rojo que sigue al auto */}
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { 
                left: `${pctX}%`, 
                bottom: `${pctZ}%`
              },
              margin: { left: -5, bottom: -5 },
              width: 10,
              height: 10
            }}
            uiBackground={{ color: Color4.create(1, 0.1, 0.1, 1) }}
          />
          {/* Glow del punto (más grande y translúcido) */}
          <UiEntity
            uiTransform={{
              positionType: 'absolute',
              position: { 
                left: `${pctX}%`, 
                bottom: `${pctZ}%`
              },
              margin: { left: -10, bottom: -10 },
              width: 20,
              height: 20
            }}
            uiBackground={{ color: Color4.create(1, 0.2, 0.2, 0.3) }}
          />
        </UiEntity>
      )
    })()}
  </UiEntity>
  )
}

