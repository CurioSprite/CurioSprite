/**
 * Racing: a car races rival cars round a looping track for a few laps, seen
 * from the driver's seat. The track is built from above, like any level. Off the road the grass slows you down, and hedges and tyre
 * stacks are in the way. All the art here is CurioSprite's own starter art,
 * ready to redraw.
 */
import { fromArt } from './art';
import { createProject, createSprite } from './defaults';
import { createId } from './ids';
import { FLOOR_KEYS, LIMITS, TILE, numberObjects, type Level, type LevelObject, type Project, type Rule, type Sprite } from './project';

/** A race car seen from above, pointing up: `r` is its paint. The second frame turns its wheels. */
const CAR_ART = [
  '................',
  '.....kkkkkk.....',
  '....kyrrrryk....',
  '..kkkrrrrrrkkk..',
  '..kkkrbbbbrkkk..',
  '..kkkrbbbbrkkk..',
  '....krrrrrrk....',
  '....krrwwrrk....',
  '....krrwwrrk....',
  '....krrrrrrk....',
  '..kkkrrrrrrkkk..',
  '..kkkrbbbbrkkk..',
  '..kkkrrrrrrkkk..',
  '....kwrrrrwk....',
  '.....kkkkkk.....',
  '................',
];
/** The back of a race car, as seen driving behind it (`r` is its paint, pink its tail lights). */
const CAR_REAR = [
  '................',
  '................',
  '................',
  '................',
  '....kkkkkkkk....',
  '...kbbbbbbbbk...',
  '...kbwbbbbbbk...',
  '..krrrrrrrrrrk..',
  '.krrrrrrrrrrrrk.',
  '.kPPrrrrrrrrPPk.',
  '.krrrrkkkkrrrrk.',
  '.krrrrkwwkrrrrk.',
  '.kkkkkkkkkkkkkk.',
  '.kkk........kkk.',
  '.kkk........kkk.',
  '................',
];
const CAR_ROLL = CAR_ART.map((r, y) => (y === 4 || y === 11 ? r.replace(/^\.\.kkk/, '..ksk').replace(/kkk\.\.$/, 'ksk..') : r));
const painted = (art: string[], paint: string) => art.map((r) => r.replace(/r/g, paint));

/** Grey road, a little speckled. */
const ROAD_ART = Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => ((x * 5 + y * 11 + x * y) % 17 === 0 ? 's' : 'g')).join(''));

/** Light grass beside the road (it slows cars down). */
const VERGE_ART = Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => ((x * 7 + y * 3) % 13 === 0 ? 'G' : (x + y * 5) % 19 === 0 ? 'y' : 'l')).join(''));

/** A thick dark hedge, seen from above: the track's walls. Leafy clumps with shadowy gaps between. */
const HEDGE_ART = Array.from({ length: 16 }, (_, y) =>
  Array.from({ length: 16 }, (_, x) => {
    const cx = (x % 8) - 3.5;
    const cy = (y % 8) - 3.5;
    const d = Math.hypot(cx, cy);
    if (d > 4.4) return 'k';
    if (d > 3.6) return 's';
    return cx + cy < -2.5 && d > 1 ? 'l' : (x * 3 + y * 7) % 11 === 0 ? 't' : 'G';
  }).join(''),
);

/** A stack of old tyres, seen from above. */
const TYRES_ART = Array.from({ length: 16 }, (_, y) =>
  Array.from({ length: 16 }, (_, x) => {
    for (const [cx, cy] of [[4.5, 4.5], [11, 5.5], [7.5, 11]]) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < 1.3) return 'g';
      if (d < 2.4) return 's';
      if (d < 3.6) return 'k';
    }
    return '.';
  }).join(''),
);

/** A tree standing up, for the driver's view. */
const TREE_STANDING = [
  '.....kkkkkk.....',
  '...kkllGGGGkk...',
  '..klllGGGGGGGk..',
  '.klllGGGGGGGGGk.',
  '.kllGGGGGGGGGGk.',
  'kllGGGGGtGGGGGGk',
  'klGGGGGGGGGGtGGk',
  'kGGGGtGGGGGGGGGk',
  '.kGGGGGGGGtGGGk.',
  '.kGGGGGGGGGGGGk.',
  '..kkGGGGGGGGkk..',
  '....kkknnkkk....',
  '......knnk......',
  '......knnk......',
  '......knnk......',
  '.....kknnkk.....',
];

/** A stack of tyres standing up, for the driver's view. */
const TYRES_STANDING = Array.from({ length: 16 }, (_, y) =>
  Array.from({ length: 16 }, (_, x) => {
    if (y < 4 || x < 2 || x > 13) return '.';
    if (x === 2 || x === 13) return 'k';
    return ['k', 's', 'g', 's'][(y - 4) % 4];
  }).join(''),
);

/** A round treetop, seen from above, standing out from the hedge round it. */
const TREE_ART = Array.from({ length: 16 }, (_, y) =>
  Array.from({ length: 16 }, (_, x) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d >= 7.2) return '.';
    if (d >= 6.2) return 'k';
    return Math.hypot(x - 5.5, y - 5.5) < 2.5 ? 'y' : (x * 3 + y * 5) % 7 === 0 ? 'G' : 'l';
  }).join(''),
);

/** Black and white squares across the road. */
const FINISH_ART = Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => (((x >> 2) + (y >> 2)) % 2 ? 'k' : 'w')).join(''));

type KitPart = 'blue' | 'orange' | 'purple' | 'road' | 'verge' | 'hedge' | 'tyres' | 'tree' | 'finish';
/** Each part's picture from above (its frames), and standing up as the driver sees it (its back view). */
const KIT: Record<KitPart, { name: string; frames: string[][]; standing?: string[] }> = {
  blue: { name: 'Blue racer', frames: [painted(CAR_ART, 'B'), painted(CAR_ROLL, 'B')], standing: painted(CAR_REAR, 'B') },
  orange: { name: 'Orange racer', frames: [painted(CAR_ART, 'o'), painted(CAR_ROLL, 'o')], standing: painted(CAR_REAR, 'o') },
  purple: { name: 'Purple racer', frames: [painted(CAR_ART, 'u'), painted(CAR_ROLL, 'u')], standing: painted(CAR_REAR, 'u') },
  road: { name: 'Road', frames: [ROAD_ART] },
  verge: { name: 'Verge', frames: [VERGE_ART] },
  hedge: { name: 'Hedge', frames: [HEDGE_ART] },
  tyres: { name: 'Tyres', frames: [TYRES_ART], standing: TYRES_STANDING },
  tree: { name: 'Tree', frames: [TREE_ART], standing: TREE_STANDING },
  finish: { name: 'Finish line', frames: [FINISH_ART] },
};

const kitSprite = (name: string, frames: string[][], standing?: string[]): Sprite => {
  const [first, ...rest] = frames.map(fromArt);
  const sprite: Sprite = createSprite(name, 16, first);
  if (rest.length) sprite.frames = rest;
  if (standing) sprite.back = [fromArt(standing)];
  return sprite;
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
      const sprite = kitSprite(KIT[part].name, KIT[part].frames, KIT[part].standing);
      added.push(sprite);
      ids[part] = sprite.id;
    }
  }
  return { ids, added };
}

/** The starter track's middle line, in squares, going round clockwise and back to where it began. */
const TRACK_PATH: ReadonlyArray<readonly [number, number]> = [
  [12, 8], [32, 6], [52, 8], [57, 16], [53, 26], [57, 35], [48, 39], [30, 37], [14, 39], [7, 30], [9, 18], [12, 8],
];
const TRACK_SIZE = { width: 64, height: 46 };
/** How far the road and then the grass reach either side of the middle line. */
const ROAD_HALF = 3.2;
const VERGE_HALF = 5.6;
/** Where the finish line is, and where the cars line up, in squares along the track. */
const FINISH_AT = 6;

type Segment = { x: number; y: number; dx: number; dy: number; length: number; from: number };
const SEGMENTS: Segment[] = (() => {
  const list: Segment[] = [];
  let from = 0;
  for (let i = 1; i < TRACK_PATH.length; i++) {
    const [x, y] = TRACK_PATH[i - 1];
    const dx = TRACK_PATH[i][0] - x;
    const dy = TRACK_PATH[i][1] - y;
    const length = Math.hypot(dx, dy);
    list.push({ x, y, dx: dx / length, dy: dy / length, length, from });
    from += length;
  }
  return list;
})();

/** The nearest place on the middle line to a point: how far round the track it is, and how far from the middle. */
function nearestOnTrack(x: number, y: number): { along: number; off: number } {
  let best = { along: 0, off: Infinity };
  for (const g of SEGMENTS) {
    const t = Math.max(0, Math.min(g.length, (x - g.x) * g.dx + (y - g.y) * g.dy));
    const off = Math.hypot(x - (g.x + g.dx * t), y - (g.y + g.dy * t));
    if (off < best.off) best = { along: g.from + t, off };
  }
  return best;
}

/** A point that far round the track, and the way the track goes there. */
function trackPoint(along: number): { x: number; y: number; dx: number; dy: number } {
  const g = SEGMENTS.find((g) => along <= g.from + g.length) ?? SEGMENTS[SEGMENTS.length - 1];
  const t = Math.min(g.length, along - g.from);
  return { x: g.x + g.dx * t, y: g.y + g.dy * t, dx: g.dx, dy: g.dy };
}

/**
 * A looping track: road with grass either side, hedges all round, tyre stacks
 * on the outside of the bends, trees in the middle, a finish line across the
 * road, and three rival cars lined up beside and ahead of the player.
 */
function racingMap(ids: Record<KitPart, string>, p: Pick<Level, 'collectibleSpriteId'>, name: string): Level {
  const { width, height } = TRACK_SIZE;
  const near = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => nearestOnTrack(x, y)));
  const road = (x: number, y: number) => near[y][x].off <= ROAD_HALF;
  const drivable = (x: number, y: number) => x > 0 && y > 0 && x < width - 1 && y < height - 1 && near[y][x].off <= VERGE_HALF;
  const tiles = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => (drivable(x, y) ? TILE.empty : TILE.solid)));
  const floor = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (!drivable(x, y) ? '.' : road(x, y) ? FLOOR_KEYS[0] : FLOOR_KEYS[1])),
  );
  const objects: LevelObject[] = [];
  const taken = new Set<string>();
  const place = (spriteId: string | undefined, x: number, y: number, kind: LevelObject['kind'] = 'sprite') => {
    if (x < 0 || y < 0 || x >= width || y >= height || taken.has(`${x},${y}`)) return;
    taken.add(`${x},${y}`);
    objects.push({ id: createId(), kind, ...(spriteId ? { spriteId } : {}), x, y });
  };
  /** The square that far round the track, moved `side` squares to its right (negative: left). */
  const at = (along: number, side = 0) => {
    const c = trackPoint(along);
    return { x: Math.round(c.x - c.dy * side), y: Math.round(c.y + c.dx * side) };
  };
  // The finish line, right across the road and grass.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) if (tiles[y][x] === TILE.empty && Math.abs(near[y][x].along - FINISH_AT) < 0.6) place(undefined, x, y, 'goal');
  }
  // Tyre stacks on the grass at the outside of each bend (the track goes clockwise, so outside is on the left).
  for (let i = 1; i < SEGMENTS.length; i++) {
    const turn = SEGMENTS[i - 1].dx * SEGMENTS[i].dy - SEGMENTS[i - 1].dy * SEGMENTS[i].dx;
    if (Math.abs(turn) < 0.3) continue;
    const outside = turn > 0 ? -1 : 1;
    for (const off of [-1, 0, 1]) {
      const { x, y } = at(SEGMENTS[i].from + off * 1.5, outside * (VERGE_HALF - 0.8));
      if (tiles[y]?.[x] === TILE.empty) place(ids.tyres, x, y);
    }
  }
  // Trees in the hedge, here and there.
  for (let y = 2; y < height - 2; y += 5) {
    for (let x = 2 + (y % 2) * 2; x < width - 2; x += 6) if (tiles[y][x] === TILE.solid && near[y][x].off > VERGE_HALF + 1.5) place(ids.tree, x, y);
  }
  // Three rivals ahead and beside, and the player at the back left.
  const grid = [at(FINISH_AT + 6.5, 1.6), at(FINISH_AT + 6.5, -1.6), at(FINISH_AT + 4, 1.6)];
  [ids.blue, ids.orange, ids.purple].forEach((car, i) => place(car, grid[i].x, grid[i].y));
  const start = at(FINISH_AT + 4, -1.6);
  return {
    id: createId(),
    name,
    width,
    height,
    tileSize: 16,
    background: '#16a34a',
    tiles: tiles.map((r) => r.join('')),
    playerStart: start,
    solidSpriteId: ids.hedge,
    collectibleSpriteId: p.collectibleSpriteId,
    goalSpriteId: ids.finish,
    objects: numberObjects(objects),
    passThroughSpriteIds: [ids.tree],
    enemies: [
      { spriteId: ids.blue, hp: 1, moves: 'chase' },
      { spriteId: ids.orange, hp: 1, moves: 'chase' },
      { spriteId: ids.purple, hp: 1, moves: 'chase' },
    ],
    floor: floor.map((r) => r.join('')),
    floorTypes: [
      { spriteId: ids.road, kind: 'ground' },
      { spriteId: ids.verge, kind: 'grass' },
    ],
    mode: 'racing',
    movement: 'free',
    direction: 'across',
    winRule: 'goal',
  };
}

function racingRules(level: Level): Rule[] {
  return [{ id: createId(), when: { on: 'start' }, then: { do: 'message', text: 'Race 3 laps! ← → steer, ↑ goes, ↓ brakes.' }, levelId: level.id }];
}

/** A whole new racing game: a red race car against three rivals. */
export function createRacingProject(name: string, now: Date = new Date()): Project {
  const base = createProject(name, now, 'platformer');
  const [old] = base.levels;
  const car: Sprite = { ...createSprite('Race car', 16, fromArt(CAR_ART)), frames: [fromArt(CAR_ROLL)], back: [fromArt(CAR_REAR)] };
  const keep = base.sprites.filter((s) => s.id === old.collectibleSpriteId);
  const { ids, added } = kitSprites({ sprites: [] });
  const level = racingMap(ids, old, 'Level 1');
  const { attack: _attack, ...player } = base.player;
  return {
    ...base,
    sprites: [car, ...added, ...keep],
    player: { ...player, spriteId: car.id, speed: 150 },
    levels: [level],
    rules: racingRules(level),
  };
}

/** A racing level added to a game: its hero drives it, with the kit's sprites (reusing any the game already has). */
export function racingLevel(project: Project, name: string): { project: Project } | { error: string } {
  const { ids, added } = kitSprites(project);
  if (project.sprites.length + added.length > LIMITS.spritesMax) return { error: `A racing level needs ${added.length} more sprites, and a game can have up to ${LIMITS.spritesMax}.` };
  const last = project.levels[project.levels.length - 1];
  const level = racingMap(ids, last, name);
  const rules = racingRules(level);
  if (project.rules.length + rules.length > LIMITS.rulesMax) return { error: `A game can have up to ${LIMITS.rulesMax} rules.` };
  return { project: { ...project, sprites: [...project.sprites, ...added], levels: [...project.levels, level], rules: [...project.rules, ...rules] } };
}
