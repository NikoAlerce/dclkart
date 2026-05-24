# Guía: Cómo correr un proyecto de Decentraland en Bevy (Local)

Correr el preview de Decentraland usando el motor **Bevy** (Desktop/Web) es mucho más rápido y rinde mejor en FPS que el motor clásico de la web. Sin embargo, hay algunos trucos y problemas comunes, especialmente en Windows.

Aquí te explicamos paso a paso cómo hacerlo.

---

## 1. El Comando Estándar

El comando oficial para levantar el servidor local y abrir el cliente de Bevy es:

```bash
npx sdk-commands start --bevy-web
```
*(O también `npm start -- --bevy-web`)*

### ¿Qué debería pasar?
El comando levanta un servidor en el puerto **8000**. Si vas a tu navegador y entrás a `http://localhost:8000/`, debería redirigirte automáticamente al visor de Bevy.

### El Link Directo
Si `http://localhost:8000/` se queda en blanco o no redirige (un error común), el link exacto y completo al que tenés que entrar manualmente en tu navegador es este:

👉 **[https://decentraland.zone/bevy-web/?preview=true&realm=http://127.0.0.1:8000&position=0,0](https://decentraland.zone/bevy-web/?preview=true&realm=http://127.0.0.1:8000&position=0,0)**

---

## 2. PROBLEMA CRÍTICO: "Secuestro" del Comando por Creator Hub (Windows)

Si tenés instalado el **Decentraland Creator Hub** en tu computadora, es muy probable que al correr `npm` o `npx`, la consola termine llamando al ejecutable del Hub por debajo de la mesa en lugar de compilar tu proyecto.

**Síntomas de este error:**
- Corrés `npm run start` o `npx sdk-commands start` y el comando termina instantáneamente.
- No sale ningún error en la consola, pero el puerto 8000 sigue caído.
- En los logs se ve que intenta abrir el `npm-cli.js` de la carpeta `app.asar` del Creator Hub.

### La Solución Definitiva (Bypass)

Para saltarnos el "secuestro" del Creator Hub y forzar a Node.js a que corra el compilador directamente desde la carpeta `node_modules` de tu proyecto, usá este comando exacto en tu consola (CMD o PowerShell):

```powershell
node node_modules/@dcl/sdk-commands/dist/index.js start --bevy-web
```
*(O si usas CMD puedes forzarlo usando la ruta completa de node: `"C:\Program Files\nodejs\node.exe" node_modules/@dcl/sdk-commands/dist/index.js start --bevy-web"`)*

Al hacer esto:
1. El compilador arrancará correctamente.
2. Empezará a mostrar mensajes en la consola como `[1/2] Bundling file...`.
3. Cuando diga **"Preview server is now running!"**, ya vas a poder entrar al [link directo de Bevy](https://decentraland.zone/bevy-web/?preview=true&realm=http://127.0.0.1:8000&position=0,0).
