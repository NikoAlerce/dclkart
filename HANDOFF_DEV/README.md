# Decentraland Kart Engine

Bienvenido al motor de carreras de Karts (y Naves Voladoras) desarrollado para Decentraland SDK 7.
Este proyecto fue diseñado para permitir arrancar carreras multijugador usando assets y modelos directamente desde el **Creator Hub**, añadiéndoles físicas y comportamientos complejos por encima.

## Arquitectura de Carpetas

La lógica de negocio y físicas de la escena se encuentra dentro de `src/`:

- **`index.ts`**: El punto de entrada de la escena. Crea la pista base, dispara el escaneo automático de Karts del Creator Hub (`scanAndConvertKarts`), y registra el sistema global de físicas.
- **`kart.ts`**: Contiene la lógica principal de creación, teletransportación e inicialización. Aquí vive el escáner mágico que lee el mapa en el primer frame buscando modelos `.glb` que tengan `"kart"` o `"nave"` en su nombre y los reemplaza por entidades manejables.
- **`kartSystem.ts`**: El corazón del motor. Un bucle de físicas ultra-optimizado que calcula cada fotograma (dt) cosas como inercia, derrape (drift con "vaivén"), gravedad, raycasting dinámico hacia el suelo y rebotes contra paredes.
- **`components.ts`**: Aquí se definen los Custom Components del ECS de Decentraland (SDK 7). El principal es `KartData`, el cual guarda la velocidad actual, rotación de las ruedas, si está siendo ocupado y las variables del derrape.
- **`raceState.ts`**: Contiene el estado global de la carrera (Lobby, Countdown, Racing, Finished).
- **`ui.tsx`**: Interfaz de usuario (React-ECS) renderizando el semáforo, número de vueltas, checkpoints y botones de ayuda de forma reactiva.

## Primeros Pasos

Si recién te unís al proyecto, te recomiendo leer los documentos en esta carpeta en el siguiente orden:

1. **`INSTRUCCIONES_BEVY.md`**: Es vital que leas esto para saber cómo correr el juego localmente sin que Windows te bloquee el servidor.
2. **`ESPECIFICACIONES_TECNICAS.md`**: Aquí se detallan los números duros, los sistemas de físicas y el ECS.
3. **`ERRORES_COMUNES.md`**: Lleno de "gotchas" técnicos (cosas de Decentraland que nos hicieron perder tiempo y que no están tan bien documentadas oficialmente).
4. **`PROXIMOS_PASOS.md`**: El roadmap de lo que podrías atacar para continuar iterando este juego.

¡Mucha suerte en la siguiente iteración!
