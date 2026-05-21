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
