/**
 * Adventure: a top-down world to explore square by square, with grass and
 * paths, a pond, tall grass where wild creatures jump out, and a ranger to
 * talk to. All the art here is CurioSprite's own starter art, ready to redraw.
 */
import { fromArt } from './art';
import { createProject, createSprite } from './defaults';
import { createId } from './ids';
import {
  FLOOR_KEYS,
  LIMITS,
  SCREEN_TILES,
  TILE,
  numberObjects,
  type FloorKind,
  type Level,
  type LevelObject,
  type Project,
  type Rule,
  type Sprite,
} from './project';

const GRASS_ART = [
  'llllllllllllllll',
  'lllllllllGllllll',
  'llGllllllGlGllll',
  'lGlGllllllllllll',
  'llllllllllllllll',
  'llllllllllllGlll',
  'llllllGlllllGlGl',
  'lllllGlGllllllll',
  'llllllllllllllll',
  'lGllllllllllllll',
  'lGlGlllllllGllll',
  'llllllllllGlGlll',
  'llllllllllllllll',
  'lllllllGllllllll',
  'llllllGlGllllllG',
  'llllllllllllllll',
];

const PATH_ART = [
  'pppppppppppppppp',
  'ppppppopppppppwp',
  'ppwppppppppppppp',
  'pppppppppppopppp',
  'pppppopppppppppp',
  'pppppppppwpppppp',
  'pppppppppppppppp',
  'popppppppppppppo',
  'pppppppppppppppp',
  'pppppppwpppppppp',
  'pppopppppppppppp',
  'pppppppppppppwpp',
  'pppppppppopppppp',
  'pwpppppppppppppp',
  'pppppppppppppppp',
  'ppppppppppoppppp',
];

const TALL_GRASS_ART = [
  'lGllllGllGllllGl',
  'GlGllGlGGlGllGlG',
  'GlGllGlGGlGllGlG',
  'GGGlGGGlGGGlGGGl',
  'GtGlGtGlGtGlGtGl',
  'GtGGGtGGGtGGGtGG',
  'GGGGGGGGGGGGGGGG',
  'tGtGtGtGtGtGtGtG',
  'lGllllGllGllllGl',
  'GlGllGlGGlGllGlG',
  'GlGllGlGGlGllGlG',
  'GGGlGGGlGGGlGGGl',
  'GtGlGtGlGtGlGtGl',
  'GtGGGtGGGtGGGtGG',
  'GGGGGGGGGGGGGGGG',
  'tGtGtGtGtGtGtGtG',
];

const WATER_ART = [
  'bbbbbbbbbbbbbbbb',
  'bwwbbbbbbwwbbbbb',
  'wbbwbbbbwbbwbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbwwbbbbbbwwb',
  'bbbbwbbwbbbbwbbw',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bwwbbbbbbwwbbbbb',
  'wbbwbbbbwbbwbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbwwbbbbbbwwb',
  'bbbbwbbwbbbbwbbw',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
];

const FLOWERS_ART = [
  'llllllllllllllll',
  'lllPlllllllllyll',
  'llPyPlllllllyuyl',
  'lllPllllllllllyl',
  'lllGllllllllllGl',
  'llllllllllllllll',
  'lllllllPllllllll',
  'llllllPwPlllllll',
  'lllllllPllllllll',
  'lllllllGllllPlll',
  'llllllllllllPyPl',
  'llyllllllllllPll',
  'lyuyllllllllllGl',
  'llylllllllllllll',
  'llGlllllllllllll',
  'llllllllllllllll',
];

const TREE_ART = [
  '.....kkkkkk.....',
  '...kkGGGGGGkk...',
  '..kGGlGGGGGGGk..',
  '.kGGlllGGGGGGGk.',
  '.kGlllGGGGlGGGk.',
  'kGGllGGGGlllGGGk',
  'kGGGGGGGGllGGGGk',
  'kGGGGGlGGGGGGGGk',
  'kGGGGlllGGGGGGGk',
  '.kGGGGlGGGGGGGk.',
  '.kGGGGGGGGGGGGk.',
  '..kkGGGGGGGGkk..',
  '....kkknnkkk....',
  '......knnk......',
  '......knnk......',
  '.....kknnkk.....',
];

const BERRY_ART = [
  '................',
  '.......kGk......',
  '......kGlGk.....',
  '.......kGk......',
  '.....kkkkkkk....',
  '....krrrrrrrk...',
  '...krwwrrrrrrk..',
  '...krwrrrrrrrk..',
  '...krrrrrrrrrk..',
  '...krrrrrrrrrk..',
  '...krrrrrrrrrk..',
  '....krrrrrrrk...',
  '.....krrrrrk....',
  '......kkkkk.....',
  '................',
  '................',
];

const RANGER_ART = [
  '................',
  '.....kkkkkk.....',
  '....kGGGGGGk....',
  '...kkkkkkkkkk...',
  '....kppppppk....',
  '....kpkppkpk....',
  '....kppppppk....',
  '.....kpPPpk.....',
  '....kkkkkkkk....',
  '...knGGGGGGnk...',
  '...kpnGGGGnpk...',
  '...kpnGGGGnpk...',
  '....knnnnnnk....',
  '....kssk.kssk...',
  '....kssk.kssk...',
  '....kkk..kkk....',
];

const LEAF_BEETLE_ART = [
  '................',
  '........kk......',
  '.......kGlk.....',
  '......kGllGk....',
  '.....kkGlGkk....',
  '....kGGkkkGGk...',
  '...kGGGGGGGGGk..',
  '..kGwkGGGGwkGGk.',
  '..kGkkGGGGkkGGk.',
  '..kGGGGGGGGGGGk.',
  '..klGGGGGGGGGlk.',
  '...kGGGGGGGGGk..',
  '....kkkkkkkkk...',
  '....k.k...k.k...',
  '................',
  '................',
];

const PEBBLE_CRAB_ART = [
  '................',
  '.kk..........kk.',
  'kook........kook',
  'kok..k....k..kok',
  '.kk.kwk..kwk.kk.',
  '..k.kkk..kkk.k..',
  '..kk.kkkkkk.kk..',
  '...kkggggggkk...',
  '..kgggwggggsgk..',
  '.kgsgggggsggggk.',
  '.kgggggsgggggsk.',
  '.kkoooooooooookk',
  '..kooooooooook..',
  '...kokkokkokok..',
  '...k.k.k.k.k.k..',
  '................',
];

/** What each kit sprite is in an adventure level. */
type KitPart = 'grass' | 'path' | 'tallGrass' | 'water' | 'flowers' | 'tree' | 'berry' | 'ranger' | 'beetle' | 'crab';
const KIT: Record<KitPart, { name: string; art: string[] }> = {
  grass: { name: 'Grass', art: GRASS_ART },
  path: { name: 'Path', art: PATH_ART },
  tallGrass: { name: 'Tall grass', art: TALL_GRASS_ART },
  water: { name: 'Water', art: WATER_ART },
  flowers: { name: 'Flowers', art: FLOWERS_ART },
  tree: { name: 'Tree', art: TREE_ART },
  berry: { name: 'Berry', art: BERRY_ART },
  ranger: { name: 'Ranger', art: RANGER_ART },
  beetle: { name: 'Leaf Beetle', art: LEAF_BEETLE_ART },
  crab: { name: 'Pebble Crab', art: PEBBLE_CRAB_ART },
};
const FLOOR_PARTS: Array<[KitPart, FloorKind]> = [
  ['grass', 'ground'],
  ['path', 'ground'],
  ['tallGrass', 'grass'],
  ['water', 'water'],
  ['flowers', 'ground'],
];

/**
 * The kit's sprites in a game: ones it already has (by name, so a second
 * adventure level reuses them, redrawn or not) and new ones for the rest.
 */
function kitSprites(project: Pick<Project, 'sprites'>): { ids: Record<KitPart, string>; added: Sprite[] } {
  const added: Sprite[] = [];
  const ids = {} as Record<KitPart, string>;
  for (const part of Object.keys(KIT) as KitPart[]) {
    const existing = project.sprites.find((s) => s.name === KIT[part].name);
    if (existing) {
      ids[part] = existing.id;
    } else {
      const sprite = createSprite(KIT[part].name, 16, fromArt(KIT[part].art));
      added.push(sprite);
      ids[part] = sprite.id;
    }
  }
  return { ids, added };
}

/** The starter adventure map: two screens across, square by square, won at the flag past the pond. */
function adventureMap(ids: Record<KitPart, string>, goalSpriteId: string, name: string): { level: Level; rangerId: string } {
  const width = SCREEN_TILES.width * 2;
  const height = SCREEN_TILES.height;
  const tiles = Array.from({ length: height }, () => Array<string>(width).fill(TILE.empty));
  const floorKinds: KitPart[] = FLOOR_PARTS.map(([p]) => p);
  const key = (part: KitPart) => FLOOR_KEYS[floorKinds.indexOf(part)];
  const floor = Array.from({ length: height }, () => Array<string>(width).fill(key('grass')));
  const box = (grid: string[][], x0: number, y0: number, x1: number, y1: number, c: string) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y][x] = c;
  };
  // Trees all round, and in clumps.
  box(tiles, 0, 0, width - 1, 0, TILE.solid);
  box(tiles, 0, height - 1, width - 1, height - 1, TILE.solid);
  box(tiles, 0, 0, 0, height - 1, TILE.solid);
  box(tiles, width - 1, 0, width - 1, height - 1, TILE.solid);
  box(tiles, 12, 1, 14, 4, TILE.solid);
  box(tiles, 30, 10, 33, 13, TILE.solid);
  box(tiles, 40, 1, 42, 3, TILE.solid);
  // A path across, and one up to a berry; tall grass; a pond; flowers.
  box(floor, 1, 7, width - 2, 7, key('path'));
  box(floor, 24, 2, 24, 6, key('path'));
  box(floor, 7, 9, 14, 13, key('tallGrass'));
  box(floor, 26, 2, 34, 5, key('tallGrass'));
  box(floor, 36, 9, 45, 13, key('tallGrass'));
  box(floor, 17, 9, 22, 12, key('water'));
  for (const [x, y] of [[3, 3], [5, 4], [20, 3], [21, 4], [46, 5], [9, 3], [37, 5]] as const) floor[y][x] = key('flowers');
  const rangerId = createId();
  const objects: LevelObject[] = [
    { id: rangerId, kind: 'sprite', spriteId: ids.ranger, x: 4, y: 6 },
    ...([[10, 11], [24, 2], [29, 3], [19, 5], [43, 11]] as const).map(([x, y]) => ({ id: createId(), kind: 'treasure' as const, x, y })),
    { id: createId(), kind: 'goal', x: width - 3, y: 7 },
  ];
  const level: Level = {
    id: createId(),
    name,
    width,
    height,
    tileSize: 16,
    background: '#84cc16',
    tiles: tiles.map((r) => r.join('')),
    playerStart: { x: 2, y: 7 },
    solidSpriteId: ids.tree,
    collectibleSpriteId: ids.berry,
    goalSpriteId,
    objects: numberObjects(objects),
    passThroughSpriteIds: [],
    // Not placed anywhere: they live in the tall grass.
    enemies: [
      { spriteId: ids.beetle, hp: 2, moves: 'wander' },
      { spriteId: ids.crab, hp: 3, moves: 'wander' },
    ],
    floor: floor.map((r) => r.join('')),
    floorTypes: FLOOR_PARTS.map(([part, kind]) => ({ spriteId: ids[part], kind })),
    mode: 'topdown',
    movement: 'grid',
    direction: 'across',
    winRule: 'goal',
  };
  return { level, rangerId };
}

/** The ranger says hello, gives a tip and a heart back; the level starts with a hint. */
function adventureRules(level: Level, rangerSpriteId: string): Rule[] {
  const say = (text: string): Rule => ({ id: createId(), when: { on: 'talk', spriteId: rangerSpriteId }, then: { do: 'message', text }, levelId: level.id });
  return [
    { id: createId(), when: { on: 'start' }, then: { do: 'message', text: 'Talk to the ranger: face them and press A.' }, levelId: level.id },
    say('Hello! Wild creatures hide in the tall grass.'),
    say('Walk through it if you dare. The flag is past the pond!'),
    say('Here, have a heart back. Good luck!'),
    { id: createId(), when: { on: 'talk', spriteId: rangerSpriteId }, then: { do: 'heal' }, levelId: level.id },
  ];
}

/** A whole new adventure game: turn-based battles, 5 hearts, the hero walking square by square. */
export function createAdventureProject(name: string, now: Date = new Date()): Project {
  const base = createProject(name, now, 'topdown');
  const [old] = base.levels;
  const hero = base.sprites.find((s) => s.id === base.player.spriteId)!;
  const flag = base.sprites.find((s) => s.id === old.goalSpriteId)!;
  const attack = base.sprites.find((s) => s.id === base.player.attack?.spriteId);
  const { ids, added } = kitSprites({ sprites: [] });
  const { level } = adventureMap(ids, flag.id, 'Level 1');
  return {
    ...base,
    sprites: [hero, ...added, flag, ...(attack ? [attack] : [])],
    player: { ...base.player, hearts: 5 },
    levels: [level],
    settings: { ...base.settings, battle: 'turns' },
    rules: adventureRules(level, ids.ranger),
  };
}

/** An adventure level added to a game, with the kit's sprites (reusing any the game already has). */
export function adventureLevel(project: Project, name: string): { project: Project } | { error: string } {
  const { ids, added } = kitSprites(project);
  if (project.sprites.length + added.length > LIMITS.spritesMax) return { error: `An adventure level needs ${added.length} more sprites, and a game can have up to ${LIMITS.spritesMax}.` };
  const goal = project.levels[project.levels.length - 1].goalSpriteId;
  const { level } = adventureMap(ids, goal, name);
  const rules = adventureRules(level, ids.ranger);
  if (project.rules.length + rules.length > LIMITS.rulesMax) return { error: `A game can have up to ${LIMITS.rulesMax} rules.` };
  return { project: { ...project, sprites: [...project.sprites, ...added], levels: [...project.levels, level], rules: [...project.rules, ...rules] } };
}
