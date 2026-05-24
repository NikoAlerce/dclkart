# Especificaciones Técnicas y Arquitectura (DCL Kart Engine)

El motor ha sido escrito de forma pura sobre el **ECS** (Entity Component System) de Decentraland SDK 7, sin depender de librerías externas para la simulación física (todo es custom para dar una vibra estilo Mario Kart).

## Ciclo de Físicas
El sistema `kartMovementSystem` se ejecuta en cada frame e itera sobre todas las entidades que posean el custom component `KartData` y `Transform`.

### Sistema de Derrape (Drift)
Hemos emulado la jugabilidad clásica arcade. Cuando un usuario presiona `Jump` (Espacio) y está girando, se activa el modo drift.
1. Se guarda un timestamp del tiempo de derrape para luego calcular un "Mini-Turbo" (Boost).
2. La dirección real en la que avanza el kart se desconecta gradualmente de la dirección en la que visualmente mira el modelo. Esto genera que el kart vaya de costado.
3. Se añadió un factor de **"vaivén" matemático** (péndulo), el cual hace que cuando se termina el derrape, la cámara y el modelo rebote hacia el centro con inercia elástica para que se sienta jugoso (game feel).

### Raycast de Suspensión (Gravidez)
Para evitar los problemas de colisiones directas de Unity, la "gravedad" de nuestros karts se maneja proyectando un rayo invisible (Raycast) directo hacia abajo desde el centro de gravedad del kart en cada frame:
- Si toca piso, ajustamos suavemente el Transform Y del vehículo a la altura del impacto + una constante de suspensión.
- Esto permite subir y bajar montañas y rampas sin que el vehículo tiemble, manteniéndose plantado firmemente.

## Componente "Nave" (Ship)
Existe una variante definida en `KartData` como `vehicleType === 'ship'`.
- En lugar de anclarse al piso, la nave ignora el raycast hacia abajo.
- Utiliza las entradas `InputAction.IA_PRIMARY` (E) y `InputAction.IA_SECONDARY` (F) para sumar o restar aceleración a su variable `shipVertSpeed` (velocidad vertical).

## El Escáner de Mallas (Auto-Integración con Creator Hub)
Para evitar que el usuario tenga que escribir código typescript para spawnear karts, implementamos la función `scanAndConvertKarts()` en `kart.ts`.
**¿Cómo funciona?**
1. Al cargar la escena, itera por todas las entidades del mapa.
2. Comprueba sus componentes `GltfContainer`. Si el "src" contiene la palabra `"kart"` o `"nave"`, clona su posición (Transform).
3. Elimina el objeto inerte original, e instancia una réplica manejable con `createKart()` asignándole el modelo gráfico encontrado.
Esto permite "construir" niveles en la herramienta web o desktop oficial y convertirlos en jugables mágicamente en runtime.
