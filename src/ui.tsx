import ReactEcs, { Label, ReactEcsRenderer, UiEntity } from '@dcl/sdk/react-ecs'
import { Color4 } from '@dcl/sdk/math'
import { engine, Transform } from '@dcl/sdk/ecs'
import { getPlayer } from '@dcl/sdk/players'
import { RaceState } from './raceState'
import { PaintballState } from './paintballState'
import { startPaintball, joinPaintball, exitPaintball } from './paintball'
import {
  Playlist, OWNER_ADDRESS, PlaylistLibrary, selectLibrary,
  requestSkip, previousTrack, togglePause, toggleMute, toggleShuffle, jumpToTrack
} from './playlist'

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
      {(RaceState.isOccupied || ps.inGame) && (() => {
        const pb = ps.inGame
        const img = pb ? 'images/paintball_minimap.png' : 'images/minimap.png'
        // Ventanas world-XZ con las que se generaron las imágenes (make_*minimap.py).
        const xmin = pb ? -170 : -466, xmax = pb ? 170 : 192
        const zmin = pb ? 245 : -300, zmax = pb ? 585 : 358
        const wx = RaceState.isOccupied ? RaceState.kartPositionX : (playerTransform ? playerTransform.position.x : xmin)
        const wz = RaceState.isOccupied ? RaceState.kartPositionZ : (playerTransform ? playerTransform.position.z : zmin)
        const W = 168
        const dotX = Math.max(0, Math.min(W, ((wx - xmin) / (xmax - xmin)) * W))
        const dotY = Math.max(0, Math.min(W, ((zmax - wz) / (zmax - zmin)) * W)) // z alto = arriba
        return (
          <UiEntity uiTransform={{ positionType: 'absolute', position: { bottom: 32, right: 32 }, width: W, height: W }}
            uiBackground={{ textureMode: 'stretch', texture: { src: img } }}>
            <UiEntity uiTransform={{ positionType: 'absolute', position: { left: dotX, top: dotY }, width: 10, height: 10, margin: { left: -5, top: -5 } }}
              uiBackground={{ color: pb ? Color4.create(0.3, 1, 0.5, 1) : Color4.create(1, 0.2, 0.1, 1) }} />
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

      {/* ══════════ ADMIN: PLAYLIST / PANTALLA (solo owner) ══════════ */}
      {isOwner && (
        <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 120, right: 16 }, width: 56, height: 32, justifyContent: 'center', alignItems: 'center' }}
          uiBackground={{ color: Color4.create(0.1, 0.1, 0.16, 0.9) }}
          onMouseDown={() => { adminOpen = !adminOpen }}>
          <Label value="📻" fontSize={16} color={Color4.White()} />
        </UiEntity>
      )}
      {isOwner && adminOpen && (
        <UiEntity uiTransform={{ positionType: 'absolute', position: { top: 158, right: 16 }, width: 320, height: 360, flexDirection: 'column', padding: 10 }}
          uiBackground={{ color: Color4.create(0.05, 0.05, 0.08, 0.96) }}>
          <Label value="📻 SCREEN ADMIN" fontSize={13} color={Color4.create(1, 0.85, 0.2, 1)} uiTransform={{ width: '100%', height: 20 }} />

          {/* Selector de playlist (librería) */}
          <Label value="Playlist:" fontSize={10} color={Color4.create(0.6, 0.7, 0.8, 1)} uiTransform={{ width: '100%', height: 16, margin: { top: 4 } }} />
          {PlaylistLibrary.map((lib, idx) => (
            <UiEntity key={idx} uiTransform={{ width: '100%', height: 28, justifyContent: 'center', alignItems: 'center', margin: { bottom: 4 } }}
              uiBackground={{ color: selectedLibraryIdx === idx ? Color4.create(0.2, 0.5, 0.35, 1) : Color4.create(0.13, 0.13, 0.18, 1) }}
              onMouseDown={() => { selectedLibraryIdx = idx; if (selectLibrary(idx)) adminMsg = `Cargada: ${lib.name}` }}>
              <Label value={lib.name} fontSize={9} color={Color4.White()} />
            </UiEntity>
          ))}

          {/* Transporte */}
          <UiEntity uiTransform={{ width: '100%', height: 36, flexDirection: 'row', justifyContent: 'space-between', margin: { top: 6 } }}>
            {[
              { l: '⏮', f: () => previousTrack() },
              { l: Playlist.paused ? '▶' : '⏸', f: () => togglePause() },
              { l: '⏭', f: () => requestSkip() },
              { l: Playlist.shuffle ? '🔀' : '➡', f: () => toggleShuffle() },
              { l: Playlist.muted ? '🔇' : '🔊', f: () => toggleMute() }
            ].map((b, i) => (
              <UiEntity key={i} uiTransform={{ width: 56, height: 34, justifyContent: 'center', alignItems: 'center' }} uiBackground={{ color: Color4.create(0.15, 0.15, 0.2, 1) }}
                onMouseDown={b.f}>
                <Label value={b.l} fontSize={14} color={Color4.White()} />
              </UiEntity>
            ))}
          </UiEntity>

          {/* Now playing */}
          <Label value={`▶ ${Playlist.tracks[Playlist.currentIndex]?.name || '—'}`} fontSize={10} color={Color4.create(0.4, 1, 0.6, 1)} uiTransform={{ width: '100%', height: 18, margin: { top: 6 } }} />

          {/* Lista de tracks (primeros 8, click = reproducir) */}
          <UiEntity uiTransform={{ width: '100%', height: 130, flexDirection: 'column', margin: { top: 4 } }}>
            {Playlist.tracks.slice(0, 8).map((tr, i) => (
              <UiEntity key={i} uiTransform={{ width: '100%', height: 15 }} onMouseDown={() => { jumpToTrack(i) }}>
                <Label value={`${i === Playlist.currentIndex ? '● ' : ''}${tr.name}`} fontSize={9}
                  color={i === Playlist.currentIndex ? Color4.create(1, 0.85, 0.2, 1) : Color4.create(0.8, 0.8, 0.85, 1)} uiTransform={{ width: '100%', height: 14 }} />
              </UiEntity>
            ))}
          </UiEntity>

          {adminMsg !== '' && <Label value={adminMsg} fontSize={9} color={Color4.create(0.5, 0.9, 0.6, 1)} uiTransform={{ width: '100%', height: 16 }} />}
        </UiEntity>
      )}

    </UiEntity>
  )
}
