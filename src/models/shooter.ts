/**
 * Shooter: a ship turns and thrusts its way along a long winding canal,
 * shooting boats, drones and gun towers on the banks, to the finish line. All the art here is CurioSprite's own starter art, ready to redraw.
 */
import { fromArt } from './art';
import { createAttackSprite } from './attacks';
import { createProject, createSprite } from './defaults';
import { createId } from './ids';
import { FLOOR_KEYS, LIMITS, NO_FLOOR, SCREEN_TILES, TILE, numberObjects, type Level, type LevelObject, type Project, type Rule, type Sprite } from './project';

/** Seen from above, pointing up. The second frame flickers its engine. */
const SHIP_ART = [
  '.......kk.......',
  '......kwwk......',
  '......kbbk......',
  '.....kbwwbk.....',
  '.....kbBBbk.....',
  '....kgbBBbgk....',
  '....kgbbbbgk....',
  '..k.kggbbggk.k..',
  '.krkggggggggkrk.',
  '.krggggssggggrk.',
  '.kgggssssssgggk.',
  '.kgk.kssssk.kgk.',
  '.kk..kooook..kk.',
  '......kyyk......',
  '.......kk.......',
  '................',
];
const SHIP_FLAME = [...SHIP_ART.slice(0, 13), '......kook......', '.......yy.......', '................'];

/** Seen from above, sideways: it patrols across the canal. The second frame splashes its wake. */
const BOAT_ART = [
  '................',
  '................',
  '................',
  '................',
  '....kkkkkkkk....',
  '..kkwwwwwwwwkk..',
  '.kwwwsskksswwwk.',
  'kwwrrsswwssrrwwk',
  'kwwrrsswwssrrwwk',
  '.kwwwsskksswwwk.',
  '..kkwwwwwwwwkk..',
  '....kkkkkkkk....',
  '...b........b...',
  '................',
  '................',
  '................',
];
const BOAT_SPLASH = [...BOAT_ART.slice(0, 12), '..b.b......b.b..', '................', '................', '................'];

/** A little four-rotor drone; its rotors blur. */
const DRONE_ART = [
  '................',
  '.kkk........kkk.',
  'kgggk......kgggk',
  'kgggkk....kkgggk',
  '.kkk.kk..kk.kkk.',
  '......kuuk......',
  '.....kuPPuk.....',
  '.....kuPPuk.....',
  '......kuuk......',
  '.kkk.kk..kk.kkk.',
  'kgggkk....kkgggk',
  'kgggk......kgggk',
  '.kkk........kkk.',
  '................',
  '................',
  '................',
];
const DRONE_BLUR = DRONE_ART.map((r) => r.replace(/g/g, 'w'));

/** A round gun tower on the bank, seen from above, its barrel pointing down the canal. */
const TOWER_ART = [
  '................',
  '....kkkkkkkk....',
  '...kssssssssk...',
  '..ksggggggggsk..',
  '.ksgkkkkkkkkgsk.',
  '.ksgkrrrrrrkgsk.',
  '.ksgkroorrrkgsk.',
  '.ksgkroorrrkgsk.',
  '.ksgkrrrrrrkgsk.',
  '.ksgkkkkkkkkgsk.',
  '..ksggkkkkggsk..',
  '...ksskggkssk...',
  '....kkkggkkk....',
  '......kggk......',
  '......kyyk......',
  '.......kk.......',
];
const TOWER_FLASH = [...TOWER_ART.slice(0, 14), '.....kywwyk.....', '......kyyk......'];

/** Grassy land: the canal's banks are blocks of it, and it is painted under what stands on the bank. */
const BANK_ART = [
  'GGGGGGGGGGGGGGGG',
  'GGlGGGGGGGGGlGGG',
  'GlGGGGGGGGGGGGGG',
  'GGGGGGnGGGGGGGGG',
  'GGGGGGGGGGlGGGGG',
  'GGGGlGGGGGGGGGGG',
  'GGGGGGGGGGGGGGlG',
  'GGGGGGGGlGGGGGGG',
  'GlGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGnGGG',
  'GGGGGlGGGGGGGGGG',
  'GGGGGGGGGGGGGGGG',
  'GGlGGGGGGGGlGGGG',
  'GGGGGGGGGGGGGGGG',
  'GGGGGGGnGGGGGGlG',
  'GGGGGGGGGGGGGGGG',
];

/** A round treetop, seen from above. */
const BUSH_ART = Array.from({ length: 16 }, (_, y) =>
  Array.from({ length: 16 }, (_, x) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    // Lighter towards the top left, where the sun is.
    if (d >= 6.8) return '.';
    if (d >= 5.6) return 'k';
    return Math.hypot(x - 5.5, y - 5.5) < 3 ? 'l' : (x * 3 + y * 5) % 7 === 0 ? 'l' : 't';
  }).join(''),
);

/** Little waves on the water, drifting. */
const WAVES_ART = [
  '................',
  '................',
  '...ww...........',
  '..w..w..........',
  '................',
  '................',
  '..........bb....',
  '.........b..b...',
  '................',
  '................',
  '....b...........',
  '...b.b..........',
  '................',
  '...........ww...',
  '..........w..w..',
  '................',
];
const WAVES_DRIFT = WAVES_ART.map((r) => '.' + r.slice(0, 15));

/** Black and white squares across the canal at the end. */
const FINISH_ART = Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => (((x >> 2) + (y >> 2)) % 2 ? 'k' : 'w')).join(''));

type KitPart = 'boat' | 'drone' | 'tower' | 'bank' | 'field' | 'bush' | 'waves' | 'finish';
const KIT: Record<KitPart, { name: string; frames: string[][] }> = {
  boat: { name: 'Patrol boat', frames: [BOAT_ART, BOAT_SPLASH] },
  drone: { name: 'Buzz drone', frames: [DRONE_ART, DRONE_BLUR] },
  tower: { name: 'Gun tower', frames: [TOWER_ART, TOWER_FLASH] },
  bank: { name: 'Bank', frames: [BANK_ART] },
  field: { name: 'Field', frames: [BANK_ART] },
  bush: { name: 'Bush', frames: [BUSH_ART] },
  waves: { name: 'Waves', frames: [WAVES_ART, WAVES_DRIFT] },
  finish: { name: 'Finish line', frames: [FINISH_ART] },
};

const kitSprite = (name: string, frames: string[][]): Sprite => {
  const [first, ...rest] = frames.map(fromArt);
  const sprite = createSprite(name, 16, first);
  return rest.length ? { ...sprite, frames: rest } : sprite;
};

/** The kit's sprites in a game: ones it already has (by name) and new ones for the rest. */
function kitSprites(project: Pick<Project, 'sprites'>): { ids: Record<KitPart, string>; added: Sprite[] } {
  const added: Sprite[] = [];
  const ids = {} as Record<KitPart, string>;
  for (const part of Object.keys(KIT) as KitPart[]) {
    const existing = project.sprites.find((s) => s.name === KIT[part].name);
    if (existing) {
      ids[part] = existing.id;
    } else {
      const sprite = kitSprite(KIT[part].name, KIT[part].frames);
      added.push(sprite);
      ids[part] = sprite.id;
    }
  }
  return { ids, added };
}

export const CANAL_BACKGROUND = '#2563eb';

/** The starter canal's middle line, in squares: up from the start, then winding right, down, right and up again to the finish. */
const CANAL_PATH: ReadonlyArray<readonly [number, number]> = [
  [7, 41], [7, 26], [12, 17], [24, 12], [33, 17], [36, 30], [44, 38], [56, 37], [63, 28], [62, 15], [55, 7], [70, 5],
];
const CANAL_SIZE = { width: SCREEN_TILES.width * 3, height: SCREEN_TILES.height * 3 };

type Segment = { x: number; y: number; dx: number; dy: number; length: number; from: number };
const SEGMENTS: Segment[] = (() => {
  const list: Segment[] = [];
  let from = 0;
  for (let i = 1; i < CANAL_PATH.length; i++) {
    const [x, y] = CANAL_PATH[i - 1];
    const dx = CANAL_PATH[i][0] - x;
    const dy = CANAL_PATH[i][1] - y;
    const length = Math.hypot(dx, dy);
    list.push({ x, y, dx: dx / length, dy: dy / length, length, from });
    from += length;
  }
  return list;
})();
const CANAL_LONG = SEGMENTS.reduce((n, g) => n + g.length, 0);

/** The nearest place on the middle line to a point: how far along the canal it is, and how far from the middle. */
function nearestOnCanal(x: number, y: number): { along: number; off: number } {
  let best = { along: 0, off: Infinity };
  for (const g of SEGMENTS) {
    const t = Math.max(0, Math.min(g.length, (x - g.x) * g.dx + (y - g.y) * g.dy));
    const off = Math.hypot(x - (g.x + g.dx * t), y - (g.y + g.dy * t));
    if (off < best.off) best = { along: g.from + t, off };
  }
  return best;
}

/** A point that far along the canal, and the way the canal goes there. */
function canalPoint(along: number): { x: number; y: number; dx: number; dy: number } {
  const g = SEGMENTS.find((g) => along <= g.from + g.length) ?? SEGMENTS[SEGMENTS.length - 1];
  const t = Math.min(g.length, along - g.from);
  return { x: g.x + g.dx * t, y: g.y + g.dy * t, dx: g.dx, dy: g.dy };
}

/** How far the water reaches either side of the middle: wider and narrower stretches. */
const canalHalf = (along: number) => 3.3 + 1.1 * Math.sin(along / 8);

/**
 * A long canal that bends every way, between grassy banks: patrol boats on
 * the water, drones that come after the ship, gun towers on the banks, a few
 * islands, and a finish line across the far end.
 */
function shooterMap(ids: Record<KitPart, string>, p: Pick<Level, 'collectibleSpriteId'>, name: string): Level {
  const { width, height } = CANAL_SIZE;
  const near = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => nearestOnCanal(x, y)));
  const water = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && near[y][x].off <= canalHalf(near[y][x].along);
  const tiles = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => (water(x, y) ? TILE.empty : TILE.solid)));
  const floor = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (water(x, y) && (x * 7 + y * 13 + x * y) % 11 === 0 ? FLOOR_KEYS[0] : NO_FLOOR)),
  );
  const objects: LevelObject[] = [];
  const taken = new Set<string>();
  const place = (spriteId: string | undefined, x: number, y: number, kind: LevelObject['kind'] = 'sprite') => {
    if (x < 0 || y < 0 || x >= width || y >= height || taken.has(`${x},${y}`)) return false;
    taken.add(`${x},${y}`);
    objects.push({ id: createId(), kind, ...(spriteId ? { spriteId } : {}), x, y });
    return true;
  };
  /** The square that far along the canal, moved `side` squares to its right (negative: left). */
  const at = (along: number, side = 0) => {
    const c = canalPoint(along);
    return { x: Math.round(c.x - c.dy * side), y: Math.round(c.y + c.dx * side) };
  };
  const onWater = (along: number, side: number, spriteId: string | undefined, kind?: LevelObject['kind']) => {
    const { x, y } = at(along, side);
    if (tiles[y]?.[x] === TILE.empty) place(spriteId, x, y, kind);
  };
  // A field on the bank: land you can put things on.
  const field = (x: number, y: number) => {
    tiles[y][x] = TILE.empty;
    floor[y][x] = FLOOR_KEYS[1];
  };
  const onLand = (along: number, side: number, spriteId: string) => {
    const { x, y } = at(along, side);
    if (tiles[y]?.[x] !== TILE.solid || x <= 0 || y <= 0 || x >= width - 1 || y >= height - 1) return false;
    if (place(spriteId, x, y)) field(x, y);
    return true;
  };
  /** On the bank right beside the water (`side` 1 for the right bank, -1 for the left), so it can be shot from the water. */
  const onBank = (along: number, side: number, spriteId: string) => {
    for (let out = canalHalf(along) - 0.5; out < canalHalf(along) + 4; out += 0.5) if (onLand(along, side * out, spriteId)) return;
  };
  // Islands in the wide stretches.
  for (const along of [13, 63]) {
    const { x, y } = at(along);
    for (const [ix, iy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) tiles[iy][ix] = TILE.solid;
  }
  for (const along of [25, 50, 85, 100]) onWater(along, 0, ids.boat);
  for (const along of [45, 95, 128]) onWater(along, -1, ids.drone);
  [33, 70, 78, 106, 121].forEach((along, i) => onBank(along, i % 2 ? 1 : -1, ids.tower));
  for (let along = 6; along < CANAL_LONG - 6; along += 7) onLand(along, ((along / 7) % 2 ? 1 : -1) * (canalHalf(along) + 3.5), ids.bush);
  for (const along of [19, 40, 72, 103, 125]) onWater(along, 1.5, undefined, 'treasure');
  // The finish line, right across the water near the end.
  const finish = CANAL_LONG - 3;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) if (tiles[y][x] === TILE.empty && water(x, y) && Math.abs(near[y][x].along - finish) < 0.75) place(undefined, x, y, 'goal');
  }
  const start = at(2);
  return {
    id: createId(),
    name,
    width,
    height,
    tileSize: 16,
    background: CANAL_BACKGROUND,
    tiles: tiles.map((r) => r.join('')),
    playerStart: start,
    solidSpriteId: ids.bank,
    collectibleSpriteId: p.collectibleSpriteId,
    goalSpriteId: ids.finish,
    objects: numberObjects(objects),
    passThroughSpriteIds: [ids.bush],
    enemies: [
      { spriteId: ids.boat, hp: 2, moves: 'patrol' },
      { spriteId: ids.drone, hp: 1, moves: 'chase' },
      { spriteId: ids.tower, hp: 3, moves: 'still' },
    ],
    floor: floor.map((r) => r.join('')),
    floorTypes: [
      { spriteId: ids.waves, kind: 'water' },
      { spriteId: ids.field, kind: 'ground' },
    ],
    mode: 'shooter',
    movement: 'free',
    direction: 'up',
    winRule: 'goal',
  };
}

function shooterRules(level: Level): Rule[] {
  return [{ id: createId(), when: { on: 'start' }, then: { do: 'message', text: 'Fly the canal to the finish! ← → turn, ↑ thrust, ↓ brake, A fires.' }, levelId: level.id }];
}

/** A whole new shooter game: the ship and a laser, with a health bar and a shield. */
export function createShooterProject(name: string, now: Date = new Date()): Project {
  const base = createProject(name, now, 'platformer');
  const [old] = base.levels;
  const ship: Sprite = { ...createSprite('Ship', 16, fromArt(SHIP_ART)), frames: [fromArt(SHIP_FLAME)] };
  const keep = base.sprites.filter((s) => s.id === old.collectibleSpriteId);
  const laser = createAttackSprite('laser');
  const { ids, added } = kitSprites({ sprites: [] });
  const level = shooterMap(ids, old, 'Level 1');
  return {
    ...base,
    sprites: [ship, ...added, ...keep, laser],
    player: { ...base.player, spriteId: ship.id, speed: 110, health: 'bar', shield: true, attack: { spriteId: laser.id, kind: 'throw' } },
    levels: [level],
    rules: shooterRules(level),
  };
}

/** A shooter level added to a game: its hero flies it, with the kit's sprites (reusing any the game already has). */
export function shooterLevel(project: Project, name: string): { project: Project } | { error: string } {
  const { ids, added } = kitSprites(project);
  if (project.sprites.length + added.length > LIMITS.spritesMax) return { error: `A shooter level needs ${added.length} more sprites, and a game can have up to ${LIMITS.spritesMax}.` };
  const last = project.levels[project.levels.length - 1];
  const level = shooterMap(ids, last, name);
  const rules = shooterRules(level);
  if (project.rules.length + rules.length > LIMITS.rulesMax) return { error: `A game can have up to ${LIMITS.rulesMax} rules.` };
  return { project: { ...project, sprites: [...project.sprites, ...added], levels: [...project.levels, level], rules: [...project.rules, ...rules] } };
}
