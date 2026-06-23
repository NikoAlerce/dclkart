# HANDOFF DEV — Decentraland World (revisión 2026-06-23)

Este documento explica **qué es el proyecto, cómo está armado, qué se hizo en esta sesión y qué queda pendiente**. Pensado para que otro dev (o Claude en otra sesión) se ponga al día rápido.

> ⚠️ **Carpeta de trabajo correcta:** `C:\niko\escritorio\bakup\mariokart2`
> (la carpeta `C:\niko\escritorio\mariokart2` es una versión VIEJA pre-pivote — NO trabajar ahí).
> Rama actual: `chore/cleanup-docs-deterministic-spawn`.

---

## 1. Qué es

Un **World personal de Decentraland (SDK7)**, **multiplayer serverless**, sobre un terreno grande. Pilares:

1. **Vehículos** con motor de física custom: karts que manejan + 1 nave que vuela (`kart3`).
2. Un **monstruo kaiju gigante** que deambula por el terreno y que se puede **montar** (caminás sobre el lomo; tiene una TV con el stream).
3. Un **mini-juego de Paintball** estilo Counter-Strike completo (modos FFA y T-vs-CT, bots con navmesh A*, power-ups, scoreboard, récord).
4. Una **pantalla gigante** con playlist (tipo Winamp) + streaming en vivo (DCL Cast/OBS), con panel admin solo para el owner.

Deploy al World: `nikoalerce.dcl.eth` (`scene.json` → `worldConfiguration`).

---

## 2. Cómo correrlo

```bash
# Preview en cliente Desktop (auto-abre la app por deep-link decentraland://)
npx sdk-commands start

# Preview en navegador (Bevy web)
npx sdk-commands start --bevy-web

# Build (bundle + typecheck)
npx sdk-commands build

# Deploy al World
npx sdk-commands deploy
```

- Si cambiás **`scene.json`** (spawn, parcelas, etc.) hay que **reconectar** (RELOAD SCENE NO alcanza). Cambios de `.ts` sí entran con RELOAD SCENE / hot-reload.
- Deep-link desktop: `decentraland://?realm=http://127.0.0.1:8001&position=35,20&local-scene=true&debug=true`

---

## 3. Convenciones y "gotchas" CLAVE (leer antes de tocar nada)

### `WORLD_Y_OFFSET = 50` (`src/spawnConfig.ts`)
Toda la escena se eleva **+50 en Y** para flotar por encima del terreno procedural de DCL (que no se puede apagar). El editor 3D escribe coords "a nivel piso" en los `Vector3.create(...)` y el offset se suma **en runtime** (`Transform.getMutable(e).position.y += WORLD_Y_OFFSET`). Por eso ves Y=10 en el código pero el objeto vive en Y=60.
- El piso real de la isla ronda **Y ≈ 60-65**.
- `scene.json` lo lee el CLIENTE directo (no nuestro código), así que ahí las coords van con el valor FINAL (ej: spawn Y=65, no 15).

### Multiplayer = host-authority sin backend (`src/net.ts`)
DCL sincroniza solo avatares/voz/chat; el estado del juego va a mano.
- **`isHost()`**: el host es el `address` más bajo (en minúsculas) entre los avatares visibles; re-escaneo cada 2s. Estando solo, sos host. (Arreglado esta sesión para que sea consistente entre clientes.)
- **`syncEntity(entity, [comp...], enumId)`** para estado continuo. Rangos de enumId en `SYNC_IDS` (karts 1-10, monster 2000, bots 2100+, powerups 2300+, match 2600, highscore 2700).
- **`MessageBus`** (`pbBus` en `src/paintballNet.ts`) para eventos puntuales (impactos, muertes, disparos, presencia, scores).
- Patrón: la entidad sincronizada es la "lógica"; la **visual** (GLB/AvatarShape) suele ser una entidad aparte que copia el Transform (porque mutar un AvatarShape mientras carga lo rompe).

### Plataformas móviles que llevan al jugador
El `Transform` del jugador es **read-only**; NO se mueve al rider con `movePlayerTo` cada frame. Para que el motor **lleve al avatar parado encima**, la plataforma se mueve por **`Tween`** (ver `monster.ts`). Esto está documentado en las skills de DCL (`player-physics` / `animations-tweens`), instaladas en `.agents/skills/decentraland-sdk-skills/`.

---

## 4. Mapa de archivos (`src/`)

| Archivo | Qué hace |
|---|---|
| `index.ts` | `main()`: instancia track/lake/flowerman/arboles/screen, playlist+watchdog de la pantalla, spawn del jugador (probe + corrección), karts, física, UI, streaming, atmósfera, **monstruo**, paintball, toggle de colisión de árboles al montar. |
| `spawnConfig.ts` | `WORLD_Y_OFFSET`, `SPAWN_POSITION`, `SPAWN_CAMERA_TARGET`. |
| `net.ts` | Host-authority (`isHost`, `getMyId`, `SYNC_IDS`). |
| `kart.ts` / `kartConfig.ts` / `kartSystem.ts` / `components.ts` | Vehículos: factory, config de los 10 karts, motor de física (drift, turbo, nave, cámara elástica), componentes ECS. |
| `monster.ts` | **Monstruo montable** (ver §5). |
| `paintball*.ts` (12 archivos) | Mini-juego: `paintball.ts` (orquestación/disparo/respawn), `paintballMatch.ts` (fases/modos), `paintballBots.ts` (IA + A*), `paintballNav.ts` (navmesh), `paintballArena.ts` (coords), `paintballFX/Lasers/Weapon/Colors/Powerups/Signs/Audio/State/Net.ts`. |
| `playlist.ts` / `streaming.ts` / `screenState.ts` | Pantalla: 2 librerías de tracks (IPFS + Internet Archive), integración Admin Toolkit para stream nativo. |
| `ui.tsx` | Todo el HUD: coords, minimapa, controles de kart, HUD paintball (vidas, score, kill-feed, leaderboard, countdown, marcador T/CT, game over, modal de invitación), panel Winamp (solo owner). |
| `atmosphere.ts` / `windParticles.ts` | Luciérnagas + partículas ambientales. |
| `factory.ts` / `systems.ts` / `utils.ts` | **Código muerto** (sobras del template SDK7). Borrables. |

---

## 5. MONSTRUO — qué se hizo esta sesión (lo principal)

El monstruo (`src/monster.ts`, GLB `assets/models/cck medio medio.glb`, ~115m de alto) estaba roto tras el rescate de datos. Se **reescribió** su locomotion y montado. Geometría del GLB: un solo mesh skinned animado (clip `chabon`), sin plataforma horneada → la plataforma del lomo es un **collider de caja en código** (`back`), emparentado al monstruo.

**Cómo funciona ahora:**
- **Montar**: clic en el cuerpo (collider `clickCollider`, CL_POINTER) → `movePlayerTo` te deja sobre el lomo.
- **Caminar sobre el lomo**: el lomo es la entidad `back` (caja con CL_PHYSICS). El monstruo se mueve por **`Tween` (`setMoveRotateScale`)** en tramos → el **motor de DCL lleva al avatar** parado encima (sin `movePlayerTo`, sin delta-carry). Podés caminar libre arriba.
- **Movimiento fluido**: tramos solapados (se emite el próximo antes de terminar el actual) + posición/rotación dentro del mismo Tween (sin escribir el Transform a mano, que peleaba con el Tween) → caminata continua. `SPEED=4` calibrado con `ANIM_SPEED=0.27` (los pies no patinan).
- **IA con raycast**: sensor de piso (sigue las irregularidades del terreno, ignora árboles) + sensor frontal (esquiva montañas/edificios; **atraviesa árboles**). Destinos **aleatorios** por **todo el terreno** (`ROAM` ≈ bounds del mapa).
- **Posición inicial ALEATORIA** (distinta cada sesión) — ya no aparece siempre en el mismo lugar.
- **Multiplayer**: se **sincroniza el Tween** (no el Transform) → todos los clientes reproducen el mismo movimiento del host → **todos lo ven igual y en el mismo lugar**, y cada cliente lleva a su propio rider. Varios pueden montar a la vez.
- **TV en el lomo**: GLB `screen.glb` chico en la **trompa**, mirando al centro (a los riders), con el mismo stream que la pantalla grande.
- **Árboles al montar**: mientras `RaceState.ridingMonster` (detección estable con grace de 0.6s, sin parpadeo) → `index.ts` apaga la colisión de `arboles.glb` para que viajes atravesándolos.

**Constantes para AFINAR VISUAL** (arriba de `monster.ts`): `BACK_Y` (altura del lomo, hoy `0.488` = parado justo), `BACK_CX/LEN_X/WID_Z` (tamaño/centro de la plataforma), `TV_POS/TV_ROT/TV_SCALE` (TV), `SCALE`, `SPEED`.

**Spawn del jugador** (relacionado): el monstruo arrancaba pegado al spawn y su plataforma rompía el raycast de spawn (te tiraba arriba del monstruo). Arreglado: (a) `START` lejos/aleatorio, (b) `scene.json` spawn Y 15→**65** (faltaba el offset → te dropeaba bajo la isla), (c) el `topHit` del probe en `index.ts` ignora superficies por encima de `SPAWN_POSITION.y + 6` (la plataforma del monstruo).

---

## 6. PENDIENTES / próximos pasos

### Monstruo (verificar/afinar en preview)
- Confirmar que en **multiplayer real** (2+ players) todos lo ven igual y el acarreo del rider funciona en los clientes no-host (el host se valida solo).
- Afinar `TV_POS/TV_ROT` si la pantalla del lomo no mira justo a los riders.
- Si querés que sea más fácil de encontrar, se puede sesgar el `START` aleatorio hacia la zona jugable.

### Del handoff anterior (siguen pendientes)
- **Sonidos del paintball**: faltan `assets/sounds/shoot.mp3 / impact.mp3 / footstep.mp3` (el código está listo, solo faltan los .mp3).
- **Panel admin (playlist)**: falta save/load JSON + add-track (necesitan `Input` de react-ecs; las funciones ya existen en `playlist.ts`).
- **Calibración visual**: karts en el estacionamiento, TV noventera grande (alinear el plano de video en `index.ts`), piso/spawns/bots de la arena de paintball.
- **Links de playlists**: revisar/completar las listas IPFS y de Internet Archive.

### Limpieza
- Borrar código muerto: `factory.ts`, `systems.ts`, `utils.ts`, y la grilla `kartPos()`/`BASE_*` sin usar de `kartConfig.ts`.
- Import circular `paintball.ts` ↔ `index.ts` (los `paintballSpawn_*`): mover esos markers a su propio módulo.

---

## 7. Disciplina de git (IMPORTANTE)
El proyecto ya sufrió una pérdida de datos por trabajo sin commitear. **Commitear seguido** (`git add -A && git commit`). El bundle `bin/index.js` NO es fuente confiable de recuperación.
