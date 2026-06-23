    from: Vector3.clone(from),
    to: Vector3.clone(to),
    timer: LASER_DURATION,
    targetPos: Vector3.clone(to),
    hitNormal: normal ? Vector3.clone(normal) : Vector3.Zero(),
    color
  })
}

function projectileSystem(dt: number) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i]
    p.timer -= dt

    if (p.timer <= 0) {
      // Llegó al fin de su vida: detonar chispas de impacto, pintar decal, y remover
      spawnImpactFX(p.targetPos, p.color)
      playImpactAt(p.targetPos)

      if (p.hitNormal && (p.hitNormal.x !== 0 || p.hitNormal.y !== 0 || p.hitNormal.z !== 0)) {
        spawnDecal(p.targetPos, p.hitNormal, p.color)
      }

      engine.removeEntity(p.entity)
      if (p.blob) engine.removeEntity(p.blob)
      projectiles.splice(i, 1)
      continue
    }

    const lifeRatio = p.timer / LASER_DURATION
    const t = Transform.getMutable(p.entity)

    // Desvanecer el trazo achicando el diámetro (X y Z)
    const diameter = 0.13 * lifeRatio
    t.scale.x = diameter
    t.scale.z = diameter

    // El blob crece levemente al acercarse al impacto (anticipa la salpicadura)
    if (p.blob) {
      const bt = Transform.getMutable(p.blob)
      const grow = 0.32 + (1 - lifeRatio) * 0.18