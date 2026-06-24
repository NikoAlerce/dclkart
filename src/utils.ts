import { engine, Transform, Entity } from '@dcl/sdk/ecs'

export function getRandomHexColor(): string {
  const letters = "0123456789ABCDEF";
  let color = "#";
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

export function isChildOf(child: Entity, parent: Entity): boolean {
  let current = child
  while (current !== undefined && current !== 0) {
    if (current === parent) return true
    const transform = Transform.getOrNull(current)
    if (!transform || !transform.parent) break
    current = transform.parent
  }
  return false
}


