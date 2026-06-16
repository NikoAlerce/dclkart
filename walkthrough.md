# 🏎️ Guía de mantenimiento — dclkart
*Instrucciones para modificar y publicar tu mundo sin depender de nadie.*

---

## 🔧 Requisitos previos (una sola vez)
Asegurate de tener instalado en tu computadora:
- **Node.js** (v18 o superior): https://nodejs.org
- **Git**: https://git-scm.com
- El proyecto ya descargado en `C:\Users\Mami\Desktop\mariokart2`

---

## 📁 Estructura del proyecto (los archivos que importan)

```
mariokart2/
├── assets/
│   └── models/
│       ├── track.glb        ← La pista
│       ├── kart.glb         ← Kart 1
│       ├── kart2.glb        ← Kart 2 (reemplazá con tu modelo)
│       ├── kart3.glb        ← Kart 3 ... hasta kart10.glb
│       └── ...
├── src/
│   ├── kartConfig.ts        ← ⭐ ÚNICO archivo que editás para agregar/mover karts
│   ├── kart.ts              ← Física de entrada/salida del kart
│   ├── kartSystem.ts        ← Física de movimiento (aceleración, drift, boost)
│   ├── index.ts             ← Punto de entrada (no necesitás tocarlo)
│   └── ui.tsx               ← HUD y semáforo
└── scene.json               ← Configuración del mundo (spawn, nombre)
```

---

## 🚗 Agregar un nuevo modelo de kart

1. Exportá tu kart desde Blender como `.glb` (**File → Export → glTF 2.0**)
   - En las opciones: activá **Apply Modifiers** y **Tangents**
   - Para mejores texturas en DCL: **Metallic = 0**, **Roughness = 0.8-1.0**
   
2. Renombrá el archivo como `kart2.glb` (o el número que corresponda)

3. Copialo a `C:\Users\Mami\Desktop\mariokart2\assets\models\`

4. ¡Listo! No hace falta tocar ningún `.ts`. El código ya apunta a ese nombre.

### Si querés cambiar la posición de spawn de un kart específico:
Abrí `src/kartConfig.ts` y modificá el campo `spawnPos` de ese kart:
```typescript
{ id: 2, modelPath: 'assets/models/kart2.glb', spawnPos: Vector3.create(X, Y, Z), spawnRotY: 50 },
//                                                                              ↑ cambiá estas coordenadas
```

---

## 🛣️ Modificar la pista

1. Abrí el proyecto de Blender de la pista
2. Hacé tus cambios
3. Exportá como `track.glb` (**File → Export → glTF 2.0**)
   - En las opciones de exportación, sección **Geometry**: activá **Apply Modifiers**
   - **Include → Cameras**: desactivado; **Include → Punctual Lights**: opcional
4. Reemplazá el archivo en `assets\models\track.glb`

### Importante si moviste la pista en Blender:
La pista se posiciona en el mundo con estas líneas en `src/index.ts`:
```typescript
Transform.create(trackEntity, {
  position: Vector3.create(472, 10.0, 248),  // ← posición en DCL
  scale:    Vector3.create(1, 1, 1)
})
```
Si cambiás la posición en Blender, puede que tengas que ajustar estas coordenadas.

---

## 🚀 Publicar a Decentraland (deploy)

### Paso 1: Abrir la terminal
- Hacé clic en Inicio → buscá **"PowerShell"** → abrilo
- Escribí:
```powershell
cd C:\Users\Mami\Desktop\mariokart2
```

### Paso 2: Lanzar el deploy
```powershell
npx sdk-commands deploy --target-content https://worlds-content-server.decentraland.org
```

### Paso 3: Firmar con tu wallet
- El comando va a abrir un link en `http://localhost:8001/`
- Abrilo en tu navegador
- Conectá tu wallet **nikoalerce.dcl.eth**
- Aprobá la firma

### Paso 4: Esperar
El deploy tarda 2-5 minutos. Cuando termine, vas a ver en la terminal:
```
info: Content uploaded. New entity deployed
```

### Paso 5: Verificar
Entrá a tu mundo en DCL:
```
https://decentraland.org/worlds/nikoalerce.dcl.eth
```

---

## 💾 Guardar cambios en GitHub (backup)

Cada vez que hagas cambios, guardá en GitHub para no perder nada:

```powershell
cd C:\Users\Mami\Desktop\mariokart2
git add -A
git commit -m "descripción de lo que cambiaste"
git push origin main
```

Ejemplo:
```powershell
git commit -m "Agregué kart2 modelo rojo y modifiqué la curva 3"
```

Tu repo: **https://github.com/NikoAlerce/dclkart**

---

## 16. Verificación de Compilación
- El código se compila limpiamente mediante `npm run build` sin errores.
- El servidor de desarrollo local se recarga automáticamente y ha desplegado la última versión de la escena.

---

## 17. Ambientación de Tarde Noche y Faroles Iluminados

### Cambios Realizados
- **Configuración de Cielo a Atardecer/Anochecer:** Modificamos [scene.json](file:///C:/niko/escritorio/mariokart2/scene.json) para establecer `skyboxConfig.fixedTime: 73800` (20:30 hs). Esto le da a la escena un hermoso cielo cálido crepuscular (tonos naranja y morado), ideal para un ambiente nocturno de carreras.
- **Escaneo de Faroles de la Pista:** Escribimos un script geométrico para escanear y agrupar las mallas con material `lights_mat.001` dentro de `track.glb`. Esto detectó con total precisión las **208 posiciones 3D** de las bombillas de los faroles a lo largo del circuito (incluyendo la pista baja y el puente elevado).
- **Array de Posiciones Estáticas:** Guardamos estas coordenadas en [src/lightsConfig.ts](file:///C:/niko/escritorio/mariokart2/src/lightsConfig.ts) para cargarlas de forma segura y eficiente en el cliente.
- **Spawneo de Luces y Bombillas Encendidas:** Modificamos [src/index.ts](file:///C:/niko/escritorio/mariokart2/src/index.ts) para recorrer las coordenadas y en cada punto crear:
  1. Un componente `LightSource` de tipo puntual con color cálido (amarillo/naranja), intensidad de 2500 candelas y un rango de 15 metros, proyectando luz en tiempo real sobre la calle, los karts y los árboles.
  2. Un pequeño `MeshRenderer.setSphere` con escala `0.25` y un material PBR fuertemente emisivo que simula visualmente la bombilla encendida y brillante dentro de la estructura de cada farol del track.

---

## 18. Verificación Final de Compilación
- El proyecto compila y genera el bundle final mediante `npm run build` con éxito y sin advertencias ni errores de TypeScript.

---

## 🔄 Restaurar desde GitHub (si algo se rompe)

Si algo se rompe y querés volver a la última versión guardada:
```powershell
cd C:\Users\Mami\Desktop\mariokart2
git checkout -- .
```

Esto descarta todos los cambios locales y vuelve al último commit.

---

## 🎮 Probar localmente antes de publicar

```powershell
cd C:\Users\Mami\Desktop\mariokart2
npx sdk-commands start --bevy-web
```

Abrí en el navegador: `https://decentraland.zone/bevy-web/?preview=true&realm=http://127.0.0.1:8000`

---

## ⚙️ Ajustar física del kart

Todo en `src/kartSystem.ts` — los valores están al principio del archivo con comentarios claros:

| Variable | Qué controla | Valor actual |
|---|---|---|
| `maxSpeed` | Velocidad máxima | 32 m/s |
| `acceleration` | Aceleración | 20 |
| `turnSpeed` | Velocidad de giro | 75 |
| `DRIFT_BOOST_SPEED` | Boost al salir del drift | buscar en el archivo |

Los valores en `KartData.create()` dentro de `kart.ts` son los valores iniciales de cada kart.

---

## 🆘 Problemas comunes

| Problema | Solución |
|---|---|
| El kart es invisible | Verificá que `kart.glb` esté en `assets/models/` |
| La pista es invisible | Verificá que `track.glb` esté en `assets/models/` |
| Hay dos pistas superpuestas | Borrá `assets/scene/main.composite` si existe |
| El deploy falla | Asegurate de tener DCL conectado y la wallet activa |
| No compila (`error TS...`) | Revisá que no hayas roto la sintaxis en el `.ts` que editaste |
| El kart spawnea en el aire | Ajustá el `Y` en `kartConfig.ts` para ese kart |

---

## 19. Sincronización de Karts con el Editor GLB

### Cambios Realizados
- **Persistencia en Editor:** Se modificó `glb-editor-server.js` para añadir soporte completo a la rotación (`spawnRotY` en grados) y escala (`scale`) de los karts. Ahora, cuando rotás o escalás un kart usando el Gizmo en el Editor GLB en la web y guardás los cambios, la configuración se escribe correctamente en `src/kartConfig.ts` (extrayendo el ángulo Y del cuaternión en 3D y filtrando escalas redundantes de 1.0).
- **Spawneo Robusto en DCL:** Se actualizó `src/kart.ts` para que los karts funcionales se spawneen **siempre** desde la configuración `KART_CONFIGS` (asegurando que tomen las coordenadas guardadas por el editor).
- **Limpieza de Duplicados:** En el primer frame de la escena, el juego escanea cualquier entidad estática de kart duplicada cargada por Decentraland desde el Creator Hub (`main.crdt`) y las elimina, manteniendo únicamente los karts dinámicos en sus posiciones correctas del editor.

---

## 20. Sincronización del Área de Spawn con el Editor GLB

### Cambios Realizados
- **Integración de Transformaciones Completas:** Modificamos `glb-editor-server.js` para que la función `updateSpawnArea` reciba y procese la rotación (cuaternión) y la escala (tamaño) de la caja verde de spawn.
- **Actualización de scene.json:** El servidor ahora recalcula y actualiza de forma automática en `scene.json`:
  - Los límites exactos (`position.x`, `position.y`, `position.z`) multiplicando la escala por las dimensiones base.
  - El vector `cameraTarget` rotado en la dirección Yaw en la que apuntaba la caja en el editor.
- **Actualización de src/spawnConfig.ts:** Genera dinámicamente las constantes de spawn con el objetivo de cámara y la rotación actualizados.
- **Guardado Manual Sincronizado:** Modificamos el frontend del editor (`glb-editor.html`) para que el botón de guardado de la barra lateral extraiga y envíe la rotación y escala actual del modelo en Three.js al servidor.

---

## 21. Sistema de Teletransporte Inicial Seguro (StartupSpawnSystem)

# Implementación Reciente

## Sincronización de Coordenadas entre Editor 3D y Decentraland

Hemos resuelto definitivamente el problema donde el Editor 3D mostraba la escena correctamente pero en Bevy el jugador aparecía a 500 metros de la pista y en coordenadas erróneas. 

### ¿Qué estaba fallando?
La escena original tenía su parcela base en `0,0`, pero el usuario ingresaba mediante el enlace a la parcela `35,20`. Esto provocaba que el motor Bevy interpretara las coordenadas locales como si estuvieran desplazadas 560 metros en X y 320 metros en Z, causando un desfase crítico entre lo que leía el Editor 3D (que ignora parcelas) y lo que procesaba Decentraland SDK7. Además, el `main.crdt` (generado por el Creator Hub) tenía pistas duplicadas en la coordenada `0,0` absoluta, contribuyendo a la confusión.

### Solución Implementada
1. **Cambio de Parcela Base:** Actualizamos `scene.json` para que `"base": "35,20"`. Esto convierte a la parcela `35,20` (coordenada de mundo absoluto `560,320`) en el origen `0,0` local de la escena.
2. **Desplazamiento Global:** Restamos `560` en X y `320` en Z a todas las coordenadas del proyecto.
   * La pista (`track.glb`) pasó de `(472, 10, 248)` a `(-88, 10, -72)`.
   * Los karts (en `kartConfig.ts`) se ajustaron a su nueva posición relativa local (ej. Kart 1 ahora está en `31.8, 10.1, -16.7`).
   * El `spawn_area` (en `spawnConfig.ts` y `scene.json`) ahora está configurado en `8.7, 11, 2.0`.
3. **Editor 3D Sincronizado:** Adaptamos `glb-editor-server.js` para que los umbrales de auto-ajuste de altura (Y) reconozcan la nueva ubicación del estacionamiento y pista en coordenadas locales (ej: el estacionamiento ahora está alrededor de `X > -60`).

### Verificación Realizada
* [x] Lectura profunda del sistema y scripts de validación con Python de los polígonos del GLTF.
* [x] Compilación exitosa de tipos en TypeScript (`npm run build`).

### Pasos de Validación para el Usuario:
1. Asegurarte de que el servidor del editor y el cliente de Bevy estén levantados:
   * En una terminal corre: `node glb-editor-server.js` (Accede en `http://localhost:9000`)
   * En otra terminal corre: `npm start`
2. Abre la ventana de previsualización en Modo Incógnito (para limpiar caché del crdt): `https://decentraland.zone/bevy-web/?preview=true&realm=http://127.0.0.1:8000&position=35,20`
3. Comprueba que ahora apareces exactamente en el área de parking donde configures el spawn en tu Editor 3D.

---

## 22. Resolución de Discrepancias de Coordenadas de Pista y Spawn

### Cambios Realizados
- **Identificación de la Causa Raíz:** Detectamos que el archivo `main.crdt` (generado por el Creator Hub) carga versiones duplicadas estáticas de `track.glb`, `flowerman.glb`, `arboles.glb` y `trees.glb` a `(0, 0, 0)`. Dado que `index.ts` paralelamente las creaba desplazadas en `(472, 10, 248)`, el jugador caía sobre la pista de tierra de la copia en `(0, 0, 0)`, quedando desalineado respecto al estacionamiento y spawn correctos.
- **Limpieza de Escenario:** Ampliamos el sistema `cleanupCreatorHubKarts` en `src/kart.ts` para que no solo detecte karts estáticos duplicados del Creator Hub, sino también archivos de pista y entorno (`track.glb`, `flowerman.glb`, `arboles.glb`, `trees.glb`) cargados desde `main.crdt` y los elimine del motor.
- **Registro de Entidades Válidas:** Modificamos `src/index.ts` para que registre las entidades creadas por código en el Set `spawnedModelEntities` del limpiador, previniendo su remoción accidental.
- **HUD y Telemetría Dinámica:** El panel verde de diagnóstico superior derecho en la pantalla ahora lee dinámicamente la posición registrada por el motor en tiempo real (`Transform.get(trackEntity).position`) en lugar de mostrar un valor hardcodeado. Adicionalmente, el cliente reporta sus logs de inicialización y posicionamiento vía HTTP GET `/api/diagnostics` al servidor en el puerto 9000, permitiendo verificar los cambios sin abrir DevTools en el cliente.
