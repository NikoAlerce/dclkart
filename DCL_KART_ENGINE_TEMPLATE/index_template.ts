// =========================================================================
// PLANTILLA PARA PROYECTOS NUEVOS CREADOS CON EL CREATOR HUB
// =========================================================================
// Si creaste un proyecto nuevo desde cero en el Creator Hub y querés que
// los autos que arrastraste al mundo cobren vida, copiá este código
// y pegalo reemplazando todo lo que haya en tu archivo "src/index.ts".

import { engine } from '@dcl/sdk/ecs'
import { scanAndConvertKarts } from './kart'
import { kartMovementSystem } from './kartSystem'
import { setupUi } from './ui'

export function main() {
  // 1. Escanea el mapa y convierte los modelos 3D que pusiste en el Hub en vehículos vivos
  scanAndConvertKarts()

  // 2. Prende el motor de físicas de los vehículos
  engine.addSystem(kartMovementSystem)

  // 3. Prende la interfaz visual (los controles y botones en pantalla)
  setupUi()
}
