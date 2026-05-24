import { engine, Transform, GltfContainer, ColliderLayer } from '@dcl/sdk/ecs'
import { Vector3 } from '@dcl/sdk/math'
import { kartMovementSystem } from './kartSystem'
import { scanAndConvertKarts } from './kart'
import { setupUi } from './ui'

export function main() {
  // 1. Instanciar la Pista de Carreras GLB
  const trackEntity = engine.addEntity()
  GltfContainer.create(trackEntity, {
    src: 'assets/models/track.glb',
    invisibleMeshesCollisionMask: ColliderLayer.CL_PHYSICS,
    visibleMeshesCollisionMask:   ColliderLayer.CL_PHYSICS
  })
  Transform.create(trackEntity, {
    position: Vector3.create(472, 10.0, 248),
    scale:    Vector3.create(1, 1, 1)
  })

  // 2. Escanear el mapa y convertir los autos/naves del Creator Hub en vehículos funcionales
  scanAndConvertKarts()

  // 3. Registrar el sistema de movimiento del kart
  engine.addSystem(kartMovementSystem)

  // 4. Registrar UI
  setupUi()
}
