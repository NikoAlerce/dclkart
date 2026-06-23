SONIDOS DEL PAINTBALL
=====================

Poné estos 3 archivos acá (formato .mp3 u .ogg, cortos, mono, < 1 MB c/u):

  shoot.mp3      -> disparo del arma (corto, ~0.2-0.4s, tipo "pew"/splat)
  impact.mp3     -> salpicadura al impactar (corto, ~0.2s, tipo "splat"/plop)
  footstep.mp3   -> un solo paso (corto, ~0.15s)

El codigo ya los usa (src/paintballAudio.ts). Si los nombres o el formato cambian,
ajustar las constantes SND_SHOOT / SND_IMPACT / SND_STEP en ese archivo.

DONDE CONSEGUIRLOS (gratis, libres de uso):
  - https://freesound.org   (filtrar por licencia CC0)
  - https://pixabay.com/sound-effects/
  - https://mixkit.co/free-sound-effects/

Tips:
  - Que sean cortos y "secos" (sin cola de reverb larga) para que no se solapen feo.
  - Mono y bitrate medio (128 kbps) alcanza y pesa poco.
  - Para "shoot" buscar: paintball shot / splat / cartoon pop.
  - Para "impact" buscar: splat / paint splat / wet hit.
  - Para "footstep" buscar: footstep grass / footstep concrete (uno solo).

Hasta que existan estos archivos, el juego corre igual pero sin sonido (sin errores).
