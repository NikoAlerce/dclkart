# Pendientes para la próxima sesión (revisión 2026-06-23)

Contexto: tras el wipe del otro dev, se recuperó casi todo. Esta lista es lo que
quedó por arreglar/mejorar. Ordenado por prioridad.

## 0. 🔒 URGENTE — COMMITEAR
Todo (paintball, UI, 2ª playlist, recuperaciones) está **untracked** en git.
`git add -A && git commit -m "rescate post-wipe"`. Si no, se puede perder de nuevo.

## 1. Karts fuera del estacionamiento
- `src/kartConfig.ts` → `KART_CONFIGS` tiene los spawn en X≈-211..-197, Z≈-26
  (comentario: "parking lot capturado en Bevy ~ -187,-20").
- El `track.glb` se re-exportó (solidify, etc.) → el parking lot real se movió.
  El nodo `ParkingLot` del GLB está en local ≈ (112, 3.25, 63.27) → resolver a mundo
  (con X-flip + transform del track) y recalibrar los 10 `spawnPos`.
- Camino rápido: usar el editor GLB (localhost:9000) para reposicionar, o leer el
  nodo ParkingLot y mapear.

## 2. Monstruo — hay que REHACER varias features (no hay versión nueva recuperable)
- Confirmado: la versión más completa que existe es `git HEAD` (256 líneas, ya
  restaurada). El bundle tiene 204 (más vieja). Remotes/historial = nada. Todo lo
  "nuevo" era trabajo **sin commitear** → se perdió, hay que **rehacerlo**.
- Features que tenía y faltan (reescribir en `src/monster.ts` + `index.ts`):
  - **El monstruo NO debe colisionar con los árboles** — vagaba libremente y los
    atravesaba. Su raycast de evasión debía IGNORAR `arboles.glb` (para eso era el
    param `arbolesEntity` de `setupMonster`, hoy sin usar). Que deambule sin frenar.
  - **Caminar sobre el lomo**: el delta-carry no deja moverse encima. Revisar la
    plataforma del lomo (BACK_Y/BACK_CX/BACK_LEN_X/BACK_WID_Z) y el carry del avatar.
  - **Rider no chocaba árboles**: al montar, `arboles.glb` → `CL_NONE` mientras
    `RaceState.ridingMonster` (el avatar viaja con el monstruo atravesando árboles).
    Verificar/restaurar ese toggle en `index.ts` (parece faltar).
  - **TV en el lomo con el STREAM** 🔑: había una pantalla montada en el lomo que
    mostraba el mismo video/stream que la pantalla principal (LIVEKIT/playlist). Por eso
    `setupMonster(arbolesEntity, screenVideo)` recibía `screenVideo`. Se podía **ridear
    en multiplayer mirando el stream en su lomo**. Rehacer: plano de video hijo del
    monstruo + sync multiplayer (`syncEntity` host-authority del Transform del monstruo).

## 3. UI demasiado precaria + botones superpuestos
- `ui.tsx` fue **reconstruido desde cero** (el original de 1178 líneas no existía en
  ningún artefacto). Funciona pero falta pulido.
- **Botón 📻 admin** (top:120/right:16) se superpone con el botón del **Admin Toolkit**
  de `@dcl/asset-packs` (lo crea `streaming.ts` → createAdminToolkitUI). Reposicionar.
- Falta en el panel admin: **save/load playlist JSON** y **add track** (necesitan
  `Input` de react-ecs; los omití en la reconstrucción). Las funciones existen en
  `playlist.ts` (savePlaylistJson/loadPlaylistJson/addTrack/removeTrack).
- Pulir layout/estética general del HUD de paintball.
- **MINIMAPA roto** 🔑: el original mostraba la posición en vivo (punto del kart/avatar)
  y, al entrar al paintball, **hacía ZOOM en la arena** (usaba `images/paintball_minimap.png`
  en vez de `images/minimap.png`). La reconstrucción quedó como imagen estática sin punto
  ni zoom. Rehacer: indicador de posición (mapear world XZ → % con TRACK_MIN/MAX, la lógica
  base está en el ui.tsx de git) + modo arena (cambiar imagen + bounds cuando `inGame`).

## 4. Playlists — faltan links en AMBAS
- `archiveRecitals` (2ª playlist): restaurada con **14** de ~20. Faltan ~6:
  A Tribe Called Quest (SNL), Snoop Dogg, Eminem (Bonnaroo), Dr. Dre (SNL),
  Busta Rhymes (SNL), Aaliyah.
- `initial` (IPFS, 1ª playlist): **también le faltan links** (la versión actual quedó
  recortada respecto a la que tenía el usuario). Reconseguir la lista completa.
- Acción: el usuario aporta los links faltantes de las dos y se rearman completas.

## 5. Sonidos del paintball
- Faltan los archivos `assets/sounds/shoot.mp3`, `impact.mp3`, `footstep.mp3`
  (el código de audio está listo, solo faltan los .mp3).

## 6. Calibraciones visuales pendientes (de antes del wipe)
- **TV noventera nueva**: alinear el plano del video dentro de la pantalla del modelo
  (en `index.ts`, hijo de `screenEntity`). Estaba a medio calibrar.
- **Arena paintball**: coords/piso (`paintballArena.ts`) y tuning multinivel de bots.

## Artefactos de recuperación
- Backup del rescate: `_RECOVERY_*/` (bundle pre-paintball + src vaciado + extracted_*).
- `bin/index.js` es PRE-paintball → NO sirve como fuente de recuperación de paintball.
