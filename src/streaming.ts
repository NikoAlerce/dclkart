// ─── Streaming nativo de Decentraland (Admin Tools / DCL Cast / OBS) por CÓDIGO ───
// Integra el admin toolkit de @dcl/asset-packs SIN el Creator Hub y SIN initAssetPacks
// (que crea un 2º sistema de UI React que choca con nuestro ReactEcsRenderer). En su lugar
// redirigimos el setUiRenderer del toolkit a ReactEcsRenderer.addUiRenderer → la UI del
// admin CONVIVE con la nuestra (minimapa/coords).
//
// IMPORTANTE: definir componentes y sistemas tiene que pasar a nivel de MÓDULO (al importar),
// ANTES de que el engine se selle. Si se hace dentro de main() tira "Engine is already sealed".
import { engine, VideoPlayer, pointerEventsSystem } from '@dcl/sdk/ecs'
import { ReactEcsRenderer } from '@dcl/sdk/react-ecs'
import { syncEntity } from '@dcl/sdk/network'
import { getPlayer, onEnterScene, onLeaveScene } from '@dcl/sdk/players'
import { createComponents, initComponents, getComponents } from '@dcl/asset-packs/dist/definitions'
import { createAdminToolkitSystem } from '@dcl/asset-packs/dist/admin-toolkit'
import { AdminPermissions } from '@dcl/asset-packs/dist/constants'

export const LIVEKIT_SRC = 'livekit-video://current-stream'

let comps: ReturnType<typeof getComponents> | null = null

// ── Nivel MÓDULO: definir componentes + wirear el sistema del admin toolkit ──
try {
  createComponents(engine)
  initComponents(engine)
  comps = getComponents(engine)

  // Puente: el toolkit hace `setUiRenderer` en "su" sistema; lo mandamos a
  // ReactEcsRenderer.addUiRenderer (UI ADICIONAL) para que conviva con la nuestra.
  const adminUiEntity = engine.addEntity()
  const uiBridge = {
    destroy: () => ReactEcsRenderer.destroy(),
    setUiRenderer: (ui: any, opts?: any) => ReactEcsRenderer.addUiRenderer(adminUiEntity, ui, opts),
    addUiRenderer: (e: any, ui: any, opts?: any) => ReactEcsRenderer.addUiRenderer(e, ui, opts),
    removeUiRenderer: (e: any) => ReactEcsRenderer.removeUiRenderer(e)
  }

  engine.addSystem(
    createAdminToolkitSystem(
      engine,
      pointerEventsSystem as any,
      uiBridge as any,
      { syncEntity },
      { getPlayer, onEnterScene, onLeaveScene }
    )
  )
} catch (e) {
  comps = null
  console.error('[streaming] admin toolkit no inicializó:', (e as Error)?.message)
}

// Crea la entidad de configuración del Admin Tools (quién es admin, qué controles). Las
// entidades SÍ se pueden crear en main(); el sistema la detecta y levanta el panel.
export function setupStreaming() {
  if (!comps) return
  // VideoPlayer "proxy" INVISIBLE: el toolkit lo controla (su Video-URL de un solo link va
  // acá y lo ignoramos). Para el STREAM (Cast/OBS) el toolkit setea VideoControlState →
  // isStreamActive() lo detecta y la pantalla real muestra el vivo. La playlist (panel de
  // admin propio) maneja la pantalla el resto del tiempo.
  const proxy = engine.addEntity()
  VideoPlayer.create(proxy, { src: '', playing: false })

  const admin = engine.addEntity()
  comps.AdminTools.create(admin, {
    adminPermissions: AdminPermissions.PRIVATE,
    authorizedAdminUsers: { me: true, sceneOwners: true, allowList: false, adminAllowList: [] },
    moderationControl: {
      isEnabled: false,
      kickCoordinates: { x: 0, y: 0, z: 0 },
      allowNonOwnersManageAdminAllowList: false
    },
    textAnnouncementControl: {
      isEnabled: false,
      playSoundOnEachAnnouncement: false,
      showAuthorOnEachAnnouncement: false
    },
    videoControl: {
      isEnabled: true,
      disableVideoPlayersSound: false,
      showAuthorOnVideoPlayers: false,
      linkAllVideoPlayers: false,
      videoPlayers: [{ entity: proxy, customName: 'Stream' }]
    },
    smartItemsControl: { isEnabled: false, linkAllSmartItems: false, smartItems: [] },
    rewardsControl: { isEnabled: false, rewardItems: [] }
  })
}

// ¿Hay un stream en vivo activo? (el admin toolkit setea VideoControlState con streamKey
// y/o endsAt cuando se activa un stream). La playlist usa esto para CEDER a la transmisión.
export function isStreamActive(): boolean {
  if (!comps) return false
  const now = Date.now() / 1000
  for (const [, st] of engine.getEntitiesWith(comps.VideoControlState)) {
    const s = st as { streamKey?: string; endsAt?: number }
    if (s.streamKey || (s.endsAt !== undefined && s.endsAt > now)) return true
  }
  return false
}
