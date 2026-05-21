import { engine, Transform, GltfContainer, ColliderLayer } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { kartMovementSystem } from './kartSystem'
import { createKart } from './kart'
import { setupUi } from './ui'

export function main() {
  // 1. Instanciar la Pista de Carreras GLB
  const trackEntity = engine.addEntity()
  GltfContainer.create(trackEntity, {
    src: 'assets/models/track.glb',
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS,
    visibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS
  })
  
  Transform.create(trackEntity, {
    position: Vector3.create(472, 10.0, 248), // Elevado a 10.0m para evitar colisiones con el piso nativo Y=0
    scale: Vector3.create(1, 1, 1)
  })

  // 2. Kart en la posición original (cerca del checkpoint de largada)
  createKart(Vector3.create(366.3, 8.6, 316.2))

  // 3. Registrar el sistema de movimiento del kart
  engine.addSystem(kartMovementSystem)

  // 4. Registrar UI
  setupUi()
}
