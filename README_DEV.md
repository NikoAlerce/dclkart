# Guía de desarrollo — nikoalerce.dcl.eth

Documentación técnica del World. Reemplaza toda la documentación vieja (que describía esto como un juego de carreras con vueltas y checkpoints — ese diseño nunca se completó y ya no es el objetivo del proyecto).

## Qué es esto hoy

Un World de Decentraland que funciona como base personal: terreno recorrible en vehículos, con edificios de arte y edificios de venta de packs (LAND + edificio + wearable) para newcomers. Está en construcción activa: se posicionan elementos con el editor 3D propio.

---

## 1. Arquitectura de código

| Archivo | Rol |
|---|---|
| `src/index.ts` | Entry point. Instancia los modelos del terreno/edificios, la plataforma de spawn, el sistema de teletransporte inicial y de rescate, registra los sistemas de física y la UI. |
| `src/kartSystem.ts` | Motor de físicas custom de los vehículos (no usa el Character Controller estándar de DCL). Aceleración, drift, boost, modo nave (vuelo libre), sensores de piso/pared por raycast, cámara elástica, partículas de turbo. |
| `src/kart.ts` | Creación de vehículos, lógica de subir/bajar, colliders, sensores, sincronización multijugador (`syncEntity`), limpieza de duplicados cargados por el Creator Hub. |
| `src/kartConfig.ts` | ⭐ Catálogo declarativo de vehículos: modelo, posición de spawn, tipo (`kart` o `ship`), parámetros de física individuales. |
| `src/components.ts` | Componentes ECS custom: `KartData`, `KartOwner`, `TurboParticle`. |
| `src/ui.tsx` | HUD: coordenadas, panel de debug de colisiones, controles, minimapa. |
| `src/raceState.ts` | Estado global compartido en memoria (posición del vehículo activo, tipo, flags de debug). El nombre es un remanente del diseño de carrera original; hoy es solo estado compartido entre sistemas y UI. |
| `src/spawnConfig.ts` | Posición/rotación de spawn — generado automáticamente por el editor 3D al mover la caja verde de spawn. |
| `src/windParticles.ts` | Ambientación (partículas mágicas). |

### Sistema de coordenadas

La parcela base del World es `35,20` (`scene.json` → `scene.base`). Todas las posiciones en `src/*.ts` son **locales a esa base**, no coordenadas absolutas de Decentraland. Si alguna vez cambiás la parcela base, hay que re-desplazar todas las posiciones (ver historial de commits de `scene.json` / `kartConfig.ts` si necesitás la fórmula de conversión).

### Vehículos: tipos

- **`kart`**: anda por el terreno, sigue la normal del suelo, drift con boost, rebota contra paredes.
- **`ship`**: ignora la gravedad, vuela libremente en los 3 ejes (R/F para subir/bajar), pensado para recorrer el World por arriba.

Para agregar un vehículo nuevo: copiá el `.glb` a `assets/models/`, agregá una entrada en `KART_CONFIGS` (`src/kartConfig.ts`) con un `id` único y estable (es el enumId de sincronización de red — nunca lo reutilices ni lo cambies en un vehículo ya publicado).

---

## 2. Editor 3D propio (no oficial)

Herramienta custom para posicionar elementos visualmente sin editar TypeScript a mano.

```bash
node glb-editor-server.js     # levanta el server en :9000
```

Abrí `http://localhost:9000`. Es Three.js (`glb-editor.html`) + un server Node (`glb-editor-server.js`) que **parsea y reescribe directamente el código fuente real** por regex:

| Lo que movés | Qué reescribe |
|---|---|
| Edificios / modelos del `index.ts` | `src/index.ts` (`Transform.create`) |
| Vehículos | `src/kartConfig.ts` (`spawnPos`, `spawnRotY`, `scale`) |
| Caja verde de spawn | `scene.json` + regenera `src/spawnConfig.ts` |
| Tamaño del World (parcelas) | `scene.json` (`scene.parcels` + `base`) — **solo afecta el preview local**, no el World real en DCL |

Controles: clic para seleccionar (Shift+clic para selección múltiple), gizmo de mover/rotar/escalar (atajos `G`/`R`/`S`), `Ctrl+Z` para deshacer, botón "Cargar todos" para traer todos los `.glb` de `assets/models/` a la escena.

### Limitaciones conocidas

1. **No agrega entidades nuevas.** Solo reposiciona lo que ya existe en `index.ts`. Para colocar un edificio nuevo hay que agregarlo primero a mano (`GltfContainer.create` + `Transform.create` en `index.ts`) — recién ahí el editor lo puede mover. Es la limitación más importante hoy, en plena fase de colocar edificios.
2. **Bug pendiente (`task_38ff5954`):** el parser de vehículos en `glb-editor-server.js` (función `parseKartConfigs`, regex de `spawnRotY`/`scale`) tiene un error de escape que hace que siempre lea rotación=0 y escala=1, sin importar el valor real en `kartConfig.ts`. Si rotás o escalás un vehículo y guardás, te puede pisar esos valores. Mientras no esté arreglado: verificá a mano en `kartConfig.ts` después de guardar un vehículo rotado/escalado.
3. **Override hardcodeado de altura del spawn:** `updateSpawnArea()` ajusta la Y automáticamente según la posición X (`x > -60 → Y=11`, `x < -140 → Y=9`), restos del layout de pista viejo. Si movés el spawn a una zona nueva del terreno, revisá la Y resultante en `scene.json` — puede no ser la que pusiste en el editor.

`glb-inspector.html` es una herramienta distinta y más simple: visor standalone de un único `.glb` por drag & drop, sin servidor ni escritura de archivos — útil para chequear un modelo antes de importarlo.

---

## 3. Despliegue (deploy)

```bash
npx sdk-commands deploy --target-content https://worlds-content-server.decentraland.org
```

Se abre una pestaña pidiendo conectar la wallet `nikoalerce.dcl.eth` y firmar (gratis, sin gas). El deploy tarda 2-5 minutos.

### Problemas comunes al desplegar

- **VPN bloqueada por Cloudflare:** el content server de Decentraland está detrás de Cloudflare, que bloquea rangos de IP de VPNs públicas (Proton, WARP, etc.). Si el deploy falla con "Sorry, you have been blocked", desactivá la VPN. Si tu IP residencial tiene mala reputación (común en conexiones rurales), probá con datos móviles como hotspot.
- **Peso excesivo:** mantené `.dclignore` actualizado para no subir modelos `.blend`/`.fbx`, backups, ni herramientas locales (`glb-editor*`, `scratch/`, etc. — ya están excluidos). Subir de más puede hacer que la conexión se corte por timeout en redes lentas.
- **Deeplink roto en la app de escritorio** ("We couldn't open the deeplink in Decentraland"): pasa por caracteres URL-encodeados en el link o por un proceso colgado de una corrida anterior.
  1. `taskkill /F /IM Decentraland.exe` (Windows) para liberar el puerto.
  2. Pegá el link **sin codificar** en la barra de direcciones del navegador (no hagas clic directo desde un chat/IDE, los protocolos custom suelen bloquearse ahí): `decentraland://realm=http://127.0.0.1:8000&position=0,0&dclenv=org&local-scene=true` (ajustá el puerto si tu servidor corre en otro).

---

## 4. Problemas conocidos / pendientes

- El minimapa en `src/ui.tsx` ha sido calibrado para usar las nuevas coordenadas locales desplazadas por el cambio de base del World.
- Bugs del editor 3D: ver sección 2.
