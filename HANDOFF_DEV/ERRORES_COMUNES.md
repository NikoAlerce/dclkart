# Errores Comunes y "Gotchas" en Decentraland SDK 7

Si venís de programar en otros motores (como Unity o web genérico), hay algunas peculiaridades específicas del SDK 7 de Decentraland que nos hicieron chocar contra la pared y perder tiempo. Acá están las soluciones para que no sufras lo mismo:

## 1. El Comando `npm` Secuestrado (Windows)
**El problema:** Si el usuario tiene instalado el programa **Decentraland Creator Hub** en Windows, el instalador corrompe y "secuestra" los binarios locales de NPM y NPX dentro del entorno local de la escena. Si corrés `npm run start` o `npm run build`, la terminal lanza secretamente el entorno de Electron del Hub de fondo y sale instantáneamente sin mostrar errores, lo cual hace que tu servidor nunca levante.
**La solución:** En lugar de correr comandos a través del wrapper de npm, tenés que invocar explícitamente a node sobre los binarios instalados. (Ver `INSTRUCCIONES_BEVY.md` para el comando exacto).

## 2. La Rueda del Mouse y Controles de Vuelo
**El problema:** Queríamos mapear el subir y bajar de las naves voladoras a la **rueda del ratón** (scroll up / scroll down). Decentraland, por motivos de seguridad multiplataforma, no expone eventos nativos de mouse wheel ni de letras arbitrarias.
**La solución:** Solo podés usar teclas predefinidas en el enum `InputAction` (`IA_PRIMARY` es la letra E, `IA_SECONDARY` es la F, `IA_JUMP` es Espacio).

## 3. Dinamismo y la prohibición de `require()`
**El problema:** Intentamos usar `require("scene.json")` de manera dinámica para inyectar configuraciones del mapa a nuestros karts basándonos en cómo Decentraland lo usa por debajo.
**El resultado:** La compilación con esbuild del SDK 7 *prohibe rotundamente* usar `require()` en el entorno de WebWorker donde se ejecuta la escena. El build lanza un error fatal. 
**La solución:** Todo archivo JSON que requiera ser parseado se tiene que hacer a mano haciendo fetch (aunque no se recomienda porque es asíncrono) o bien importar la configuración estáticamente mediante un `.ts` (como `kartConfig.ts`).

## 4. Colisiones de Mallas vs Visuales Puras
**El problema:** Algunos `.glb` que exportamos del Creator Hub venían con mallas visuales altísimamente complejas. Si le aplicás colisiones físicas `CL_PHYSICS` a esa malla, el motor revienta de lag calculando raycasts contra los mil millones de vértices.
**La solución:** Tuvimos que separar el objeto en dos entidades hijas:
1. `kartModel`: que sólo renderiza gráficos (con `ColliderLayer.CL_NONE`).
2. `kartCollider`: que es una caja matemática invisible (un `MeshCollider.setBox`) con las proporciones del auto, lo cual hace que chocar paredes y hacer el raycast del piso para las suspensiones sea gratis a nivel de rendimiento.
