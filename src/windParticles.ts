import { engine, Transform, MeshRenderer, Material, Schemas } from '@dcl/sdk/ecs'
import { Vector3, Color3, Color4 } from '@dcl/sdk/math'

// Definir el componente de Partícula de Viento Mágica
export const MagicWindParticle = engine.defineComponent('MagicWindParticle', {
  speed: Schemas.Vector3,      // velocidad de deriva (viento + variación)
  phase: Schemas.Vector3,      // desfase para la oscilación en X, Y, Z
  freq: Schemas.Vector3,       // frecuencia de oscilación
  amp: Schemas.Vector3,        // amplitud de oscilación
  age: Schemas.Float           // edad de la partícula
})

const PARTICLE_POOL_SIZE = 150
const SPAWN_RADIUS = 35 // radio de spawn alrededor del jugador
const MAX_RADIUS = 40   // distancia máxima a partir de la cual se reposiciona la partícula
const WIND_VELOCITY = Vector3.create(1.5, 0.1, 0.7) // velocidad base del viento

// Paleta de colores mágicos para el ambiente de atardecer/noche
const COLORS = [
  { albedo: Color4.create(1.0, 0.85, 0.3, 0.9), emissive: Color3.create(2.5, 1.8, 0.3) }, // Oro cálido (fuego fatuo/luciérnaga)
  { albedo: Color4.create(0.2, 0.9, 1.0, 0.9), emissive: Color3.create(0.3, 2.0, 2.5) },  // Cian mágico (energía cósmica)
  { albedo: Color4.create(0.8, 0.3, 1.0, 0.9), emissive: Color3.create(2.0, 0.3, 2.5) },  // Violeta/Púrpura
  { albedo: Color4.create(0.2, 1.0, 0.4, 0.9), emissive: Color3.create(0.3, 2.5, 0.6) }   // Verde hada
]

// Función para posicionar o reposicionar una partícula alrededor del jugador
function resetParticle(entity: any, referencePos: Vector3) {
  // Posición aleatoria dentro de una caja alrededor del jugador
  const randomPos = Vector3.create(
    referencePos.x + (Math.random() - 0.5) * SPAWN_RADIUS * 2,
    referencePos.y + (Math.random() - 0.2) * 12 + 1.5, // dispersión vertical entre +1.5m y +13.5m de altura
    referencePos.z + (Math.random() - 0.5) * SPAWN_RADIUS * 2
  )

  const scaleSize = 0.05 + Math.random() * 0.12
  const scaleVec = Vector3.create(scaleSize, scaleSize, scaleSize)

  if (Transform.has(entity)) {
    const t = Transform.getMutable(entity)
    t.position = randomPos
    t.scale = scaleVec
  } else {
    Transform.create(entity, {
      position: randomPos,
      scale: scaleVec
    })
  }

  // Material PBR brillante y translúcido
  const colorScheme = COLORS[Math.floor(Math.random() * COLORS.length)]
  Material.setPbrMaterial(entity, {
    albedoColor: colorScheme.albedo,
    emissiveColor: colorScheme.emissive,
    emissiveIntensity: 5.0 + Math.random() * 5.0,
    roughness: 1.0
  })

  const particleData = {
    speed: Vector3.create(
      WIND_VELOCITY.x + (Math.random() - 0.5) * 0.5,
      WIND_VELOCITY.y + (Math.random() - 0.5) * 0.1,
      WIND_VELOCITY.z + (Math.random() - 0.5) * 0.5
    ),
    phase: Vector3.create(Math.random() * 10, Math.random() * 10, Math.random() * 10),
    freq: Vector3.create(1.0 + Math.random() * 2.0, 0.8 + Math.random() * 1.5, 1.2 + Math.random() * 2.0),
    amp: Vector3.create(0.4 + Math.random() * 0.8, 0.2 + Math.random() * 0.5, 0.4 + Math.random() * 0.8),
    age: 0
  }

  if (MagicWindParticle.has(entity)) {
    const p = MagicWindParticle.getMutable(entity)
    p.speed = particleData.speed
    p.phase = particleData.phase
    p.freq = particleData.freq
    p.amp = particleData.amp
    p.age = particleData.age
  } else {
    MagicWindParticle.create(entity, particleData)
  }
}

let initialized = false
const particles: any[] = []

export function setupWindParticles() {
  if (initialized) return
  initialized = true

  // Crear la piscina de entidades de partículas
  for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
    const entity = engine.addEntity()
    MeshRenderer.setSphere(entity)
    particles.push(entity)
  }

  // Agregar el sistema de actualización de partículas flotantes
  engine.addSystem((dt: number) => {
    // 1. Obtener la posición del jugador
    if (!Transform.has(engine.PlayerEntity)) return
    const playerTransform = Transform.get(engine.PlayerEntity)
    const playerPos = playerTransform.position

    // Si es la primera ejecución y las partículas no están inicializadas, las posicionamos alrededor del jugador
    for (const entity of particles) {
      if (!MagicWindParticle.has(entity)) {
        resetParticle(entity, playerPos)
        continue
      }

      const transform = Transform.getMutable(entity)
      const particle = MagicWindParticle.getMutable(entity)

      // 2. Incrementar la edad
      particle.age += dt

      // 3. Calcular movimiento derivado del viento
      const windStep = Vector3.scale(particle.speed, dt)
      transform.position = Vector3.add(transform.position, windStep)

      // 4. Agregar oscilación de balanceo (vaivén) en X, Y, Z usando senos y cosenos
      const time = particle.age
      const swayX = Math.sin(time * particle.freq.x + particle.phase.x) * particle.amp.x * dt
      const swayY = Math.cos(time * particle.freq.y + particle.phase.y) * particle.amp.y * dt
      const swayZ = Math.sin(time * particle.freq.z + particle.phase.z) * particle.amp.z * dt
      
      transform.position.x += swayX
      transform.position.y += swayY
      transform.position.z += swayZ

      // 5. Comprobar distancia al jugador. Si se alejan demasiado, las traemos de vuelta.
      const dist = Vector3.distance(transform.position, playerPos)
      if (dist > MAX_RADIUS) {
        resetParticle(entity, playerPos)
      }
    }
  })
}
