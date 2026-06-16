# 🚀 Guía de Despliegue y Optimización — nikoalerce.dcl.eth

Esta guía detalla los motivos por los cuales fallaban las subidas del mundo a Decentraland, qué archivos son estrictamente necesarios para el proyecto y cuáles se deben ignorar en el archivo `.dclignore` para evitar bloqueos del servidor y subir la escena de la forma más rápida y limpia posible.

---

## 🛑 ¿Por qué fallaba la subida? (Motivos del Bloqueo)

1. **Bloqueo por Uso de VPN (Proton / WARP)**:
   El servidor de contenido de Decentraland (`worlds-content-server.decentraland.org`) está protegido por Cloudflare. Cloudflare bloquea por defecto los rangos de IPs de la mayoría de las VPN públicas y gratuitas para evitar ataques automatizados, lanzando un error del tipo: *"Sorry, you have been blocked"*.
   
2. **Exceso de Peso en la Subida (Payload Bloat)**:
   Originalmente, el proyecto intentaba subir carpetas de respaldo como `HANDOFF_DEV` que contenían carpetas `node_modules` internas muy pesadas (más de 300 MB). Aunque luego se ignoraron, el proyecto seguía pesando más de 128 MB debido a archivos redundantes y herramientas locales.
   
3. **Mallas 3D Duplicadas y Sin Uso**:
   La carpeta `assets/models/` contenía el archivo `trees.glb` (35.5 MB) y `arboles.glb` (37.6 MB). El código de la escena en `src/index.ts` solo utiliza `arboles.glb`. Subir ambos archivos significaba subir 35.5 MB de basura, elevando el peso total y saturando las conexiones residenciales de baja velocidad (rurales), lo que hacía que Cloudflare cortara la conexión por límite de tiempo.

---

## 📦 Archivos Necesarios (Lo que la escena sí usa)

Para que el juego funcione, compile y se vea correctamente en Decentraland, **solo se requieren** los siguientes archivos y carpetas:

### 1. Configuración y Dependencias:
*   [scene.json](file:///C:/niko/escritorio/mariokart2/scene.json): Contiene la cantidad de parcelas (parcels), el punto de spawn de la cámara, el título, la hora del cielo (`skyboxConfig.fixedTime`) y el nombre del mundo (`nikoalerce.dcl.eth`).
*   [package.json](file:///C:/niko/escritorio/mariokart2/package.json): Define qué paquetes del SDK de Decentraland se usan y los scripts de compilación (`npm run build`).
*   [tsconfig.json](file:///C:/niko/escritorio/mariokart2/tsconfig.json): Configuración del compilador de TypeScript.

### 2. Código Fuente (Carpeta `src/`):
*   [src/index.ts](file:///C:/niko/escritorio/mariokart2/src/index.ts): Punto de entrada. Crea la pista, los árboles, llama a la conversión de naves a karts y carga las luces nocturnas.
*   [src/kart.ts](file:///C:/niko/escritorio/mariokart2/src/kart.ts): Convierte los modelos GLB importados en vehículos conducibles y maneja la lógica de subida y bajada del jugador.
*   [src/kartConfig.ts](file:///C:/niko/escritorio/mariokart2/src/kartConfig.ts): Define cuántos karts hay en la escena, qué modelos GLB usan, su escala y sus posiciones de spawn de salida.
*   [src/kartSystem.ts](file:///C:/niko/escritorio/mariokart2/src/kartSystem.ts): Física del kart (gravedad, aceleración, giros, comportamiento del derrape, velocidad y partículas de turbo).
*   [src/components.ts](file:///C:/niko/escritorio/mariokart2/src/components.ts): Componentes de datos personalizados de Decentraland (ECS7) para guardar velocidades, estados de derrape y más.
*   [src/lightsConfig.ts](file:///C:/niko/escritorio/mariokart2/src/lightsConfig.ts): Contiene el array con las **208 posiciones 3D exactas** de las bombillas de los faroles para poder spawnear luces en tiempo real.
*   [src/raceState.ts](file:///C:/niko/escritorio/mariokart2/src/raceState.ts) y [src/ui.tsx](file:///C:/niko/escritorio/mariokart2/src/ui.tsx): Estado de la carrera y el HUD en pantalla (tacómetro, velocidad, semáforo, botones).

### 3. Modelos y Texturas (Carpeta `assets/`):
*   `assets/models/track.glb` (16.2 MB): La pista de carreras física.
*   `assets/models/flowerman.glb` (16.6 MB): Decoración / paisaje de flores y terreno.
*   `assets/models/arboles.glb` (37.6 MB): Los árboles y follaje que decoran el circuito.
*   `assets/models/kart.glb` hasta `kart10.glb` (aprox. 2 MB c/u): Modelos 3D de los karts que conducen los jugadores.
*   `assets/images/` y `images/`: Contiene imágenes de minitapiz, imágenes del HUD y texturas necesarias.

---

## 🚫 Archivos a Ignorar (No deben subirse)

Para evitar subir archivos basura y evitar bloqueos por peso excesivo, configuramos el archivo [.dclignore](file:///C:/niko/escritorio/mariokart2/.dclignore) para ignorar lo siguiente:

| Archivo / Carpeta | ¿Qué es? | ¿Por qué ignorarlo? |
| :--- | :--- | :--- |
| `HANDOFF_DEV` | Carpeta de desarrollo alternativa | Contiene código anterior y su propio `node_modules` (300MB+). |
| `scratch/` | Scripts de análisis geométrico (`.py`) | Son herramientas de python que usamos localmente para extraer las coordenadas de los faroles. Decentraland no las necesita. |
| `temp/` | Archivos temporales | Basura de compilación local. |
| `assets/models/trees.glb` | Modelo de árboles duplicado | Es una versión sin usar de los árboles (35.5 MB). Solo usamos `arboles.glb`. |
| `glb-editor.html` / `glb-inspector.html` / `glb-editor-server.js` | Herramientas locales de inspección 3D | Herramientas web que usamos para visualizar los nodos del modelo GLB. |
| `scene_backup.json` | Respaldo de configuración | Copia de seguridad local de la configuración del mundo. |
| `glb_nodes.txt` / `kartSystem_history.txt` | Notas e historiales de texto | Archivos de texto con análisis internos que no aportan al funcionamiento de la escena en línea. |

---

## 💡 Recomendaciones para Futuros Despliegues

1. **Desactivar VPNs**: Asegurate de que **Proton VPN**, **Cloudflare WARP** o cualquier otra VPN estén **completamente apagadas** antes de ejecutar `npx sdk-commands deploy`.
2. **Usar Anclaje de Datos Móviles (Hotspot) si falla**: Si tu red Wi-Fi residencial es rural o tiene una IP dinámica con mala reputación que Cloudflare bloquea, compartí datos móviles 4G/5G desde tu celular a la computadora. Las redes celulares tienen IPs con excelente reputación de cara a Cloudflare.
3. **Mantener el `.dclignore` actualizado**: Si agregás carpetas de notas, modelos viejos de Blender (`.blend`), backups de Photoshop (`.psd`) o archivos pesados que no se carguen en el código, agregalos siempre al `.dclignore`.
