/**
 * The Block, Treasure and Goal sprites always act as blocks, treasure and
 * goals, even when one was placed in the level as an ordinary sprite.
 */
import { TILE, numberObjects, type LevelConfig, type LevelObject } from './project';

type RoleIds = Pick<LevelConfig, 'solidSpriteId' | 'collectibleSpriteId' | 'goalSpriteId'>;
type Placed = Pick<LevelConfig, 'tiles' | 'objects'>;

/** Turns placed Block / Treasure / Goal sprites into blocks, treasure and goal objects (keeping their ids). */
export function applyRoles<L extends Placed>(level: L, roles: RoleIds): L {
  const isRole = (o: LevelObject) =>
    o.kind === 'sprite' && (o.spriteId === roles.solidSpriteId || o.spriteId === roles.collectibleSpriteId || o.spriteId === roles.goalSpriteId);
  if (!level.objects.some(isRole)) return level;
  const rows = level.tiles.map((row) => row.split(''));
  const objects: LevelObject[] = [];
  for (const o of level.objects) {
    if (!isRole(o)) objects.push(o);
    else if (o.spriteId === roles.solidSpriteId) rows[o.y][o.x] = TILE.solid;
    else objects.push({ id: o.id, kind: o.spriteId === roles.collectibleSpriteId ? 'treasure' : 'goal', x: o.x, y: o.y, ...(o.name ? { name: o.name } : {}) });
  }
  // Converted objects are numbered afresh among the treasure / goals.
  return { ...level, tiles: rows.map((r) => r.join('')), objects: numberObjects(objects) };
}
