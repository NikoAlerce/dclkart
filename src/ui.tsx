import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { InputState } from './inputState'
import { RaceState, RacePhase } from './raceState'

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}

const uiComponent = () => (
  <UiEntity
    uiTransform={{ width: '100%', height: '100%', flexDirection: 'column' }}
  >
    {/* ── CENTRAL SPLASH SCREENS (COUNTDOWN & FINISH) ── */}
    {RaceState.phase === RacePhase.COUNTDOWN && (
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: '25%', left: '50%' },
          margin: { left: -200 }, // Center horizontally (width 400 / 2)
          width: 400,
          height: 220,
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20
        }}
        uiBackground={{
          color: Color4.create(0.05, 0.05, 0.05, 0.95), // Darker, sleeker background
        }}
      >
        {/* Glow Top Accent */}
        <UiEntity uiTransform={{ width: '100%', height: 4, positionType: 'absolute', position: { top: 0 } }} uiBackground={{ color: Color4.create(0.2, 0.8, 1.0, 1) }} />
        
        {/* Luces del Semáforo Premium */}
        <UiEntity
          uiTransform={{ width: '80%', height: 70, flexDirection: 'row', justifyContent: 'space-between', margin: { bottom: 25, top: 10 } }}
        >
          {/* Luz Roja */}
          <UiEntity 
            uiTransform={{ width: 60, height: 60 }} 
            uiBackground={{ color: RaceState.countdownTimer > 2 ? Color4.create(1, 0.2, 0.2, 1) : Color4.create(0.1, 0, 0, 1) }} 
          />
          {/* Luz Amarilla */}
          <UiEntity 
            uiTransform={{ width: 60, height: 60 }} 
            uiBackground={{ color: RaceState.countdownTimer <= 2 && RaceState.countdownTimer > 1 ? Color4.create(1, 0.9, 0.1, 1) : Color4.create(0.1, 0.1, 0, 1) }} 
          />
          {/* Luz Verde */}
          <UiEntity 
            uiTransform={{ width: 60, height: 60 }} 
            uiBackground={{ color: RaceState.countdownTimer <= 1 ? Color4.create(0.1, 1, 0.3, 1) : Color4.create(0, 0.1, 0, 1) }} 
          />
        </UiEntity>

        <Label
          value={Math.ceil(RaceState.countdownTimer) > 0 ? Math.ceil(RaceState.countdownTimer).toString() : "GO!"}
          fontSize={100}
          color={Math.ceil(RaceState.countdownTimer) > 0 ? Color4.create(1, 1, 1, 0.9) : Color4.create(0.1, 1, 0.3, 1)}
          textAlign="middle-center"
        />
      </UiEntity>
    )}

    {RaceState.phase === RacePhase.FINISHED && (
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: '40%', left: '0%' },
          width: '100%',
          height: 200,
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center'
        }}
      >
        <Label
          value="FINISH!"
          fontSize={100}
          color={Color4.Yellow()}
          textAlign="middle-center"
        />
      </UiEntity>
    )}

    {/* ── CHECKPOINT POPUP ── */}
    {RaceState.showCheckpointText && (
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: '20%', left: '50%' },
          margin: { left: -250 },
          width: 500,
          height: 100,
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center'
        }}
      >
        <Label
          value={`CHECKPOINT ${RaceState.currentLapCheckpoints.size}/${RaceState.totalCheckpoints}`}
          fontSize={50}
          color={Color4.create(1, 0.8, 0.1, 1)} // Vibrant arcade yellow
          textAlign="middle-center"
        />
      </UiEntity>
    )}

    {/* ── TOP RIGHT: LAPS ── */}
    {RaceState.phase !== RacePhase.LOBBY && (
      <UiEntity
        uiTransform={{
          positionType: 'absolute',
          position: { top: 32, right: 32 },
          width: 200,
          height: 70,
          padding: 10,
          flexDirection: 'column',
          justifyContent: 'center',
        }}
        uiBackground={{ color: Color4.create(0.05, 0.05, 0.05, 0.9) }}
      >
        {/* Glow Left Accent */}
        <UiEntity uiTransform={{ width: 4, height: '100%', positionType: 'absolute', position: { left: 0 } }} uiBackground={{ color: Color4.create(1, 0.2, 0.2, 1) }} />
        
        <Label
          value={`LAP`}
          fontSize={16}
          color={Color4.create(0.7, 0.7, 0.7, 1)}
          textAlign="middle-center"
          uiTransform={{ margin: { top: -10 } }}
        />
        <Label
          value={`${RaceState.currentLap} / ${RaceState.maxLaps}`}
          fontSize={36}
          color={Color4.White()}
          textAlign="middle-center"
          uiTransform={{ margin: { top: -5 } }}
        />
      </UiEntity>
    )}

    {/* ── BOTTOM LEFT: CONTROLS ── */}
    {RaceState.phase !== RacePhase.LOBBY && (
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
          value="🏎️  CONTROLES"
          fontSize={13}
          color={Color4.create(1, 0.9, 0.1, 1)}
          uiTransform={{ width: '100%', height: 22 }}
        />
        {RaceState.vehicleType === 'kart' ? (
          <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
            <Label value="[W A S D] Manejar" fontSize={11} color={Color4.create(0.8, 0.8, 0.8, 0.8)} uiTransform={{ width: '100%', height: 16 }} />
            <Label value="[Espacio] Derrapar" fontSize={11} color={Color4.create(0.8, 0.8, 0.8, 0.8)} uiTransform={{ width: '100%', height: 16 }} />
          </UiEntity>
        ) : (
          <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
            <Label value="[W A S D] Navegar" fontSize={11} color={Color4.create(0.8, 0.8, 0.8, 0.8)} uiTransform={{ width: '100%', height: 16 }} />
            <Label value="[Espacio] Subir" fontSize={11} color={Color4.create(0.8, 0.8, 0.8, 0.8)} uiTransform={{ width: '100%', height: 16 }} />
            <Label value="[F] Bajar" fontSize={11} color={Color4.create(0.8, 0.8, 0.8, 0.8)} uiTransform={{ width: '100%', height: 16 }} />
          </UiEntity>
        )}
        <Label value="[E] Salir" fontSize={11} color={Color4.create(0.8, 0.8, 0.8, 0.8)} uiTransform={{ width: '100%', height: 16 }} />
      </UiEntity>
    )}

    {/* ── BOTTOM RIGHT: CUSTOM MINIMAP ── */}
    {RaceState.phase !== RacePhase.LOBBY && (() => {
      // ── Coordenadas mundiales de los bordes del track ──
      // La pista en el mundo va de X:470→709 y Z:67→403
      const TRACK_MIN_X = 470
      const TRACK_MAX_X = 709
      const TRACK_MIN_Z = 67
      const TRACK_MAX_Z = 403

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
