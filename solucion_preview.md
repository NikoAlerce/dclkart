# 🛠️ Solución de Preview en Decentraland Desktop

Este documento detalla el error de enlace (deeplink) que impedía abrir la vista previa local en la aplicación de escritorio de Decentraland y cómo solucionarlo paso a paso.

---

## 🚨 El Problema: "We couldn't open the deeplink in Decentraland"

Al intentar abrir la escena local en el cliente de escritorio copiando y pegando la dirección provista por el servidor, aparecía un cartel de error de fondo morado que decía:
> *We couldn't open the deeplink in Decentraland. Please close Decentraland and try again.*

Este error ocurre por tres causas combinadas:

1. **Codificación de caracteres (URL Escaping)**:
   El enlace generado inicialmente tenía caracteres especiales codificados (por ejemplo, `%3A%2F%2F` en lugar de `://`). El analizador de la aplicación de escritorio (v1.17.4+) no comprende caracteres codificados y falla al resolver la dirección de red.
   
2. **Bloqueo del chat de desarrollo (IA)**:
   Las interfaces de chat integradas (como Cursor, VS Code, etc.) bloquean los clics directos sobre protocolos personalizados (`decentraland://`) por motivos de seguridad. Por ende, al hacer clic no ocurre nada, forzando a copiar y pegar.
   
3. **Proceso colgado en segundo plano**:
   Una vez que el Launcher de Decentraland falla por primera vez, el proceso `Decentraland.exe` queda colgado en segundo plano. Esto bloquea las siguientes solicitudes de enlace, repitiendo el error aunque la nueva dirección sea correcta.

---

## 🚀 La Solución Paso a Paso

Si el error vuelve a ocurrir al intentar levantar una vista previa local, seguí estos pasos:

### Paso 1: Forzar el cierre de Decentraland
Cerrá todas las instancias activas de la app de escritorio para liberar el puerto. Podés hacerlo de dos maneras:
*   Hacé clic en **EXIT** en la ventana morada de error.
*   O bien, ejecutá este comando en tu consola (PowerShell o CMD) para forzar el cierre:
    ```powershell
    taskkill /F /IM Decentraland.exe
    ```

### Paso 2: Copiar el enlace "Limpio" (Sin codificar)
Copiá la dirección utilizando caracteres estándar (con `:` y `/` legibles, en lugar de `%3A` y `%2F`):

```text
decentraland://realm=http://127.0.0.1:8000&position=0,0&dclenv=org&local-scene=true
```

*Nota: Si tu servidor de desarrollo está en otro puerto que no sea el 8000, ajustá el `http://127.0.0.1:8000` con el puerto correspondiente.*

### Paso 3: Pegar en el Navegador
1. Abrí Chrome u otro navegador web.
2. Pegá el enlace limpio en la **barra de direcciones** superior.
3. Dale **Enter**.
4. Aceptá la confirmación del navegador para iniciar la aplicación externa.

La app de escritorio de Decentraland se abrirá limpia y cargará tu circuito local de forma automática.
