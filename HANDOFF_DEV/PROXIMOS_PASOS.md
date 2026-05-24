# Próximos Pasos y Tareas Pendientes

¡Bienvenido a la próxima etapa del proyecto! Aquí tienes una lista sugerida de tareas técnicas y comerciales para seguir escalando este motor de karts.

## Tareas Técnicas / Core

- [ ] **Física de Choques entre Karts:** Actualmente los karts rebotan contra las paredes (raycast horizontal) y se apoyan en el piso (raycast vertical), pero si dos jugadores chocan de costado no hay inercia transferida ni colisión sólida. Integrar un chequeo de proximidad entre las posiciones de entidades que tienen `KartData`.
- [ ] **Sincronización Multijugador Suave:** Mejorar el lag de red. Decentraland actualiza la posición entre clientes de forma periódica, pero para vehículos rápidos necesitamos predecir e interpolar (lerp) las posiciones de los rivales en base a su velocidad actual y `lastSafeRotY` para que los otros autos no se vean "saltar" en pantallas de terceros.
- [ ] **Partículas y Humo:** Investigar el uso del SDK 7 `ParticleSystem` para spawnear partículas de humo o fuego debajo de la rueda trasera cuando la variable `isDrifting` en `KartData` es verdadera. (Ojo, el ECS 7 soporta `ParticleSystem` pero es muy crudo, quizá usar billboards).
- [ ] **Audio Engine:** Conectar el componente `AudioSource` de DCL a un sonido de motor que escale su pitch (tono) o volumen dependiente de la variable `currentSpeed` del `KartData`.

## Tareas de Gameplay y Negocio

- [ ] **Diseño de Pistas (Creator Hub):** Construir una pista cerrada real en Decentraland Creator Hub con rampas y curvas, y asegurarse de no sobrepasar el límite de polígonos del mapa.
- [ ] **Monedas y Power-ups:** Spawnear "Cajas Misteriosas" (como las de Mario Kart) en coordenadas hardcodeadas. Cuando el kart las toca, aplicar un modificador al `maxSpeed` temporal (Turbo) o darle un item de uso con la tecla `Jump`.
- [ ] **Leaderboard / Tabla de Posiciones:** Conectar el inicio y fin de una vuelta (usando volúmenes o triggers invisibles de checkpoint) a una base de datos externa (como Firebase o Colyseus) para mostrar un Scoreboard persistente en `ui.tsx`.
