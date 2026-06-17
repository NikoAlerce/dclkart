# nikoalerce.dcl.eth — World base

Mi World personal en Decentraland (SDK7), desplegado en `nikoalerce.dcl.eth`. No es un juego de carreras: es una base que se recorre en vehículos (autos y naves voladoras) y que combina:

- **Galería de arte** — edificios donde se exhibe mi trabajo.
- **Locales de venta** — edificios donde se promocionan y venden *packs* para newcomers de Decentraland: LAND + edificio prefabricado + (opcionalmente) un wearable.
- **Vehículos** — karts que andan por el terreno y naves que vuelan, con físicas custom (ver [README_DEV.md](README_DEV.md)).

El mundo se está armando ahora mismo: se posicionan edificios, vehículos y el punto de spawn con un **editor 3D propio** (no oficial, ver más abajo).

## Probar localmente

```bash
npm install
npx sdk-commands start --bevy-web
```

Abrí el link que te da la consola en el navegador. Usar `--bevy-web` es importante para que las físicas de los vehículos corran fluidas (ver detalles en [README_DEV.md](README_DEV.md)).

## Editor 3D (herramienta propia)

Para posicionar edificios, vehículos y el spawn visualmente:

```bash
node glb-editor-server.js
```

Abrí `http://localhost:9000`. El editor lee y reescribe directamente `src/index.ts`, `src/kartConfig.ts` y `scene.json` — no es parte del juego, no se despliega (está en `.dclignore`). Detalles, limitaciones y bugs conocidos en [README_DEV.md](README_DEV.md).

## Publicar (deploy)

```bash
npx sdk-commands deploy --target-content https://worlds-content-server.decentraland.org
```

Firmá con la wallet `nikoalerce.dcl.eth` cuando se abra el navegador. Guía completa de despliegue y problemas comunes en [README_DEV.md](README_DEV.md).

## Estructura del proyecto

```
mariokart2/
├── assets/models/        ← modelos .glb (terreno, edificios, vehículos)
├── src/                   ← lógica de la escena (TypeScript, SDK7/ECS)
│   ├── index.ts           ← entry point: instancia modelos y sistemas
│   ├── kartConfig.ts       ← ⭐ catálogo de vehículos (posición, física, tipo)
│   ├── kartSystem.ts        ← físicas de los vehículos
│   └── kart.ts              ← subir/bajar del vehículo, sincronización de red
├── scene.json              ← parcelas, spawn point, configuración del World
├── glb-editor.html / glb-editor-server.js  ← editor 3D propio (no oficial)
└── glb-inspector.html      ← visor GLB standalone (drag & drop, sin servidor)
```

Para la guía técnica completa (arquitectura de físicas, cómo agregar vehículos/edificios, deploy, troubleshooting) ver **[README_DEV.md](README_DEV.md)**.

Documentación oficial de Decentraland SDK7: https://docs.decentraland.org/creator/
