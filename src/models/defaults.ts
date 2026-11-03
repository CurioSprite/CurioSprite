import { fromArt } from './art';
import { createAttackSprite } from './attacks';
import { createId } from './ids';
import { DEFAULT_PALETTE } from './palette';
import {
  APP_VERSION,
  NO_FLOOR,
  PROJECT_SCHEMA_VERSION,
  SCREEN_TILES,
  TILE,
  numberObjects,
  type EnemyType,
  type GameMode,
  type LevelConfig,
  type Project,
  type Sprite,
  type SpriteSize,
} from './project';

const HERO_ART = [
  '................',
  '.....kkkkkk.....',
  '....kttttttk....',
  '...kttttttttk...',
  '...kppppppppk...',
  '...kpkppppkpk...',
  '...kpkppppkpk...',
  '...kppppppppk...',
  '....kpprrppk....',
  '.....kkkkkk.....',
  '....kBBBBBBk....',
  '...kpBBBBBBpk...',
  '...kpBBBBBBpk...',
  '....kBBkkBBk....',
  '....knnk.knnk...',
  '....kkkk.kkkk...',
];

const COIN_ART = [
  '................',
  '.....kkkkkk.....',
  '....kyyyyyyk....',
  '...kyywwyyyyk...',
  '..kyywyyyyyyok..',
  '..kyywyyyyyyok..',
  '..kyyyyyyyyyok..',
  '..kyyyyyyyyyok..',
  '..kyyyyyyyyyok..',
  '..kyyyyyyyyyok..',
  '..kyyyyyyyyook..',
  '...kyyyyyyook...',
  '....koooooook...',
  '.....kkkkkk.....',
  '................',
  '................',
];

const BLOCK_ART = [
  'llllllllllllllll',
  'lGlllGllllGlllGl',
  'GGGGGGGGGGGGGGGG',
  'nnnnnnnnnnnnnnnn',
  'nnnsnnnnnnnnsnnn',
  'nnnnnnnnnnnnnnnn',
  'nnnnnnnsnnnnnnnn',
  'nnnnnnnnnnnnnnnn',
  'nsnnnnnnnnnnnnsn',
  'nnnnnnnnnnnnnnnn',
  'nnnnnnsnnnnnnnnn',
  'nnnnnnnnnnnnnnnn',
  'nnnnnnnnnnnsnnnn',
  'nnnsnnnnnnnnnnnn',
  'nnnnnnnnnnnnnnnn',
  'nnnnnnnnsnnnnnnn',
];

const FLAG_ART = [
  '...kk...........',
  '...kwkkkkkk.....',
  '...kwrrrrrrkk...',
  '...kwrrwwrrrrk..',
  '...kwrwwwwrrrrk.',
  '...kwrrwwrrrrk..',
  '...kwrrrrrrkk...',
  '...kwkkkkkk.....',
  '...kwk..........',
  '...kwk..........',
  '...kwk..........',
  '...kwk..........',
  '...kwk..........',
  '..kkwkk.........',
  '.kGGGGGk........',
  '.kkkkkkk........',
];

/** The starter goal flag (also given to older games that had no goal sprite). */
export function createFlagSprite(): Sprite {
  return createSprite('Flag', 16, fromArt(FLAG_ART));
}

const SLIME_ART = [
  '................',
  '................',
  '................',
  '................',
  '......kkkk......',
  '....kkGGGGkk....',
  '...kGGGGGGGGk...',
  '..kGGwkGGwkGGk..',
  '..kGGkkGGkkGGk..',
  '.kGGGGGGGGGGGGk.',
  '.kGlGGGGGGGGGGk.',
  '.kGGGGGrrGGGGGk.',
  '.kGGGGGGGGGGGGk.',
  '..kGGGGGGGGGGk..',
  '...kkkkkkkkkk...',
  '................',
];

const WALL_TOP = 'ssssssssssssssss';
const WALL_A = 'gggggggsgggggggs';
const WALL_B = 'gggsgggggggsgggg';
const WALL_ART = [WALL_TOP, WALL_A, WALL_A, WALL_A, WALL_TOP, WALL_B, WALL_B, WALL_B, WALL_TOP, WALL_A, WALL_A, WALL_A, WALL_TOP, WALL_B, WALL_B, WALL_B];

export function createBlankPixels(size: SpriteSize): number[] {
  return new Array<number>(size * size).fill(0);
}

export function createSprite(name: string, size: SpriteSize = 16, pixels?: number[]): Sprite {
  return { id: createId(), name, width: size, height: size, pixels: pixels ?? createBlankPixels(size) };
}

interface RowSpec {
  solid?: Array<[number, number]>;
}

function buildRow(width: number, spec: RowSpec = {}): string {
  const cells: string[] = new Array<string>(width).fill(TILE.empty);
  for (const [from, to] of spec.solid ?? []) {
    for (let x = from; x <= to; x++) cells[x] = TILE.solid;
  }
  return cells.join('');
}

type At = Array<[number, number]>;

interface StarterLevel {
  tiles: string[];
  playerStart: { x: number; y: number };
  background: string;
  treasureAt: At;
  goalAt: At;
  /** Where the starter enemies stand. */
  enemyAt: At;
}

/** Side view: ground along the bottom, platforms, a gap and a flag at the end. */
function sideViewStarter(): StarterLevel {
  const width = SCREEN_TILES.width * 2;
  const ground: RowSpec = { solid: [[0, 17], [21, width - 1]] };
  const specs: Record<number, RowSpec> = {
    8: { solid: [[30, 33]] },
    9: { solid: [[11, 14]] },
    10: { solid: [[24, 28]] },
    11: { solid: [[6, 9], [41, 45]] },
    13: ground,
    14: ground,
  };
  return {
    tiles: Array.from({ length: SCREEN_TILES.height }, (_, y) => buildRow(width, specs[y])),
    playerStart: { x: 1, y: 12 },
    background: '#7dd3fc',
    treasureAt: [[32, 7], [13, 8], [26, 9], [43, 9], [7, 10], [19, 10], [3, 12], [37, 12], [45, 12]],
    goalAt: [[48, 12]],
    enemyAt: [[13, 12], [25, 9], [36, 12]],
  };
}

/**
 * Climb: a side-view tower one screen wide and three tall. Ledges zig-zag up
 * (each a jump above the last, never right overhead) to the flag at the top.
 */
function climbStarter(): StarterLevel {
  const width = SCREEN_TILES.width;
  const height = SCREEN_TILES.height * 3;
  const ledges: Array<[number, number]> = [[2, 8], [10, 15], [17, 22], [10, 15]];
  const specs: Record<number, RowSpec> = { [height - 2]: { solid: [[0, width - 1]] }, [height - 1]: { solid: [[0, width - 1]] } };
  const rows: number[] = [];
  for (let y = height - 5, i = 0; y >= 4; y -= 3, i++) {
    specs[y] = { solid: [ledges[i % ledges.length]] };
    rows.push(y);
  }
  // The top ledge is wider (still beside the one below, so nobody bumps their head), with the flag.
  const top = rows[rows.length - 1];
  specs[top] = { solid: [[1, 8]] };
  const on = (i: number): [number, number] => {
    const [from, to] = specs[rows[i]].solid![0];
    return [Math.floor((from + to) / 2), rows[i] - 1];
  };
  return {
    tiles: Array.from({ length: height }, (_, y) => buildRow(width, specs[y])),
    playerStart: { x: 12, y: height - 3 },
    background: '#7dd3fc',
    treasureAt: [[5, height - 3], on(1), on(3), on(4), on(6), on(8), on(10), [2, top - 1]],
    goalAt: [[5, top - 1]],
    enemyAt: [[21, height - 3], on(5), on(9)],
  };
}

/** Top-down: a walled map seen from above, with rooms joined by doorways. */
function topDownStarter(): StarterLevel {
  const width = SCREEN_TILES.width * 2;
  const height = SCREEN_TILES.height;
  const grid = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x): string => (x === 0 || y === 0 || x === width - 1 || y === height - 1 ? TILE.solid : TILE.empty)),
  );
  const wall = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y][x] = TILE.solid;
  };
  wall(16, 1, 16, 9); // room 1 → 2: doorway at the bottom
  wall(33, 5, 33, 13); // room 2 → 3: doorway at the top
  wall(20, 7, 23, 7);
  wall(26, 7, 29, 7);
  wall(8, 10, 10, 11);
  wall(40, 4, 42, 5);
  return {
    tiles: grid.map((row) => row.join('')),
    playerStart: { x: 3, y: 7 },
    background: '#bbf7d0',
    treasureAt: [[5, 3], [12, 12], [20, 3], [27, 11], [24, 4], [38, 2], [44, 11], [47, 2]],
    goalAt: [[46, 7]],
    enemyAt: [[10, 4], [25, 10], [38, 9], [45, 4]],
  };
}

/** The starter level every new game receives, for the chosen view. */
export function createDefaultLevel(
  solidSpriteId: string,
  collectibleSpriteId: string,
  goalSpriteId: string,
  view: GameMode = 'platformer',
  enemy?: EnemyType,
  climb = false,
): LevelConfig {
  const starter = view === 'topdown' ? topDownStarter() : climb ? climbStarter() : sideViewStarter();
  return {
    id: createId(),
    name: 'Level 1',
    width: starter.tiles[0].length,
    height: starter.tiles.length,
    tileSize: 16,
    background: starter.background,
    tiles: starter.tiles,
    playerStart: starter.playerStart,
    solidSpriteId,
    collectibleSpriteId,
    goalSpriteId,
    objects: numberObjects([
      ...starter.treasureAt.map(([x, y]) => ({ id: createId(), kind: 'treasure' as const, x, y })),
      ...starter.goalAt.map(([x, y]) => ({ id: createId(), kind: 'goal' as const, x, y })),
      ...(enemy ? starter.enemyAt.map(([x, y]) => ({ id: createId(), kind: 'sprite' as const, spriteId: enemy.spriteId, x, y })) : []),
    ]),
    passThroughSpriteIds: [],
    enemies: enemy ? [enemy] : [],
    floor: starter.tiles.map((row) => NO_FLOOR.repeat(row.length)),
    floorTypes: [],
  };
}

export const DEFAULT_PLAYER = { speed: 90, jumpStrength: 320, hearts: 3 } as const;
export const DEFAULT_GRAVITY = 900;

/** Builds a complete, immediately playable project for the chosen view (side view can be a tall climb). */
export function createProject(name: string, now: Date = new Date(), view: GameMode = 'platformer', climb = false): Project {
  const hero = createSprite('Hero', 16, fromArt(HERO_ART));
  const coin = createSprite('Coin', 16, fromArt(COIN_ART));
  const block = view === 'topdown' ? createSprite('Wall', 16, fromArt(WALL_ART)) : createSprite('Block', 16, fromArt(BLOCK_ART));
  const flag = createFlagSprite();
  const slime = createSprite('Slime', 16, fromArt(SLIME_ART));
  const sword = createAttackSprite('sword');
  const enemy: EnemyType = { spriteId: slime.id, hp: 2, moves: view === 'topdown' ? 'wander' : 'patrol' };
  const timestamp = now.toISOString();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: createId(),
    revision: 0,
    meta: {
      name: name.trim() || 'My Game',
      description: '',
      createdAt: timestamp,
      updatedAt: timestamp,
      appVersion: APP_VERSION,
    },
    palette: [...DEFAULT_PALETTE],
    sprites: [hero, coin, block, flag, slime, sword],
    player: {
      spriteId: hero.id,
      speed: DEFAULT_PLAYER.speed,
      jumpStrength: DEFAULT_PLAYER.jumpStrength,
      hearts: DEFAULT_PLAYER.hearts,
      attack: { spriteId: sword.id, kind: 'swing' },
    },
    levels: [
      {
        ...createDefaultLevel(block.id, coin.id, flag.id, view, enemy, climb && view === 'platformer'),
        mode: view,
        movement: 'free',
        direction: climb && view === 'platformer' ? 'up' : 'across',
        winRule: 'goal',
      },
    ],
    settings: { gravity: DEFAULT_GRAVITY, battle: 'action' },
    // Two examples, so the Rules list isn't empty the first time it is opened.
    rules: [
      { id: createId(), when: { on: 'start' }, then: { do: 'message', text: 'Find the flag!' } },
      { id: createId(), when: { on: 'collect', count: 'all' }, then: { do: 'message', text: 'You found all the treasure!' } },
    ],
  };
}
