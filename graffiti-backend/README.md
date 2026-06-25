# Graffiti backend

Hace que los graffitis **persistan entre sesiones** y sean **livianos**: en vez de miles de
entidades en la escena, cada **pared pintable ("panel")** es **una imagen PNG** que este
servidor renderiza y sirve. La escena de Decentraland no puede dibujar texturas en runtime,
por eso el "render a imagen" vive acá.

## Cómo funciona

```
Escena (pintás) ──POST /dab {panel,u,v,color,size}──▶  este servidor
                                                          dibuja la mancha en el PNG del panel
                                                          guarda en disco (data/*.json)
Escena ◀── carga GET /tex/<panel>.png como textura ──    sirve el PNG
Escena ── GET /versions cada ~3s ──▶                     sabe cuándo recargar la textura
```

## Endpoints

- `POST /dab` → `{ panel, u, v, r, g, b, size }` — agrega una mancha (u,v en 0..1; size = fracción del ancho).
- `GET /tex/:id.png` — el PNG del panel (la escena lo usa de textura).
- `GET /versions` — `{ id: version }` para que la escena sepa cuándo recargar.
- `POST /clear` → `{ panel? }` — limpia un panel (o todos). **Protegelo con un token si lo exponés.**

## Correr local

```bash
cd graffiti-backend
npm install
npm start          # http://localhost:8787
```

## Deploy (gratis)

Sirve en cualquier host de Node (Render / Railway / Fly.io / Glitch). Pasos típicos (Render):
1. Subí este repo (o solo esta carpeta) a GitHub.
2. New → Web Service → root `graffiti-backend`, build `npm install`, start `npm start`.
3. Te da una URL `https://...onrender.com`.
4. **Importante:** la escena necesita esa URL en DOS lados:
   - `src/graffitiPanels.ts` → `API_BASE`.
   - `scene.json` → `allowedMediaHostnames` (el host, sin `https://`).

> El disco de los hosts gratis suele ser efímero (se borra al redeploy). Para persistencia
> 100% durable usá un disco persistente (Render Disk) o cambiá `data/` por una DB.

## Agregar un panel

1. Acá en `server.js` → `PANELS` (id + resolución del PNG).
2. En la escena `src/graffitiPanels.ts` → `PANELS` (mismo id + posición/normal/medidas en el mundo).
