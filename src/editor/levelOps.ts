/**
 * Pure level-layout operations for the drag-and-drop level editor. Every
 * function returns a new layout, or the same instance when nothing changed.
 *
 * Rule of thumb for kids: one thing per square. Placing something replaces
 * what was there, except the player's start square, which can only be moved.
 *
 * Blocks are terrain (a letter in `tiles`); everything else placed is an
 * object with its own id, so rules can talk about that one thing. Under it
 * all is the floor: sprites painted as grass, paths, water or tall grass.
 */
import { createId } from '../models/ids';
import { FLOOR_KEYS, LIMITS, NO_FLOOR, SCREEN_TILES, TILE, numberObjects, type EnemyType, type FloorKind, type LevelConfig, type LevelObject } from '../models/project';

/** The editable part of a level. */
export type LevelLayout = Pick<LevelConfig, 'width' | 'height' | 'tiles' | 'playerStart' | 'objects' | 'passThroughSpriteIds' | 'enemies' | 'floor' | 'floorTypes'>;

/** Something that occupies a square. Placed things carry the id of their object. */
export type LevelItem =
  | { kind: 'solid' }
  | { kind: 'collectible'; objectId?: string }
  | { kind: 'goal'; objectId?: string }
  | { kind: 'decoration'; spriteId: string; objectId?: string }
  | { kind: 'start' };

/** What can be put on a square ('erase' empties it; 'floor' paints the floor under it). */
export type PlaceItem = LevelItem | { kind: 'erase' } | { kind: 'floor'; spriteId: string };

export function layoutOf(level: LevelConfig): LevelLayout {
  return {
    width: level.width,
    height: level.height,
    tiles: level.tiles,
    playerStart: level.playerStart,
    objects: level.objects,
    passThroughSpriteIds: level.passThroughSpriteIds,
    enemies: level.enemies,
    floor: level.floor,
    floorTypes: level.floorTypes,
  };
}

/** The floor sprite on a square, if any. */
export function floorAt(l: LevelLayout, x: number, y: number): string | null {
  const c = l.floor[y]?.[x];
  if (!c || c === NO_FLOOR) return null;
  return l.floorTypes[FLOOR_KEYS.indexOf(c)]?.spriteId ?? null;
}

export function inLevel(l: LevelLayout, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < l.width && y < l.height;
}

export const isStart = (l: LevelLayout, x: number, y: number): boolean => l.playerStart.x === x && l.playerStart.y === y;

export const objectAt = (l: LevelLayout, x: number, y: number): LevelObject | undefined => l.objects.find((o) => o.x === x && o.y === y);

function itemOf(o: LevelObject): LevelItem {
  if (o.kind === 'treasure') return { kind: 'collectible', objectId: o.id };
  if (o.kind === 'goal') return { kind: 'goal', objectId: o.id };
  return { kind: 'decoration', spriteId: o.spriteId!, objectId: o.id };
}

export function itemAt(l: LevelLayout, x: number, y: number): LevelItem | null {
  if (!inLevel(l, x, y)) return null;
  if (isStart(l, x, y)) return { kind: 'start' };
  if (l.tiles[y][x] === TILE.solid) return { kind: 'solid' };
  const o = objectAt(l, x, y);
  return o ? itemOf(o) : null;
}

/** Same kind of thing (and same sprite); which object it is doesn't matter. */
export function sameItem(a: PlaceItem | null, b: PlaceItem | null): boolean {
  if (!a || !b || a.kind !== b.kind) return a === b;
  return (a.kind !== 'decoration' && a.kind !== 'floor') || a.spriteId === (b as { spriteId: string }).spriteId;
}

function newObject(item: LevelItem, x: number, y: number): LevelObject | null {
  if (item.kind === 'collectible') return { id: createId(), kind: 'treasure', x, y };
  if (item.kind === 'goal') return { id: createId(), kind: 'goal', x, y };
  if (item.kind === 'decoration') return { id: createId(), kind: 'sprite', spriteId: item.spriteId, x, y };
  return null;
}

/**
 * Puts an item on many squares at once (one square, a painted line, a box).
 * Each square gets a new object; squares that already hold the same kind of
 * thing are left alone, so their objects (and rules) survive.
 */
function placeMany(l: LevelLayout, cells: Iterable<[number, number]>, item: PlaceItem): LevelLayout {
  if (item.kind === 'floor') return paintFloor(l, cells, item.spriteId);
  const rows = l.tiles.map((r) => r.split(''));
  const floor = l.floor.map((r) => r.split(''));
  const bySquare = new Map(l.objects.map((o) => [`${o.x},${o.y}`, o]));
  let changed = false;
  for (const [x, y] of cells) {
    // Nothing may cover the start square, so the player never spawns in a wall.
    if (!inLevel(l, x, y) || isStart(l, x, y)) continue;
    const key = `${x},${y}`;
    const existing = bySquare.get(key);
    const current: LevelItem | null = rows[y][x] === TILE.solid ? { kind: 'solid' } : existing ? itemOf(existing) : null;
    // Erasing a bare square takes up its floor.
    if (item.kind === 'erase' && current === null) {
      if (floor[y][x] !== NO_FLOOR) {
        floor[y][x] = NO_FLOOR;
        changed = true;
      }
      continue;
    }
    if (sameItem(current, item)) continue;
    changed = true;
    rows[y][x] = item.kind === 'solid' ? TILE.solid : TILE.empty;
    bySquare.delete(key);
    const o = item.kind === 'erase' || item.kind === 'start' ? null : newObject(item, x, y);
    if (o) bySquare.set(key, o);
  }
  if (!changed) return l;
  // New objects get the next free number among ones that look the same.
  return { ...l, tiles: rows.map((r) => r.join('')), floor: floor.map((r) => r.join('')), objects: numberObjects([...bySquare.values()]) };
}

/** Paints a floor sprite on squares (under whatever is on them, the start included). */
function paintFloor(l: LevelLayout, cells: Iterable<[number, number]>, spriteId: string): LevelLayout {
  const index = l.floorTypes.findIndex((f) => f.spriteId === spriteId);
  if (index < 0) return l;
  const key = FLOOR_KEYS[index];
  const floor = l.floor.map((r) => r.split(''));
  let changed = false;
  for (const [x, y] of cells) {
    if (!inLevel(l, x, y) || floor[y][x] === key) continue;
    floor[y][x] = key;
    changed = true;
  }
  return changed ? { ...l, floor: floor.map((r) => r.join('')) } : l;
}

/** Puts an item on a square, replacing what was there. */
export function placeItem(l: LevelLayout, x: number, y: number, item: PlaceItem): LevelLayout {
  if (!inLevel(l, x, y)) return l;
  if (item.kind === 'floor') return paintFloor(l, [[x, y]], item.spriteId);
  if (item.kind === 'start') {
    if (isStart(l, x, y)) return l;
    const cleared = placeMany({ ...l, playerStart: { x: -1, y: -1 } }, [[x, y]], { kind: 'erase' });
    return { ...cleared, playerStart: { x, y } };
  }
  return placeMany(l, [[x, y]], item);
}

/** Picks something up from one square and drops it on another. Objects keep their id, name and settings. */
export function moveItem(l: LevelLayout, from: { x: number; y: number }, to: { x: number; y: number }): LevelLayout {
  const item = itemAt(l, from.x, from.y);
  if (!item || !inLevel(l, to.x, to.y) || (from.x === to.x && from.y === to.y)) return l;
  if (item.kind === 'start') return placeItem(l, to.x, to.y, item);
  if (isStart(l, to.x, to.y)) return l;
  if (item.kind === 'solid') return placeItem(placeMany(l, [[from.x, from.y]], { kind: 'erase' }), to.x, to.y, item);
  const moving = objectAt(l, from.x, from.y)!;
  const cleared = placeMany(l, [[to.x, to.y]], { kind: 'erase' });
  return { ...cleared, objects: cleared.objects.map((o) => (o.id === moving.id ? { ...o, x: to.x, y: to.y } : o)) };
}

/** Removes the item on a square. The start can't be removed, only moved. */
export function removeItem(l: LevelLayout, x: number, y: number): LevelLayout {
  return placeItem(l, x, y, { kind: 'erase' });
}

/** Changes one object's own settings (name, enemy moves / toughness); `undefined` goes back to the sprite's. */
export function updateObject(l: LevelLayout, id: string, patch: Partial<Pick<LevelObject, 'name' | 'moves' | 'hp'>>): LevelLayout {
  const target = l.objects.find((o) => o.id === id);
  if (!target) return l;
  const next: LevelObject = { ...target, ...patch };
  for (const k of ['name', 'moves', 'hp'] as const) if (next[k] === undefined) delete next[k];
  return { ...l, objects: l.objects.map((o) => (o.id === id ? next : o)) };
}

/** Cells on a Bresenham line, so fast drags leave no gaps. */
export function linePoints(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    points.push([x, y]);
    if (x === x1 && y === y1) return points;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/** Places an item on every square along a line (painting). */
export function paintLine(l: LevelLayout, x0: number, y0: number, x1: number, y1: number, item: PlaceItem): LevelLayout {
  if (item.kind === 'start') return placeItem(l, x1, y1, item);
  return placeMany(l, linePoints(x0, y0, x1, y1), item);
}

/**
 * Places an item on every square in a box (corners included), so a whole
 * floor or wall can be painted in one go. The start square is skipped.
 */
export function fillBox(l: LevelLayout, x0: number, y0: number, x1: number, y1: number, item: PlaceItem): LevelLayout {
  if (item.kind === 'start') return placeItem(l, x1, y1, item);
  const cells: Array<[number, number]> = [];
  for (let y = Math.max(0, Math.min(y0, y1)); y <= Math.min(l.height - 1, Math.max(y0, y1)); y++) {
    for (let x = Math.max(0, Math.min(x0, x1)); x <= Math.min(l.width - 1, Math.max(x0, x1)); x++) cells.push([x, y]);
  }
  return placeMany(l, cells, item);
}

export function isPassThrough(l: LevelLayout, spriteId: string): boolean {
  return l.passThroughSpriteIds.includes(spriteId);
}

/** What a placed sprite does in the game, everywhere it is placed (unless an object overrides it); or that it is painted as floor. */
export type SpriteKind = { kind: 'solid' } | { kind: 'through' } | ({ kind: 'enemy' } & Omit<EnemyType, 'spriteId'>) | { kind: 'floor'; floor: FloorKind };

export function spriteKindOf(l: LevelLayout, spriteId: string): SpriteKind {
  const floor = l.floorTypes.find((f) => f.spriteId === spriteId);
  if (floor) return { kind: 'floor', floor: floor.kind };
  const enemy = l.enemies.find((e) => e.spriteId === spriteId);
  if (enemy) return { kind: 'enemy', hp: enemy.hp, moves: enemy.moves };
  return isPassThrough(l, spriteId) ? { kind: 'through' } : { kind: 'solid' };
}

/**
 * Changes what a sprite is. Becoming floor moves its placed copies down onto
 * the floor; stopping being floor lifts its floor squares back up as placed
 * copies (where nothing else is), so nothing a kid drew disappears.
 */
export function setSpriteKind(l: LevelLayout, spriteId: string, k: SpriteKind): LevelLayout {
  const wasFloor = l.floorTypes.findIndex((f) => f.spriteId === spriteId);
  let base = wasFloor >= 0 && k.kind !== 'floor' ? liftFloor(l, wasFloor) : l;
  const passThroughSpriteIds = base.passThroughSpriteIds.filter((id) => id !== spriteId);
  const enemies = base.enemies.filter((e) => e.spriteId !== spriteId);
  if (k.kind === 'through') passThroughSpriteIds.push(spriteId);
  if (k.kind === 'enemy') enemies.push({ spriteId, hp: k.hp, moves: k.moves });
  base = { ...base, passThroughSpriteIds, enemies };
  if (k.kind !== 'floor') return base;
  if (wasFloor >= 0) return { ...base, floorTypes: base.floorTypes.map((f, i) => (i === wasFloor ? { spriteId, kind: k.floor } : f)) };
  if (base.floorTypes.length >= FLOOR_KEYS.length) return base;
  const withType = { ...base, floorTypes: [...base.floorTypes, { spriteId, kind: k.floor }] };
  const copies = withType.objects.filter((o) => o.spriteId === spriteId);
  const painted = paintFloor({ ...withType, objects: withType.objects.filter((o) => o.spriteId !== spriteId) }, copies.map((o) => [o.x, o.y] as [number, number]), spriteId);
  return painted;
}

/** Takes a floor type away, putting its squares back as placed copies where the square is free. */
function liftFloor(l: LevelLayout, index: number): LevelLayout {
  const { spriteId } = l.floorTypes[index];
  const key = FLOOR_KEYS[index];
  const taken = new Set(l.objects.map((o) => `${o.x},${o.y}`));
  const lifted: LevelObject[] = [];
  // Later floor types move down one letter.
  const floor = l.floor.map((row, y) =>
    [...row]
      .map((c, x) => {
        if (c === key) {
          if (l.tiles[y][x] !== TILE.solid && !taken.has(`${x},${y}`) && !isStart(l, x, y)) lifted.push({ id: createId(), kind: 'sprite', spriteId, x, y });
          return NO_FLOOR;
        }
        const i = FLOOR_KEYS.indexOf(c);
        return i > index ? FLOOR_KEYS[i - 1] : c;
      })
      .join(''),
  );
  return { ...l, floor, floorTypes: l.floorTypes.filter((_, i) => i !== index), objects: numberObjects([...l.objects, ...lifted]) };
}

/** Switches a placed sprite between solid and walk-through (everywhere it is placed). */
export function togglePassThrough(l: LevelLayout, spriteId: string): LevelLayout {
  return setSpriteKind(l, spriteId, isPassThrough(l, spriteId) ? { kind: 'solid' } : { kind: 'through' });
}

/** Empties every square except the start. */
export function clearLayout(l: LevelLayout): LevelLayout {
  const empty = TILE.empty.repeat(l.width);
  const bare = NO_FLOOR.repeat(l.width);
  if (l.objects.length === 0 && l.tiles.every((row) => row === empty) && l.floor.every((row) => row === bare)) return l;
  return { ...l, tiles: new Array<string>(l.height).fill(empty), floor: new Array<string>(l.height).fill(bare), objects: [] };
}

/**
 * Changes the level size, anchored to the bottom-left so the ground stays on
 * the ground. Anything outside the new size is dropped; the start is kept
 * inside the level.
 */
export function resizeLayout(l: LevelLayout, width: number, height: number): LevelLayout {
  const w = Math.round(Math.min(LIMITS.levelWidth.max, Math.max(LIMITS.levelWidth.min, width)));
  const h = Math.round(Math.min(LIMITS.levelHeight.max, Math.max(LIMITS.levelHeight.min, height)));
  if (w === l.width && h === l.height) return l;
  const shift = h - l.height; // rows added (or removed) at the top
  const fit = (rows: string[], blank: string) =>
    Array.from({ length: h }, (_, y) => {
      const src = rows[y - shift];
      if (src === undefined) return blank.repeat(w);
      return src.length >= w ? src.slice(0, w) : src + blank.repeat(w - src.length);
    });
  const tiles = fit(l.tiles, TILE.empty);
  const floor = fit(l.floor, NO_FLOOR);
  const objects = l.objects.map((o) => ({ ...o, y: o.y + shift })).filter((o) => o.x < w && o.y >= 0 && o.y < h);
  const start = {
    x: Math.min(w - 1, l.playerStart.x),
    y: Math.min(h - 1, Math.max(0, l.playerStart.y + shift)),
  };
  const resized: LevelLayout = { ...l, width: w, height: h, tiles, floor, objects, playerStart: { x: -1, y: -1 } };
  return placeItem(resized, start.x, start.y, { kind: 'start' });
}

/** Older levels were shorter than one screen; grow them to a full screen tall. */
export function fitToScreenHeight(l: LevelLayout): LevelLayout {
  return l.height >= SCREEN_TILES.height ? l : resizeLayout(l, l.width, SCREEN_TILES.height);
}

export function countTiles(l: LevelLayout, tile: string): number {
  let n = 0;
  for (const row of l.tiles) for (const c of row) if (c === tile) n++;
  return n;
}

/**
 * The level as it would be going across or up (side view), keeping its first
 * screen: across → up keeps the number of screens, stacked on top; up → across
 * lays them out to the right. Only the bottom-left screen's contents carry over.
 */
export function reshapeLayout(l: LevelLayout, direction: 'across' | 'up'): LevelLayout {
  const W = SCREEN_TILES.width;
  const H = SCREEN_TILES.height;
  return direction === 'up'
    ? resizeLayout(l, W, Math.max(1, Math.ceil(l.width / W)) * H)
    : resizeLayout(l, Math.max(1, Math.ceil(l.height / H)) * W, H);
}

/** Would going from `l` to `next` drop anything that was placed or painted? */
export const layoutLoses = (l: LevelLayout, next: LevelLayout): boolean => countPlaced(next) < countPlaced(l);

function countPlaced(l: LevelLayout): number {
  const count = (rows: string[], blank: string) => rows.reduce((n, row) => n + [...row].filter((c) => c !== blank).length, 0);
  return l.objects.length + count(l.tiles, TILE.empty) + count(l.floor, NO_FLOOR);
}
