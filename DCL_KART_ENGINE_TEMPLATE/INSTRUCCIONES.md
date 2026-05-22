# Motor de Karts para Decentraland SDK 7

Esta carpeta contiene todo el "motor" de físicas y controles que creamos para que puedas copiar y pegarlo fácilmente en cualquier proyecto nuevo del **Creator Hub**.

## ¿Cómo instalarlo en un proyecto nuevo?

**Paso 1: Preparar tu escena (Creator Hub)**
1. Abrí el Creator Hub y creá un proyecto nuevo.
2. Construí tu mapa, la pista y todos los elementos estáticos.
3. Arrastrá los modelos 3D (`.glb`) de los autos a tu mapa y ubicalos en la posición de salida.
   - **IMPORTANTE:** Para que el motor reconozca automáticamente qué físicas darle, el archivo del modelo 3D debe contener la palabra `kart` (ej: `kart_rojo.glb`) o la palabra `nave` (ej: `nave_espacial.glb`).
4. Cerrá el Creator Hub.

**Paso 2: Migrar los archivos del Motor (VSCode / Explorador de archivos)**
1. Entrá a la carpeta de tu nuevo proyecto.
2. Copiá el contenido de la carpeta `src/` que está acá adentro y pegalo dentro de la carpeta `src/` de tu nuevo proyecto (sobreescribiendo si te pregunta).
3. Abrí el archivo `index_template.ts` que está en esta carpeta, copiá TODO su contenido, y usalo para reemplazar absolutamente todo lo que haya dentro del archivo `src/index.ts` de tu nuevo proyecto.

**Paso 3: Jugar**
1. Listo. Ya podés abrir tu proyecto nuevo, darle a "Run", y el sistema escaneará el mapa, encontrará los `.glb` que dejaste, y los convertirá mágicamente en autos y naves funcionales.
