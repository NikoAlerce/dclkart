import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { engine, Transform } from '@dcl/sdk/ecs'
import { getPlayer } from '@dcl/sdk/players'
import { RaceState } from './raceState'
import { PaintballState } from './paintballState'
import { getBotsForRadar } from './paintballBots'
import { startPaintball, joinPaintball, exitPaintball } from './paintball'
import {
  Playlist, OWNER_ADDRESS, PlaylistLibrary, selectLibrary,
  requestSkip, previousTrack, togglePause, toggleMute, toggleShuffle, jumpToTrack, seekToFraction, seekRelative
} from './playlist'

// mm:ss para la barra de progreso
function fmtTime(s: number): string {
  const t = Math.max(0, Math.floor(s))
  const m = Math.floor(t / 60), ss = t % 60
  return `${m}:${ss < 10 ? '0' : ''}${ss}`
}

export function setupUi() {
  ReactEcsRenderer.setUiRenderer(uiComponent)
}

// ── Estado local del panel admin ──────────────────────────────────────────────
let adminOpen = false
let selectedLibraryIdx = 0
let adminMsg = ''

function fmt(s: number): string {
  const t = Math.max(0, Math.floor(s))
  const m = Math.floor(t / 60)
  const ss = t % 60
  return `${m}:${ss < 10 ? '0' : ''}${ss}`
}

const uiComponent = () => {
  const playerTransform = Transform.has(engine.PlayerEntity) ? Transform.get(engine.PlayerEntity) : undefined
  const posX = playerTransform ? playerTransform.position.x.toFixed(2) : '0.00'
  const posY = playerTransform ? playerTransform.position.y.toFixed(2) : '0.00'
  const posZ = playerTransform ? playerTransform.position.z.toFixed(2) : '0.00'

  const isOwner = (getPlayer()?.userId || '').toLowerCase() === OWNER_ADDRESS.toLowerCase()
  const ps = PaintballState
  const matchRunning = ps.matchPhase === 1 || ps.matchPhase === 2

  return (
    <UiEntity uiTransform={{ width: '100%', height: '100%', flexDirection: 'column' }}>

      {/* ══════════ HUD KART: COORDENADAS (top-right) ══════════ */}
      <UiEntity
        uiTransform={{ positionType: 'absolute', position: { top: 32, right: 32 }, width: 240, height: 70, padding: 8, flexDirection: 'column', justifyContent: 'center' }}
        uiBackground={{ color: Color4.create(0.05, 0.05, 0.1, 0.8) }}
      >
        <Label value="👤 AVATAR" fontSize={10} color={Color4.create(0.4, 0.8, 1, 1)} uiTransform={{ width: '100%', height: 14 }} />
        <Label value={`X: ${posX}  Y: ${posY}  Z: ${posZ}`} fontSize={11} color={Color4.White()} uiTransform={{ width: '100%', height: 18 }} />
      </UiEntity>

      {/* ══════════ HUD KART: CONTROLES + MINIMAPA (al manejar) ══════════ */}
      {RaceState.isOccupied && (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { bottom: 32, left: 32 }, width: 230, height: RaceState.vehicleType === 'ship' ? 100 : 80, padding: 10, flexDirection: 'column' }}
          uiBackground={{ color: Color4.create(0, 0, 0, 0.45) }}
        >
          <Label value="🏎️  CONTROLS" fontSize={13} color={Color4.create(1, 0.9, 0.1, 1)} uiTransform={{ width: '100%', height: 20 }} />
          {RaceState.vehicleType === 'kart' ? (
            <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
              <Label value="[W A S D] Manejar" fontSize={11} color={Color4.create(0.85, 0.85, 0.85, 1)} uiTransform={{ width: '100%', height: 16 }} />
              <Label value="[Space] Drift   [E] Salir" fontSize={11} color={Color4.create(0.85, 0.85, 0.85, 1)} uiTransform={{ width: '100%', height: 16 }} />
            </UiEntity>
          ) : (
            <UiEntity uiTransform={{ flexDirection: 'column', width: '100%' }}>
              <Label value="[W A S D] Volar" fontSize={11} color={Color4.create(0.85, 0.85, 0.85, 1)} uiTransform={{ width: '100%', height: 16 }} />
              <Label value="[Space] Subir  [F] Bajar" fontSize={11} color={Color4.create(0.85, 0.85, 0.85, 1)} uiTransform={{ width: '100%', height: 16 }} />
              <Label value="[E] Salir" fontSize={11} color={Color4.create(0.85, 0.85, 0.85, 1)} uiTransform={{ width: '100%', height: 16 }} />
            </UiEntity>
          )}
        </UiEntity>
      )}
      {(() => {
        const pb = ps.inGame
        const img = pb ? 'images/paintball_minimap.png' : 'images/minimap.png'
        // Ventanas world-XZ EXACTAS con las que se generaron las imágenes (impreso por
        // make_*minimap.py). Track: X[-379.0,816.0] Z[-423.6,771.3]. Paintball: -280..120 / 200..600.
        const xmin = pb ? -280.0 : -379.0, xmax = pb ? 120.0 : 816.0
        const zmin = pb ? 200.0 : -423.6, zmax = pb ? 600.0 : 771.3
        const wx = RaceState.isOccupied ? RaceState.kartPositionX : (playerTransform ? playerTransform.position.x : xmin)
        const wz = RaceState.isOccupied ? RaceState.kartPositionZ : (playerTransform ? playerTransform.position.z : zmin)
        const W = 320
        const dotX = Math.max(0, Math.min(W, ((wx - xmin) / (xmax - xmin)) * W))
        const dotY = Math.max(0, Math.min(W, ((zmax - wz) / (zmax - zmin)) * W)) // z alto = arriba
        const dotCol = pb ? Color4.create(0.2, 1, 0.4, 1) : Color4.create(1, 0.15, 0.1, 1)
        return (
          <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: 24, right: 24 }, width: W, height: W }}
            uiBackground={{ textureMode: 'stretch', texture: { src: img } }}>
            {/* Puntos de los bots en el radar */}
            {getBotsForRadar().map((bot, idx) => {
              if (!bot.isAlive) return null
              const bx = bot.position.x
              const bz = bot.position.z
              const bdotX = Math.max(0, Math.min(W, ((bx - xmin) / (xmax - xmin)) * W))
              const bdotY = Math.max(0, Math.min(W, ((zmax - bz) / (zmax - zmin)) * W))
              return (
                <UiEntity
                  key={idx}
                  uiTransform={{ positionType: 'absolute', position: { left: bdotX, top: bdotY }, width: 12, height: 12, margin: { left: -6, top: -6 }, justifyContent: 'center', alignItems: 'center' }}
                  uiBackground={{ color: Color4.create(0.1, 0.1, 0.1, 0.95) }} // aro oscuro de contraste
                >
                  <UiEntity
                    uiTransform={{ width: 6, height: 6 }}
                    uiBackground={{ color: bot.color }} // punto del color del bot
                  />
                </UiEntity>
              )
            })}
            {/* aro blanco de contraste */}
            <UiEntity uiTransform={{ positionType: 'absolute', position: { left: dotX, top: dotY }, width: 20, height: 20, margin: { left: -10, top: -10 } }}
              uiBackground={{ color: Color4.create(1, 1, 1, 0.9) }} />
            {/* punto del jugador */}
            <UiEntity uiTransform={{ positionType: 'absolute', position: { left: dotX, top: dotY }, width: 12, height: 12, margin: { left: -6, top: -6 } }}
              uiBackground={{ color: dotCol }} />
          </UiEntity>
        )
      })()}

      {/* ══════════ DAÑO: flash a pantalla completa ══════════ */}
      {ps.inGame && ps.shotFlash && (
        <UiEntity
          uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%' }}
          uiBackground={{ color: Color4.create(ps.shotFlashColor.r, ps.shotFlashColor.g, ps.shotFlashColor.b, ps.shotFlashAlpha) }}
        />
      )}

      {/* ══════════ PAINTBALL HUD (en partida) ══════════ */}
      {ps.inGame && (
        <UiEntity uiTransform={{ width: '100%', height: '100%' }}>

          {/* Barra superior: SCORE / SPLATS / TIME */}
          <UiEntity
            uiTransform={{ positionType: 'absolute', position: { top: 16, left: '50%' }, margin: { left: -180 }, width: 360, height: 44, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}
            uiBackground={{ color: Color4.create(0.04, 0.04, 0.07, 0.85) }}
          >
            <UiEntity uiTransform={{ width: 120, height: 40, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <Label value="SCORE" fontSize={9} color={Color4.create(0.6, 0.6, 0.7, 1)} uiTransform={{ height: 12 }} />
              <Label value={`${ps.score}`} fontSize={18} color={Color4.create(0.4, 1, 0.6, 1)} uiTransform={{ height: 22 }} />
            </UiEntity>
            <UiEntity uiTransform={{ width: 120, height: 40, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <Label value="SPLATS" fontSize={9} color={Color4.create(0.6, 0.6, 0.7, 1)} uiTransform={{ height: 12 }} />
              <Label value={`${ps.kills} / 15`} fontSize={18} color={Color4.White()} uiTransform={{ height: 22 }} />
            </UiEntity>
            <UiEntity uiTransform={{ width: 120, height: 40, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <Label value="TIME" fontSize={9} color={Color4.create(0.6, 0.6, 0.7, 1)} uiTransform={{ height: 12 }} />
              <Label value={fmt(ps.matchPhase === 2 ? ps.matchTimer : ps.timeLeft)} fontSize={18} color={Color4.create(1, 0.85, 0.3, 1)} uiTransform={{ height: 22 }} />
            </UiEntity>
          </UiEntity>

          {/* Marcador de equipos T vs CT (modo equipos activo) */}
          {ps.matchPhase === 2 && ps.matchMode === 1 && (
            <UiEntity
              uiTransform={{ positionType: 'absolute', position: { top: 64, left: '50%' }, margin: { left: -95 }, width: 190, height: 30, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}
              uiBackground={{ color: Color4.create(0.04, 0.04, 0.07, 0.85) }}
            >
              <Label value={`T ${ps.teamScoreT}`} fontSize={16} color={Color4.create(1, 0.55, 0.1, 1)} uiTransform={{ width: 72, height: 24 }} />
              <Label value="vs" fontSize={10} color={Color4.create(0.6, 0.6, 0.65, 1)} uiTransform={{ width: 24, height: 20 }} />
              <Label value={`${ps.teamScoreCT} CT`} fontSize={16} color={Color4.create(0.2, 0.6, 1, 1)} uiTransform={{ width: 72, height: 24 }} />
            </UiEntity>
          )}

          {/* Corazones (vida) */}
          {!ps.respawning && (
            <UiEntity
              uiTransform={{ positionType: 'absolute', position: { bottom: 88, left: '50%' }, margin: { left: -115 }, width: 230, height: 36, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}
              uiBackground={{ color: Color4.create(0.04, 0.04, 0.07, 0.82) }}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <Label key={n} value={ps.health >= n ? '❤️' : '🖤'} fontSize={20} color={Color4.White()} uiTransform={{ width: 36, height: 32 }} />
              ))}
            </UiEntity>
          )}

          {/* Crosshair */}
          <UiEntity uiTransform={{ positionType: 'absolute', position: { top: '50%', left: '50%' }, margin: { left: -2, top: -2 }, width: 4, height: 4 }}
            uiBackground={{ color: ps.rapidFireTimer > 0 ? Color4.create(1, 0.85, 0.1, 1) : ps.tripleShotTimer > 0 ? Color4.create(0.3, 1, 0.5, 1) : Color4.create(1, 1, 1, 0.9) }} />

          {/* Radar */}
          {ps.radarMsg !== '' && (
            <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: 130, left: '50%' }, margin: { left: -150 }, width: 300, height: 22, justifyContent: 'center', alignItems: 'center' }}
              uiBackground={{ color: Color4.create(0.1, 0.05, 0.05, 0.7) }}>
              <Label value={ps.radarMsg} fontSize={11} color={Color4.create(1, 0.5, 0.4, 1)} />
            </UiEntity>
          )}

          {/* Announcer (combos) */}
          {ps.announcerTimer > 0 && (
            <UiEntity uiTransform={{ positionType: 'absolute', position: { top: '34%', left: '50%' }, margin: { left: -200 }, width: 400, height: 50, justifyContent: 'center', alignItems: 'center' }}>
              <Label value={ps.announcerMsg} fontSize={ps.announcerBig ? 36 : 24} color={Color4.create(1, 0.8, 0.1, 1)} />
            </UiEntity>
          )}

          {/* Combo bar */}
          {ps.combo > 1 && (
            <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: 130, right: 32 }, width: 160, height: 22, justifyContent: 'center', alignItems: 'center' }}
              uiBackground={{ color: Color4.create(0.05, 0.05, 0.1, 0.75) }}>
              <Label value={`🔥 COMBO x${ps.combo}`} fontSize={13} color={Color4.create(1, 0.6, 0.1, 1)} />
            </UiEntity>
          )}

          {/* Power-ups activos (bottom-left) */}
          {(ps.rapidFireTimer > 0 || ps.tripleShotTimer > 0 || ps.shieldTimer > 0) && !RaceState.isOccupied && (
            <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: 32, left: 32 }, width: 180, height: 70, flexDirection: 'column', padding: 6 }}
              uiBackground={{ color: Color4.create(0.05, 0.05, 0.1, 0.7) }}>
              {ps.rapidFireTimer > 0 && <Label value={`⚡ Rapid Fire ${Math.ceil(ps.rapidFireTimer)}s`} fontSize={11} color={Color4.create(1, 0.9, 0.1, 1)} uiTransform={{ height: 18 }} />}
              {ps.tripleShotTimer > 0 && <Label value={`✦ Triple Shot ${Math.ceil(ps.tripleShotTimer)}s`} fontSize={11} color={Color4.create(0.3, 1, 0.5, 1)} uiTransform={{ height: 18 }} />}
              {ps.shieldTimer > 0 && <Label value={`🛡 Shield ${Math.ceil(ps.shieldTimer)}s`} fontSize={11} color={Color4.create(0.3, 0.6, 1, 1)} uiTransform={{ height: 18 }} />}
            </UiEntity>
          )}

          {/* Kill feed (top-right) */}
          <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 110, right: 24 }, width: 240, height: 110, flexDirection: 'column' }}>
            {ps.killFeed.slice(0, 4).map((k, i) => (
              <Label key={i} value={k.text} fontSize={12} color={k.color} uiTransform={{ width: '100%', height: 22 }} />
            ))}
          </UiEntity>

          {/* LEADERBOARD (top-left) */}
          {ps.scoreboard.length > 0 && (
            <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 110, left: 24 }, width: 220, height: 24 + ps.scoreboard.length * 18, flexDirection: 'column', padding: 6 }}
              uiBackground={{ color: Color4.create(0.04, 0.04, 0.07, 0.78) }}>
              <Label value="🏆 LEADERBOARD" fontSize={11} color={Color4.create(1, 0.85, 0.2, 1)} uiTransform={{ width: '100%', height: 16 }} />
              {ps.scoreboard.map((e, i) => (
                <Label key={e.id} value={`${i + 1}. ${e.name}  ${e.score}`} fontSize={10}
                  color={e.id === (getPlayer()?.userId || '') ? Color4.create(0.4, 1, 0.6, 1) : Color4.White()} uiTransform={{ width: '100%', height: 16 }} />
              ))}
            </UiEntity>
          )}

          {/* Countdown (fase 1) */}
          {ps.matchPhase === 1 && (
            <UiEntity uiTransform={{ positionType: 'absolute', position: { top: '34%', left: '50%' }, margin: { left: -180 }, width: 360, height: 96, flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}
              uiBackground={{ color: Color4.create(0.04, 0.04, 0.07, 0.88) }}>
              <Label value={ps.matchMode === 1 ? '⚔️ TEAM BATTLE — GET READY' : '🔫 FREE-FOR-ALL — GET READY'} fontSize={13} color={Color4.create(1, 0.85, 0.2, 1)} uiTransform={{ height: 22 }} />
              <Label value={`${Math.ceil(ps.matchTimer)}`} fontSize={42} color={Color4.White()} uiTransform={{ height: 50 }} />
              <Label value={`${ps.matchBots ? '🤖 WITH BOTS' : '👥 NO BOTS'}  ·  esperando jugadores...`} fontSize={10} color={Color4.create(0.7, 0.85, 0.95, 1)} uiTransform={{ height: 16 }} />
            </UiEntity>
          )}

          {/* Resultado (fase 3) */}
          {ps.matchPhase === 3 && (
            <UiEntity uiTransform={{ positionType: 'absolute', position: { top: '40%', left: '50%' }, margin: { left: -170 }, width: 340, height: 84, flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}
              uiBackground={{ color: Color4.create(0.04, 0.04, 0.07, 0.93) }}>
              <Label value={ps.matchMode === 1 ? (ps.matchWinner === 1 ? '⚔️ TERRORISTS WIN' : ps.matchWinner === 2 ? '🛡 COUNTER-TERRORISTS WIN' : 'DRAW') : 'ROUND OVER'} fontSize={18} color={Color4.create(1, 0.85, 0.2, 1)} uiTransform={{ height: 30 }} />
              <Label value={ps.matchMode === 1 ? `T ${ps.teamScoreT}  —  ${ps.teamScoreCT} CT` : `Your score: ${ps.score}`} fontSize={14} color={Color4.White()} uiTransform={{ height: 24 }} />
            </UiEntity>
          )}

          {/* Respawn countdown */}
          {ps.respawning && (
            <UiEntity uiTransform={{ positionType: 'absolute', position: { top: '45%', left: '50%' }, margin: { left: -120 }, width: 240, height: 60, justifyContent: 'center', alignItems: 'center' }}
              uiBackground={{ color: Color4.create(0.2, 0, 0, 0.7) }}>
              <Label value={`☠ Respawn en ${ps.respawnCD}...`} fontSize={18} color={Color4.White()} />
            </UiEntity>
          )}

          {/* GAME OVER */}
          {ps.gameOver && (
            <UiEntity uiTransform={{ positionType: 'absolute', position: { top: '32%', left: '50%' }, margin: { left: -180 }, width: 360, height: 200, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 12 }}
              uiBackground={{ color: Color4.create(0.04, 0.04, 0.07, 0.95) }}>
              <Label value={ps.gameMsg} fontSize={20} color={Color4.create(1, 0.85, 0.2, 1)} uiTransform={{ width: '100%', height: 34 }} />
              <Label value={`SCORE: ${ps.score}`} fontSize={16} color={Color4.create(0.4, 1, 0.6, 1)} uiTransform={{ width: '100%', height: 24 }} />
              <Label value={`Best combo: x${ps.bestCombo}   Splats: ${ps.kills}`} fontSize={12} color={Color4.White()} uiTransform={{ width: '100%', height: 22 }} />
              <UiEntity uiTransform={{ width: '100%', height: 44, flexDirection: 'row', justifyContent: 'space-between', margin: { top: 10 } }}>
                <UiEntity uiTransform={{ width: 165, height: 44, justifyContent: 'center', alignItems: 'center' }} uiBackground={{ color: Color4.create(0.2, 0.6, 0.3, 1) }}
                  onMouseDown={() => { startPaintball(ps.matchMode) }}>
                  <Label value="🔁 JUGAR DE NUEVO" fontSize={12} color={Color4.White()} />
                </UiEntity>
                <UiEntity uiTransform={{ width: 165, height: 44, justifyContent: 'center', alignItems: 'center' }} uiBackground={{ color: Color4.create(0.5, 0.2, 0.2, 1) }}
                  onMouseDown={() => { exitPaintball() }}>
                  <Label value="🚪 SALIR" fontSize={12} color={Color4.White()} />
                </UiEntity>
              </UiEntity>
            </UiEntity>
          )}
        </UiEntity>
      )}

      {/* ══════════ MODAL DE INVITACIÓN (Referee) ══════════ */}
      {ps.inviteOpen && !ps.inGame && (
        <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 0, left: 0 }, width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
          uiBackground={{ color: Color4.create(0, 0, 0, 0.55) }}>
          <UiEntity uiTransform={{ width: 460, height: 250, flexDirection: 'column', padding: 18 }} uiBackground={{ color: Color4.create(0.06, 0.06, 0.09, 0.98) }}>
            <Label value="🎯  DCL PAINTBALL" fontSize={20} color={Color4.create(0.3, 1, 0.55, 1)} uiTransform={{ width: '100%', height: 30 }} />
            <Label value={ps.playersInArena > 0 ? `🟢 ${ps.playersInArena} jugando ahora` : '⚪ Nadie todavía — sé el primero'} fontSize={11} color={Color4.create(0.7, 0.8, 0.9, 1)} uiTransform={{ width: '100%', height: 20, margin: { bottom: 8 } }} />

            {matchRunning ? (
              <UiEntity uiTransform={{ width: '100%', flexDirection: 'column' }}>
                <Label value={`${ps.matchPhase === 1 ? '⏳ Arrancando' : '🟢 En curso'} — ${ps.matchMode === 1 ? '⚔️ TEAM' : '🔫 FFA'} · ${ps.matchBots ? '🤖 con bots' : '👥 sin bots'}`}
                  fontSize={12} color={Color4.create(0.85, 0.9, 1, 1)} uiTransform={{ width: '100%', height: 24, margin: { bottom: 12 } }} />
                <UiEntity uiTransform={{ width: '100%', height: 48, flexDirection: 'row', justifyContent: 'space-between' }}>
                  <UiEntity uiTransform={{ width: 370, height: 48, justifyContent: 'center', alignItems: 'center' }} uiBackground={{ color: Color4.create(0.2, 0.65, 0.3, 1) }}
                    onMouseDown={() => { ps.inviteOpen = false; joinPaintball() }}>
                    <Label value="✅  UNIRSE A LA PARTIDA" fontSize={14} color={Color4.White()} />
                  </UiEntity>
                  <UiEntity uiTransform={{ width: 60, height: 48, justifyContent: 'center', alignItems: 'center' }} uiBackground={{ color: Color4.create(0.18, 0.18, 0.22, 1) }}
                    onMouseDown={() => { ps.inviteOpen = false }}>
                    <Label value="✕" fontSize={16} color={Color4.create(0.7, 0.7, 0.75, 1)} />
                  </UiEntity>
                </UiEntity>
              </UiEntity>
            ) : (
              <UiEntity uiTransform={{ width: '100%', flexDirection: 'column' }}>
                {/* Toggle bots */}
                <UiEntity uiTransform={{ width: '100%', height: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', margin: { bottom: 12 } }}>
                  <Label value="🤖 Bots" fontSize={12} color={Color4.create(0.85, 0.85, 0.9, 1)} uiTransform={{ width: 100, height: 24 }} />
                  <UiEntity uiTransform={{ width: 200, height: 36, flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <UiEntity uiTransform={{ width: 95, height: 36, justifyContent: 'center', alignItems: 'center', margin: { right: 6 } }}
                      uiBackground={{ color: ps.botsEnabled ? Color4.create(0.2, 0.65, 0.3, 1) : Color4.create(0.18, 0.18, 0.22, 1) }}
                      onMouseDown={() => { ps.botsEnabled = true }}>
                      <Label value="CON BOTS" fontSize={10} color={ps.botsEnabled ? Color4.White() : Color4.create(0.6, 0.6, 0.65, 1)} />
                    </UiEntity>
                    <UiEntity uiTransform={{ width: 95, height: 36, justifyContent: 'center', alignItems: 'center' }}
                      uiBackground={{ color: !ps.botsEnabled ? Color4.create(0.7, 0.25, 0.25, 1) : Color4.create(0.18, 0.18, 0.22, 1) }}
                      onMouseDown={() => { ps.botsEnabled = false }}>
                      <Label value="SIN BOTS" fontSize={10} color={!ps.botsEnabled ? Color4.White() : Color4.create(0.6, 0.6, 0.65, 1)} />
                    </UiEntity>
                  </UiEntity>
                </UiEntity>
                {/* Botones de modo */}
                <UiEntity uiTransform={{ width: '100%', height: 48, flexDirection: 'row', justifyContent: 'space-between' }}>
                  <UiEntity uiTransform={{ width: 195, height: 48, justifyContent: 'center', alignItems: 'center' }} uiBackground={{ color: Color4.create(0.85, 0.45, 0.1, 1) }}
                    onMouseDown={() => { ps.inviteOpen = false; startPaintball(1) }}>
                    <Label value="⚔️ TEAM BATTLE" fontSize={13} color={Color4.White()} />
                  </UiEntity>
                  <UiEntity uiTransform={{ width: 175, height: 48, justifyContent: 'center', alignItems: 'center' }} uiBackground={{ color: Color4.create(0.2, 0.55, 0.85, 1) }}
                    onMouseDown={() => { ps.inviteOpen = false; startPaintball(0) }}>
                    <Label value="🔫 FREE-FOR-ALL" fontSize={13} color={Color4.White()} />
                  </UiEntity>
                  <UiEntity uiTransform={{ width: 50, height: 48, justifyContent: 'center', alignItems: 'center' }} uiBackground={{ color: Color4.create(0.18, 0.18, 0.22, 1) }}
                    onMouseDown={() => { ps.inviteOpen = false }}>
                    <Label value="✕" fontSize={14} color={Color4.create(0.7, 0.7, 0.75, 1)} />
                  </UiEntity>
                </UiEntity>
              </UiEntity>
            )}
          </UiEntity>
        </UiEntity>
      )}

      {/* ══════════ ADMIN: REPRODUCTOR WINAMP (solo owner) — derecha, lejos del chat ══════════ */}
      {isOwner && (
        <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 150, right: 20 }, width: 220, height: 48, justifyContent: 'center', alignItems: 'center' }}
          uiBackground={{ color: adminOpen ? Color4.create(0.2, 0.45, 0.35, 1) : Color4.create(0.15, 0.17, 0.26, 0.96) }}
          onMouseDown={() => { adminOpen = !adminOpen }}>
          <Label value={adminOpen ? '♪ PLAYLIST  ▼' : '♪ PLAYLIST  ►'} fontSize={20} color={Color4.create(0.45, 1, 0.65, 1)} />
        </UiEntity>
      )}
      {isOwner && adminOpen && (
        <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 206, right: 20, bottom: 12 }, width: 560, flexDirection: 'column', padding: 14 }}
          uiBackground={{ color: Color4.create(0.04, 0.05, 0.07, 0.97) }}>
          {/* Barra de título estilo Winamp */}
          <UiEntity uiTransform={{ width: '100%', height: 38, justifyContent: 'center', alignItems: 'center' }} uiBackground={{ color: Color4.create(0.13, 0.17, 0.32, 1) }}>
            <Label value="W I N A M P  —  SCREEN" fontSize={18} color={Color4.create(0.55, 0.8, 1, 1)} />
          </UiEntity>
          {/* Display LCD: track actual */}
          <UiEntity uiTransform={{ width: '100%', height: 44, justifyContent: 'flex-start', alignItems: 'center', padding: { left: 12 }, margin: { top: 6, bottom: 6 } }} uiBackground={{ color: Color4.create(0, 0.06, 0.02, 1) }}>
            <Label value={`▶ ${Playlist.tracks[Playlist.currentIndex]?.name || '—'}`} fontSize={16} color={Color4.create(0.3, 1, 0.45, 1)} uiTransform={{ width: '96%', height: 30 }} />
          </UiEntity>
          {/* Transporte (glyphs que SÍ renderizan en DCL) */}
          <UiEntity uiTransform={{ width: '100%', height: 56, flexDirection: 'row', justifyContent: 'space-between' }}>
            {[
              { l: '◀◀', on: false, f: () => previousTrack() },
              { l: Playlist.paused ? '▶' : 'II', on: !Playlist.paused, f: () => togglePause() },
              { l: '▶▶', on: false, f: () => requestSkip() },
              { l: 'SHUF', on: Playlist.shuffle, f: () => toggleShuffle() },
              { l: 'MUTE', on: Playlist.muted, f: () => toggleMute() }
            ].map((b, i) => (
              <UiEntity key={i} uiTransform={{ width: 100, height: 52, justifyContent: 'center', alignItems: 'center' }}
                uiBackground={{ color: b.on ? Color4.create(0.2, 0.55, 0.35, 1) : Color4.create(0.14, 0.15, 0.2, 1) }}
                onMouseDown={b.f}>
                <Label value={b.l} fontSize={b.l.length > 2 ? 16 : 26} color={Color4.create(0.85, 1, 0.9, 1)} />
              </UiEntity>
            ))}
          </UiEntity>
          {/* Barra de progreso + seek. Segmentos clickeables + botones ±seg. */}
          {(() => {
            const dur  = Playlist.duration || 0
            const cur  = Math.min(Playlist.currentTime || 0, dur)
            const prog = dur > 0 ? cur / dur : 0
            const SEG  = 24
            const seekBtns = [{ l: '-30', d: -30 }, { l: '-10', d: -10 }, { l: '+10', d: 10 }, { l: '+30', d: 30 }]
            return (
              <UiEntity uiTransform={{ width: '100%', height: 76, flexDirection: 'column', margin: { top: 10 } }}>
                {/* barra segmentada (click = saltar a esa posición) */}
                <UiEntity uiTransform={{ width: '100%', height: 22, flexDirection: 'row' }} uiBackground={{ color: Color4.create(0.10, 0.12, 0.16, 1) }}>
                  {Array.from({ length: SEG }).map((_, i) => (
                    <UiEntity key={i} uiTransform={{ flexGrow: 1, height: '100%', margin: { right: 1 } }}
                      uiBackground={{ color: (i / SEG) < prog ? Color4.create(0.3, 1, 0.45, 1) : Color4.create(0.18, 0.2, 0.25, 1) }}
                      onMouseDown={() => { if (dur > 0) seekToFraction((i + 0.5) / SEG) }} />
                  ))}
                </UiEntity>
                {/* tiempo + botones de salto fino */}
                <UiEntity uiTransform={{ width: '100%', height: 42, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', margin: { top: 4 } }}>
                  <Label value={`${fmtTime(cur)} / ${fmtTime(dur)}`} fontSize={13} color={Color4.create(0.6, 0.85, 0.7, 1)} uiTransform={{ width: 120, height: 24 }} />
                  <UiEntity uiTransform={{ flexGrow: 1, height: 38, flexDirection: 'row', justifyContent: 'flex-end' }}>
                    {seekBtns.map((b, i) => (
                      <UiEntity key={i} uiTransform={{ width: 58, height: 38, justifyContent: 'center', alignItems: 'center', margin: { left: 4 } }}
                        uiBackground={{ color: Color4.create(0.14, 0.15, 0.2, 1) }}
                        onMouseDown={() => seekRelative(b.d)}>
                        <Label value={b.l} fontSize={16} color={Color4.create(0.85, 1, 0.9, 1)} />
                      </UiEntity>
                    ))}
                  </UiEntity>
                </UiEntity>
              </UiEntity>
            )
          })()}
          {/* Selector de playlist (sin emojis → se leen) */}
          <Label value="PLAYLIST:" fontSize={14} color={Color4.create(0.5, 0.7, 0.9, 1)} uiTransform={{ width: '100%', height: 22, margin: { top: 12 } }} />
          {PlaylistLibrary.map((lib, idx) => (
            <UiEntity key={idx} uiTransform={{ width: '100%', height: 38, justifyContent: 'center', alignItems: 'center', margin: { bottom: 4 } }}
              uiBackground={{ color: selectedLibraryIdx === idx ? Color4.create(0.2, 0.5, 0.35, 1) : Color4.create(0.12, 0.13, 0.18, 1) }}
              onMouseDown={() => { selectedLibraryIdx = idx; if (selectLibrary(idx)) adminMsg = 'Cargada' }}>
              <Label value={lib.name.replace(/[^\x00-\x7F]/g, '').trim()} fontSize={13} color={Color4.White()} />
            </UiEntity>
          ))}
          {/* Lista de tracks (click = reproducir) — TODOS, con scroll y numerados */}
          <UiEntity uiTransform={{ width: '100%', flexGrow: 1, flexDirection: 'column', margin: { top: 6 }, overflow: 'scroll' }}>
            {Playlist.tracks.map((tr, i) => (
              <UiEntity key={i} uiTransform={{ width: '100%', height: 26, flexShrink: 0 }} onMouseDown={() => { jumpToTrack(i) }}>
                <Label value={`${i === Playlist.currentIndex ? '▶ ' : ''}${i + 1}. ${tr.name}`} fontSize={13}
                  color={i === Playlist.currentIndex ? Color4.create(0.3, 1, 0.45, 1) : Color4.create(0.78, 0.8, 0.85, 1)} uiTransform={{ width: '100%', height: 24 }} />
              </UiEntity>
            ))}
          </UiEntity>
        </UiEntity>
      )}

    </UiEntity>
  )
}
