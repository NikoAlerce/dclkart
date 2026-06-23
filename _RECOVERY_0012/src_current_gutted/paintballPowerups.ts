
const SPAWN_ANCHORS = [
  Vector3.create(-145.0, 13.5 + WORLD_Y_OFFSET, 25.0),
  Vector3.create(-55.0, 13.5 + WORLD_Y_OFFSET, 85.0),
  Vector3.create(-100.0, 15.5 + WORLD_Y_OFFSET, 55.0),
  Vector3.create(-120.0, 13.5 + WORLD_Y_OFFSET, -10.0),
  Vector3.create(-80.0, 15.5 + WORLD_Y_OFFSET, 140.0),
  Vector3.create(-30.0, 13.5 + WORLD_Y_OFFSET, 30.0)
]

let spawnTimer = 6.0

export function setupPowerups() {
  for (let s = 0; s < MAX_SLOTS; s++) {
    const root = engine.addEntity()
    Transform.create(root, { position: Vector3.create(0, -100, 0), scale: Vector3.Zero() })
    PowerupSlot.create(root, { kind: 0, active: false })

    // Hijo local animado (no sincronizado)
    const visual = engine.addEntity()
    Transform.create(visual, { parent: root, position: Vector3.Zero(), scale: Vector3.One() })

    const sphere = engine.addEntity()
    Transform.create(sphere, { parent: visual, position: Vector3.Zero(), scale: Vector3.create(0.5, 0.5, 0.5) })
    MeshRenderer.setSphere(sphere)

    const halo = engine.addEntity()
    Transform.create(halo, {
      parent: visual,
      rotation: Quaternion.fromEulerDegrees(90, 0, 0),
      scale: Vector3.create(2.4, 0.08, 2.4)
    })
    MeshRenderer.setCylinder(halo)

    const icon = engine.addEntity()
    Transform.create(icon, { parent: visual, position: Vector3.create(0, 2.6, 0), scale: Vector3.One() })
    TextShape.create(icon, { text: '', fontSize: 5, textColor: Color4.White(), outlineWidth: 0.15, outlineColor: Color3.fromInts(0, 0, 0) })
    Billboard.create(icon)

    // Sincronizar posición + estado del slot. Todos lo crean con el mismo enumId.
    syncEntity(root, [Transform.componentId, PowerupSlot.componentId], SYNC_IDS.powerupBase + s)

    slots.push({ root, visual, sphere, halo, icon, slot: s, bob: Math.random() * Math.PI * 2, lastKind: -1, takenLocally: false })
  }

  // El host oculta el slot recogido (autoridad).
  pbBus.on(PB_MSG.powerupTaken, (m: PowerupTakenMsg) => {
    if (!isHost()) return
    const sd = slots[m.slot]
    if (!sd) return
    deactivateSlot(sd)