}

export function setupMonster(arbolesEntity: Entity, videoSource: Entity) {
  const monster = engine.addEntity()
  GltfContainer.create(monster, { src: MODEL_SRC })
  Animator.create(monster, {
    states: [{ clip: ANIM_CLIP, playing: true, loop: true, speed: ANIM_SPEED, weight: 1.0 }]
  })

  // Start determinístico (centro del área) para que todos los clientes arranquen
  // el monstruo en el mismo lugar antes de que syncEntity reconcilie con el host.
  const start = { x: (ROAM.minX + ROAM.maxX) / 2, z: (ROAM.minZ + ROAM.maxZ) / 2 }
  Transform.create(monster, {
    position: Vector3.create(start.x, 30 + WORLD_Y_OFFSET, start.z),
    scale:    Vector3.create(SCALE, SCALE, SCALE),
    rotation: Quaternion.Identity()
  })

  // Sincronizar la posición/rotación del monstruo. Solo el host la escribe (abajo);
  // el resto la recibe. Los hijos (lomo, pantalla, colliders) son locales en cada
  // cliente y siguen al monstruo por parentesco, sin necesidad de sincronizarse.
  syncEntity(monster, [Transform.componentId], SYNC_IDS.monster)

  // Plataforma sólida sobre el lomo. Al ser un CL_PHYSICS kinematic body parented
  // al monstruo, Havok lleva automáticamente al jugador parado sobre ella cuando
  // el monstruo se mueve — sin necesidad de movePlayerTo en el loop.
  const back = engine.addEntity()
  Transform.create(back, {
    parent:   monster,
    position: Vector3.create(BACK_CX, BACK_Y, BACK_CZ),
    scale:    Vector3.create(BACK_WID_X, 0.3, BACK_LEN_Z)