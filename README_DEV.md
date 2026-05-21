# Decentraland Mario Kart - Guía para Desarrolladores

Este documento resume la arquitectura, físicas y flujos de trabajo de este proyecto de carreras construido sobre Decentraland SDK 7, para facilitar la integración de futuros desarrolladores.

## 🚀 Cómo correr el proyecto localmente (¡IMPORTANTE: BEVY-WEB!)

Para levantar el servidor de pruebas local, abrí una terminal en la raíz del proyecto y ejecutá ESTE comando exacto:

```bash
npx sdk-commands start --bevy-web
```

> [!WARNING]
> **¿Por qué `--bevy-web` y no el comando normal?** 
> Nos costó sangre llegar a esta conclusión. El cliente web estándar de Decentraland tiene problemas graves de rendimiento y latencia a la hora de procesar físicas a alta velocidad. Si corrés el proyecto sin la bandera `--bevy-web`, el juego te va a andar trabado, el framerate de la cámara va a temblar y los `Raycasts` de los choques van a fallar. El motor "Bevy" es el nuevo cliente experimental en Rust/WASM y es **el único** capaz de correr nuestras físicas de kart a 60 FPS estables. ¡No lo corras sin esa bandera!

Una vez que termine de compilar, te va a dar un link en la consola (usualmente `http://127.0.0.1:8001` o similar) que podés abrir en tu navegador.

> **Importante:** Decentraland cachea agresivamente los archivos `.glb`. Si modificás la malla 3D de la pista, a veces vas a tener que reiniciar este comando o hacer `Ctrl + F5` en el navegador para ver los cambios.

---

## 🛠️ Arquitectura de Físicas (Game Feel)

El mayor valor técnico de este proyecto es que **NO utiliza el Character Controller estándar** de Decentraland, sino un motor de físicas 100% custom (`src/kartSystem.ts`) diseñado para imitar el "Game Feel" de juegos Arcade de consola.

*   **Curva de Dirección (Steering):** Se implementó una curva inversa. A baja velocidad el radio de giro está multiplicado por `x1.6` (permite giros cerrados), y a alta velocidad baja a `x1.4` (evita vuelcos incontrolables).
*   **Drift y Slip Angle:** Cuando el jugador presiona Shift, se activa el derrape. El modelo visual del kart gira dinámicamente hasta 65 grados respecto a su trayectoria física real. Al soltar la tecla, un sistema de resortes matemáticos (pendulum) devuelve el auto a su centro de manera suave.
*   **Partículas y Luces:** El kart cuenta con una luz dinámica (`LightSource`) debajo del chasis y un emisor de partículas que cambia de color según la duración del derrape (Amarillo -> Naranja -> Cyan).
*   **Cámara Elástica (Lerp):** La cámara persigue al kart de forma elástica, retrasándose un poco al doblar y alejándose (zoom invertido) al llegar a máxima velocidad para dar sensación de vértigo.

---

## 🏎️ Gestor de Carrera y Checkpoints

La lógica de carrera se encuentra en `src/raceState.ts` y está acoplada al sistema de colisiones.

1.  **Estados:** Existen 4 estados (`LOBBY`, `COUNTDOWN`, `RACING`, `FINISHED`). Al subir al kart, los controles se bloquean y comienza una cuenta regresiva.
2.  **Sensores Fantasma:** El kart proyecta un `Raycast` hacia adelante. Si choca con un muro que tenga la palabra `checkpoint` en su nombre, el sistema omite el rebote (fricción de pared) y lo registra como un paso de vuelta válido en `RaceState`.
3.  **Orden Estricto:** El jugador está obligado a tocar los checkpoints secuencialmente (`0 -> 1 -> 2 -> 3`).

---

## 🎨 Flujo de Trabajo en Blender (Modelado de Pistas)

Si necesitás crear nuevas pistas, modificá el archivo `track.glb` en la raíz del proyecto siguiendo estas reglas estrictas:

1.  **Formatos de Textura:** Decentraland SDK 7 / Bevy **NO SOPORTA WebP** nativamente para todas las configuraciones. Al exportar desde Blender 4.x, andá a `Data > Images > Format` y asegurate de elegir `JPEG` o `PNG`. Si exportás en WebP, la pista entera será invisible.
2.  **Checkpoints:** Para crear puntos de control, dibujá planos invisibles a lo largo de la pista y nombralos exactamente así en la jerarquía:
    *   `checkpoint_0_collider` (Para la línea de largada/llegada)
    *   `checkpoint_1_collider` (Para el 25% de la pista)
    *   `checkpoint_2_collider` (Para el 50%), etc.
    *   *Nota: El sufijo `_collider` hace que Decentraland los cargue como paredes físicas invisibles de forma automática.*
---

## 🌍 Cómo subir (Deploy) este proyecto a tu propio "World" (DCL Name)

Cuando el juego esté listo para publicarse en tu mundo personal (vinculado a tu nombre de Decentraland, por ejemplo `tunombre.dcl.eth`), tenés que seguir estos 3 pasos:

1. **Configurar el nombre del Mundo en `scene.json`:**
   Abrí el archivo `scene.json` y agregá este bloque al final del archivo (antes de la última llave `}`):
   ```json
   "worldConfiguration": {
     "name": "tunombre.dcl.eth"
   }
   ```
   *(Asegurate de reemplazar `tunombre.dcl.eth` por el nombre real que tenés en tu wallet).*

2. **Ejecutar el comando de subida:**
   En tu terminal, cancelá el servidor de prueba (`Ctrl + C`) y ejecutá:
   ```bash
   npx sdk-commands deploy
   ```

3. **Firmar con tu Wallet:**
   El comando va a abrir automáticamente una pestaña en tu navegador. Decentraland te va a pedir que conectes tu billetera (Metamask, etc.) donde tenés guardado el nombre `.dcl.eth` y que firmes la transacción. Es una firma gratuita (no cobra gas fee de Ethereum).

¡Listo! En un par de minutos tu circuito de carreras va a estar en vivo en `https://play.decentraland.org/?realm=tunombre.dcl.eth`.
