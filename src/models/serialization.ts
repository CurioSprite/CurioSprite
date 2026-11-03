import { createAttackSprite } from './attacks';
import { createFlagSprite, createProject, createSprite } from './defaults';
import { readLook } from './heroMaker';
import { createId } from './ids';
import { HEX_COLOR } from './palette';
import {
  APP_VERSION,
  FLOOR_KEYS,
  FLOOR_KINDS,
  GAME_MODES,
  MOVEMENTS,
  NO_FLOOR,
  type FloorKind,
  type FloorType,
  type Movement,
  ATTACK_KINDS,
  HEALTH_STYLES,
  LEVEL_DIRECTIONS,
  SCREEN_TILES,
  type LevelDirection,
  type AttackConfig,
  type AttackKind,
  type HealthStyle,
  LIMITS,
  PROJECT_FORMAT,
  PROJECT_SCHEMA_VERSION,
  SPRITE_SIZES,
  BATTLE_STYLES,
  ENEMY_MOVES,
  LEGACY_TILE,
  TILE,
  numberObjects,
  WIN_RULES,
  type BattleStyle,
  type EnemyMoves,
  type LevelObject,
  type ObjectKind,
  type EnemyType,
  type Rule,
  type GameMode,
  type Level,
  type LevelConfig,
  type Project,
  type ProjectDocument,
  type Sprite,
  type SpriteSize,
  type WinRule,
} from './project';

export type ParseResult =
  | { ok: true; project: Project; /** True when an older format was upgraded. */ migrated: boolean }
  | { ok: false; errors: string[] };

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Serialises a project as a portable, pretty-printed JSON document. */
export function serializeProject(project: Project, now: Date = new Date()): string {
  const doc: ProjectDocument = {
    format: PROJECT_FORMAT,
    version: PROJECT_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    project,
  };
  return JSON.stringify(doc, null, 2);
}

/**
 * Parses anything that might be a CurioSprite project: a JSON string, a
 * document envelope, a bare stored project, or a legacy v0.1 project.
 * Never throws; invalid data is reported through `errors`.
 */
export function parseProject(input: unknown): ParseResult {
  let data = input;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return { ok: false, errors: ['File is not valid JSON'] };
    }
  }
  if (!isObj(data)) return { ok: false, errors: ['Project data must be an object'] };

  // Document envelope: { format, version, project }
  if ('format' in data) {
    if (data.format !== PROJECT_FORMAT) return { ok: false, errors: ['Not a CurioSprite project'] };
    const version = data.version;
    if (typeof version !== 'number') return { ok: false, errors: ['Missing project version'] };
    if (version > PROJECT_SCHEMA_VERSION) {
      return { ok: false, errors: [`Made with a newer CurioSprite (format v${version})`] };
    }
    if (version === 1) return migrateLegacyProject(data.project);
    return finish(validateProject(data.project), false);
  }

  if ('schemaVersion' in data) {
    const v = data.schemaVersion;
    if (typeof v === 'number' && v > PROJECT_SCHEMA_VERSION) {
      return { ok: false, errors: [`Made with a newer CurioSprite (format v${v})`] };
    }
    return finish(validateProject(data), false);
  }

  // CurioSprite 0.1 stored bare projects without a version.
  if (Array.isArray(data.sprites) && typeof data.name === 'string') return migrateLegacyProject(data);

  return { ok: false, errors: ['Unrecognised project data'] };
}

function finish(result: { project?: Project; errors: string[] }, migrated: boolean): ParseResult {
  return result.project && result.errors.length === 0
    ? { ok: true, project: result.project, migrated }
    : { ok: false, errors: result.errors.length ? result.errors : ['Invalid project'] };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function str(v: unknown, path: string, errors: string[], opts: { min?: number; max?: number } = {}): string {
  if (typeof v !== 'string') {
    errors.push(`${path} must be text`);
    return '';
  }
  if (opts.min !== undefined && v.trim().length < opts.min) errors.push(`${path} is empty`);
  if (opts.max !== undefined && v.length > opts.max) errors.push(`${path} is too long`);
  return v;
}

function num(v: unknown, path: string, errors: string[], range?: { min: number; max: number }): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    errors.push(`${path} must be a number`);
    return 0;
  }
  if (range && (v < range.min || v > range.max)) errors.push(`${path} must be between ${range.min} and ${range.max}`);
  return v;
}

function isoDate(v: unknown, path: string, errors: string[]): string {
  const s = str(v, path, errors);
  if (s && Number.isNaN(Date.parse(s))) errors.push(`${path} is not a valid date`);
  return s;
}

function validateSprite(raw: unknown, path: string, paletteSize: number, errors: string[]): Sprite | null {
  if (!isObj(raw)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  const before = errors.length;
  const id = str(raw.id, `${path}.id`, errors, { min: 1 });
  const name = str(raw.name, `${path}.name`, errors, { max: LIMITS.nameMaxLength });
  const width = raw.width as SpriteSize;
  const height = raw.height as SpriteSize;
  if (!SPRITE_SIZES.includes(width) || !SPRITE_SIZES.includes(height) || width !== height) {
    errors.push(`${path} must be 16×16 or 32×32`);
  }
  const pixels = raw.pixels;
  if (!Array.isArray(pixels) || pixels.length !== width * height) {
    errors.push(`${path}.pixels has the wrong length`);
  } else if (!pixels.every((p) => Number.isInteger(p) && p >= 0 && p <= paletteSize)) {
    errors.push(`${path}.pixels contains invalid colours`);
  }
  // Animation frames were added later; a missing list means "not animated".
  const frames = raw.frames;
  const goodFrame = (f: unknown) => Array.isArray(f) && f.length === width * height && f.every((p) => Number.isInteger(p) && p >= 0 && p <= paletteSize);
  if (frames !== undefined && (!Array.isArray(frames) || frames.length > LIMITS.framesMax - 1 || !frames.every(goodFrame))) {
    errors.push(`${path}.frames are not valid`);
  }
  // Back and side views came later still: each a list of 1 to framesMax frames.
  for (const view of ['back', 'side'] as const) {
    const v = raw[view];
    if (v !== undefined && (!Array.isArray(v) || v.length < 1 || v.length > LIMITS.framesMax || !v.every(goodFrame))) {
      errors.push(`${path}.${view} is not valid`);
    }
  }
  if (errors.length > before) return null;
  const sprite: Sprite = { id, name, width, height, pixels: [...(pixels as number[])] };
  if (Array.isArray(frames) && frames.length > 0) sprite.frames = (frames as number[][]).map((f) => [...f]);
  for (const view of ['back', 'side'] as const) {
    if (Array.isArray(raw[view])) sprite[view] = (raw[view] as number[][]).map((f) => [...f]);
  }
  return sprite;
}

function validateLevel(raw: unknown, path: string, spriteIds: Set<string>, errors: string[], goalFallback: string | null): LevelConfig | null {
  if (!isObj(raw)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  const before = errors.length;
  const width = num(raw.width, `${path}.width`, errors, LIMITS.levelWidth);
  const height = num(raw.height, `${path}.height`, errors, LIMITS.levelHeight);
  const tileSize = num(raw.tileSize, `${path}.tileSize`, errors, { min: 8, max: 64 });
  const background = str(raw.background, `${path}.background`, errors);
  if (background && !HEX_COLOR.test(background)) errors.push(`${path}.background must be a hex colour`);
  // Schema v2 kept treasure and goals in the tiles; they are lifted out into objects below.
  const upgrading = raw.objects === undefined;
  const legend = new Set<string>([...Object.values(TILE), ...(upgrading ? Object.values(LEGACY_TILE) : [])]);
  let tiles = raw.tiles;
  if (!Array.isArray(tiles) || tiles.length !== height) {
    errors.push(`${path}.tiles must have one row per level row`);
  } else if (!tiles.every((row) => typeof row === 'string' && row.length === width && [...row].every((c) => legend.has(c)))) {
    errors.push(`${path}.tiles contains an invalid row`);
  }
  const rawObjects = upgrading ? upgradeV2Objects(raw) : raw.objects;
  if (upgrading && Array.isArray(tiles)) {
    tiles = tiles.map((row) => (typeof row === 'string' ? row.replace(/[*G]/g, TILE.empty) : row));
  }
  const start = raw.playerStart;
  let playerStart = { x: 0, y: 0 };
  if (!isObj(start)) {
    errors.push(`${path}.playerStart must be an object`);
  } else {
    playerStart = {
      x: num(start.x, `${path}.playerStart.x`, errors, { min: 0, max: Math.max(0, width - 1) }),
      y: num(start.y, `${path}.playerStart.y`, errors, { min: 0, max: Math.max(0, height - 1) }),
    };
  }
  const solidSpriteId = str(raw.solidSpriteId, `${path}.solidSpriteId`, errors);
  const collectibleSpriteId = str(raw.collectibleSpriteId, `${path}.collectibleSpriteId`, errors);
  if (!spriteIds.has(solidSpriteId)) errors.push(`${path}.solidSpriteId refers to a missing sprite`);
  if (!spriteIds.has(collectibleSpriteId)) errors.push(`${path}.collectibleSpriteId refers to a missing sprite`);
  const goalSpriteId = raw.goalSpriteId === undefined && goalFallback ? goalFallback : str(raw.goalSpriteId, `${path}.goalSpriteId`, errors);
  if (!spriteIds.has(goalSpriteId)) errors.push(`${path}.goalSpriteId refers to a missing sprite`);
  const id = str(raw.id, `${path}.id`, errors, { min: 1 });
  const name = str(raw.name, `${path}.name`, errors, { max: LIMITS.nameMaxLength });
  const objects: LevelObject[] = [];
  if (!Array.isArray(rawObjects) || rawObjects.length > width * height) {
    errors.push(`${path}.objects must be a list`);
  } else {
    const taken = new Set<string>();
    const ids = new Set<string>();
    rawObjects.forEach((o, i) => {
      const at = `${path}.objects[${i}]`;
      if (!isObj(o) || typeof o.id !== 'string' || !o.id || ids.has(o.id)) {
        errors.push(`${at} needs its own id`);
        return;
      }
      ids.add(o.id);
      const kind = o.kind as ObjectKind;
      if (kind !== 'sprite' && kind !== 'treasure' && kind !== 'goal') errors.push(`${at}.kind is unknown`);
      if (kind === 'sprite' && (typeof o.spriteId !== 'string' || !spriteIds.has(o.spriteId))) errors.push(`${at} refers to a missing sprite`);
      const x = o.x as number;
      const y = o.y as number;
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) {
        errors.push(`${at} is outside the level`);
        return;
      }
      if (taken.has(`${x},${y}`)) errors.push(`${at} shares a square with another object`);
      taken.add(`${x},${y}`);
      if (o.name !== undefined && (typeof o.name !== 'string' || !o.name.trim() || o.name.length > LIMITS.nameMaxLength)) errors.push(`${at}.name is not valid`);
      if (o.moves !== undefined && !ENEMY_MOVES.includes(o.moves as EnemyMoves)) errors.push(`${at}.moves is unknown`);
      if (o.n !== undefined && (!Number.isInteger(o.n) || (o.n as number) < 1)) errors.push(`${at}.n is not valid`);
      if (o.hp !== undefined && (!Number.isInteger(o.hp) || (o.hp as number) < LIMITS.enemyHp.min || (o.hp as number) > LIMITS.enemyHp.max)) errors.push(`${at}.hp is not valid`);
      const obj: LevelObject = { id: o.id, kind, x, y };
      if (kind === 'sprite') obj.spriteId = o.spriteId as string;
      if (typeof o.name === 'string') obj.name = o.name.trim();
      if (o.moves !== undefined) obj.moves = o.moves as EnemyMoves;
      if (o.hp !== undefined) obj.hp = o.hp as number;
      if (o.n !== undefined) obj.n = o.n as number;
      objects.push(obj);
    });
  }
  const rawPassThrough = raw.passThroughSpriteIds ?? [];
  if (!Array.isArray(rawPassThrough) || !rawPassThrough.every((id) => typeof id === 'string' && spriteIds.has(id))) {
    errors.push(`${path}.passThroughSpriteIds refers to a missing sprite`);
  }
  // Added with battles: a missing list means "no enemies".
  const enemies: EnemyType[] = [];
  const rawEnemies = raw.enemies ?? [];
  if (!Array.isArray(rawEnemies)) {
    errors.push(`${path}.enemies must be a list`);
  } else {
    rawEnemies.forEach((e, i) => {
      if (!isObj(e) || typeof e.spriteId !== 'string' || !spriteIds.has(e.spriteId)) {
        errors.push(`${path}.enemies[${i}] refers to a missing sprite`);
      } else if (!Number.isInteger(e.hp) || (e.hp as number) < LIMITS.enemyHp.min || (e.hp as number) > LIMITS.enemyHp.max) {
        errors.push(`${path}.enemies[${i}].hp must be ${LIMITS.enemyHp.min}–${LIMITS.enemyHp.max}`);
      } else if (!ENEMY_MOVES.includes(e.moves as EnemyType['moves'])) {
        errors.push(`${path}.enemies[${i}].moves is unknown`);
      } else if (!enemies.some((x) => x.spriteId === e.spriteId)) {
        enemies.push({ spriteId: e.spriteId, hp: e.hp as number, moves: e.moves as EnemyType['moves'] });
      }
    });
  }
  const enemyIds = new Set(enemies.map((e) => e.spriteId));
  // The floor came later still: no floor means a bare one.
  const floorTypes: FloorType[] = [];
  const rawFloorTypes = raw.floorTypes ?? [];
  if (!Array.isArray(rawFloorTypes) || rawFloorTypes.length > FLOOR_KEYS.length) {
    errors.push(`${path}.floorTypes must be a list of up to ${FLOOR_KEYS.length}`);
  } else {
    rawFloorTypes.forEach((f, i) => {
      if (!isObj(f) || typeof f.spriteId !== 'string' || !spriteIds.has(f.spriteId)) errors.push(`${path}.floorTypes[${i}] refers to a missing sprite`);
      else if (!FLOOR_KINDS.includes(f.kind as FloorKind)) errors.push(`${path}.floorTypes[${i}].kind is unknown`);
      else if (floorTypes.some((x) => x.spriteId === f.spriteId)) errors.push(`${path}.floorTypes[${i}] repeats a sprite`);
      else floorTypes.push({ spriteId: f.spriteId, kind: f.kind as FloorKind });
    });
  }
  const floorLetters = new Set([NO_FLOOR, ...FLOOR_KEYS.slice(0, floorTypes.length)]);
  const rawFloor = raw.floor ?? Array.from({ length: height }, () => NO_FLOOR.repeat(width));
  if (!Array.isArray(rawFloor) || rawFloor.length !== height || !rawFloor.every((row) => typeof row === 'string' && row.length === width && [...row].every((c) => floorLetters.has(c)))) {
    errors.push(`${path}.floor does not match the level`);
  }
  if (errors.length > before) return null;
  return {
    id,
    name,
    width,
    height,
    tileSize,
    background,
    tiles: [...(tiles as string[])],
    playerStart,
    solidSpriteId,
    collectibleSpriteId,
    goalSpriteId,
    // Older objects get their numbers now, so their names stay put from here on.
    objects: numberObjects(objects),
    // A sprite is either an enemy or walk-through, never both.
    passThroughSpriteIds: [...new Set(rawPassThrough as string[])].filter((id) => !enemyIds.has(id)),
    enemies,
    floor: [...(rawFloor as string[])],
    floorTypes,
  };
}

/** Strictly validates a project object (schema v4; v2 and v3 are upgraded as they are read). */
export function validateProject(raw: unknown): { project?: Project; errors: string[] } {
  const errors: string[] = [];
  if (!isObj(raw)) return { errors: ['project must be an object'] };
  // Versions 2 and 3 are upgraded as they are read: v2 objects (see upgradeV2Objects), v3's single level.
  if (raw.schemaVersion !== PROJECT_SCHEMA_VERSION && raw.schemaVersion !== 2 && raw.schemaVersion !== 3) errors.push(`schemaVersion must be ${PROJECT_SCHEMA_VERSION}`);
  // Before levels, a game had one `level`, and its view and win rule were game settings.
  const oneLevel = raw.levels === undefined;
  const rawLevels: unknown[] = oneLevel ? [raw.level] : Array.isArray(raw.levels) ? raw.levels : [];
  if (!oneLevel && (!Array.isArray(raw.levels) || raw.levels.length === 0 || raw.levels.length > LIMITS.levelsMax)) {
    errors.push(`levels must be a list of 1–${LIMITS.levelsMax}`);
  }

  const id = str(raw.id, 'id', errors, { min: 1 });
  const revision = num(raw.revision, 'revision', errors, { min: 0, max: Number.MAX_SAFE_INTEGER });

  const metaRaw = isObj(raw.meta) ? raw.meta : (errors.push('meta must be an object'), {} as Obj);
  const meta = {
    name: str(metaRaw.name, 'meta.name', errors, { min: 1, max: LIMITS.nameMaxLength }),
    description: str(metaRaw.description ?? '', 'meta.description', errors, { max: LIMITS.descriptionMaxLength }),
    createdAt: isoDate(metaRaw.createdAt, 'meta.createdAt', errors),
    updatedAt: isoDate(metaRaw.updatedAt, 'meta.updatedAt', errors),
    appVersion: typeof metaRaw.appVersion === 'string' ? metaRaw.appVersion : APP_VERSION,
  };

  const palette = raw.palette;
  let paletteOk = false;
  if (!Array.isArray(palette) || palette.length === 0 || palette.length > LIMITS.paletteMax) {
    errors.push(`palette must contain 1–${LIMITS.paletteMax} colours`);
  } else if (!palette.every((c) => typeof c === 'string' && HEX_COLOR.test(c))) {
    errors.push('palette contains an invalid colour');
  } else {
    paletteOk = true;
  }
  const paletteList = paletteOk ? [...(palette as string[])] : [];

  const sprites: Sprite[] = [];
  if (!Array.isArray(raw.sprites) || raw.sprites.length === 0 || raw.sprites.length > LIMITS.spritesMax) {
    errors.push('sprites must be a non-empty list');
  } else if (paletteOk) {
    raw.sprites.forEach((s, i) => {
      const sprite = validateSprite(s, `sprites[${i}]`, paletteList.length, errors);
      if (sprite) sprites.push(sprite);
    });
  }
  const spriteIds = new Set(sprites.map((s) => s.id));
  if (spriteIds.size !== sprites.length) errors.push('sprite ids must be unique');

  const playerRaw = isObj(raw.player) ? raw.player : (errors.push('player must be an object'), {} as Obj);
  const player = {
    spriteId: str(playerRaw.spriteId, 'player.spriteId', errors),
    speed: num(playerRaw.speed, 'player.speed', errors, LIMITS.speed),
    jumpStrength: num(playerRaw.jumpStrength, 'player.jumpStrength', errors, LIMITS.jumpStrength),
    // Added with battles.
    hearts: num(playerRaw.hearts ?? 3, 'player.hearts', errors, LIMITS.hearts),
  };
  // Added with health bars and shields.
  let health: HealthStyle | undefined;
  if (playerRaw.health !== undefined) {
    if (HEALTH_STYLES.includes(playerRaw.health as HealthStyle)) health = playerRaw.health as HealthStyle;
    else errors.push('player.health is unknown');
  }
  if (playerRaw.shield !== undefined && typeof playerRaw.shield !== 'boolean') errors.push('player.shield must be true or false');
  const shield = playerRaw.shield === true;
  // Only a convenience for the hero maker: kept if valid, otherwise quietly dropped.
  const look = readLook(playerRaw.look);
  if (sprites.length && !spriteIds.has(player.spriteId)) errors.push('player.spriteId refers to a missing sprite');

  // Games made before goals existed get the starter Flag sprite (with a stable id, so
  // reopening an unsaved upgrade doesn't make a new one each time).
  let goalFallback: string | null = null;
  const firstRaw = rawLevels[0];
  if (oneLevel && isObj(firstRaw) && firstRaw.goalSpriteId === undefined && sprites.length && paletteOk) {
    if (sprites.length < LIMITS.spritesMax) {
      let flagId = 'starter-flag';
      while (spriteIds.has(flagId)) flagId += '-1';
      sprites.push({ ...createFlagSprite(), id: flagId });
      spriteIds.add(flagId);
      goalFallback = flagId;
    } else {
      goalFallback = typeof firstRaw.collectibleSpriteId === 'string' ? firstRaw.collectibleSpriteId : null;
    }
  }

  // Attacks got pictures later: older games get the starter sword (stable id, as above).
  let attack: AttackConfig | undefined;
  if (playerRaw.attack !== undefined) {
    const a = isObj(playerRaw.attack) ? playerRaw.attack : {};
    if (typeof a.spriteId !== 'string' || !spriteIds.has(a.spriteId)) errors.push('player.attack refers to a missing sprite');
    else if (!ATTACK_KINDS.includes(a.kind as AttackKind)) errors.push('player.attack.kind is unknown');
    else attack = { spriteId: a.spriteId, kind: a.kind as AttackKind };
  } else if (sprites.length && paletteOk && sprites.length < LIMITS.spritesMax) {
    let swordId = 'starter-attack';
    while (spriteIds.has(swordId)) swordId += '-1';
    sprites.push({ ...createAttackSprite('sword'), id: swordId });
    spriteIds.add(swordId);
    attack = { spriteId: swordId, kind: 'swing' };
  }

  const settingsRaw = isObj(raw.settings) ? raw.settings : (errors.push('settings must be an object'), {} as Obj);
  const battle = (settingsRaw.battle ?? 'action') as BattleStyle;
  if (!BATTLE_STYLES.includes(battle)) errors.push('settings.battle is unknown');
  const settings = { gravity: num(settingsRaw.gravity, 'settings.gravity', errors, LIMITS.gravity), battle };

  // Each level, with how it plays (older games kept that in their settings).
  const levels: Level[] = [];
  rawLevels.forEach((rawLevel, i) => {
    const path = oneLevel ? 'level' : `levels[${i}]`;
    const level = validateLevel(rawLevel, path, spriteIds, errors, i === 0 ? goalFallback : null);
    const play = (oneLevel ? settingsRaw : isObj(rawLevel) ? rawLevel : {}) as Obj;
    const where = oneLevel ? 'settings' : path;
    const mode = play.mode as GameMode;
    if (!GAME_MODES.includes(mode)) errors.push(`${where}.mode is unknown`);
    // Before win rules existed, every game was won by collecting all the coins.
    const winRule = (play.winRule ?? 'coins') as WinRule;
    if (!WIN_RULES.includes(winRule)) errors.push(`${where}.winRule is unknown`);
    // Added with climbing levels; older ones go up if they are a tall, one-screen-wide tower.
    const tower = isObj(rawLevel) && Number(rawLevel.height) > SCREEN_TILES.height && Number(rawLevel.width) <= SCREEN_TILES.width;
    const direction = (play.direction ?? (tower ? 'up' : 'across')) as LevelDirection;
    if (!LEVEL_DIRECTIONS.includes(direction)) errors.push(`${where}.direction is unknown`);
    // Square-by-square movement came later: older levels glide.
    const movement = (play.movement ?? 'free') as Movement;
    if (!MOVEMENTS.includes(movement)) errors.push(`${where}.movement is unknown`);
    if (level) levels.push({ ...level, mode, movement, direction, winRule });
  });
  const levelIds = new Set(levels.map((l) => l.id));
  if (levelIds.size !== levels.length) errors.push('level ids must be unique');

  let rules = validateRules(raw.rules ?? [], spriteIds, levelIds, errors);
  // A one-level game's rules about placed objects belong to that level; the rest work in every level.
  if (oneLevel && levels[0]) rules = rules.map((r) => (aboutObject(r) ? { ...r, levelId: levels[0].id } : r));

  if (errors.length || levels.length === 0) return { errors };
  return {
    errors,
    project: {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      id,
      revision,
      meta,
      palette: paletteList,
      sprites,
      player: { ...player, ...(health ? { health } : {}), ...(shield ? { shield } : {}), ...(look ? { look } : {}), ...(attack ? { attack } : {}) },
      levels,
      settings,
      rules,
    },
  };
}

/**
 * Schema v2 → v3: placed sprites ("decorations") and the treasure / goal tile
 * letters become objects. Ids come from the square, so loading the same old
 * game twice gives the same ids.
 */
function upgradeV2Objects(raw: Obj): unknown[] {
  const objects: unknown[] = [];
  if (Array.isArray(raw.tiles)) {
    raw.tiles.forEach((row, y) => {
      if (typeof row !== 'string') return;
      [...row].forEach((c, x) => {
        if (c === LEGACY_TILE.collectible) objects.push({ id: `o-${x}-${y}`, kind: 'treasure', x, y });
        else if (c === LEGACY_TILE.goal) objects.push({ id: `o-${x}-${y}`, kind: 'goal', x, y });
      });
    });
  }
  const decorations = raw.decorations ?? [];
  if (!Array.isArray(decorations)) return [null];
  for (const d of decorations) objects.push(isObj(d) ? { id: `o-${d.x}-${d.y}`, kind: 'sprite', spriteId: d.spriteId, x: d.x, y: d.y } : d);
  return objects;
}

const COUNTS = new Set(['each', 'all']);

/** Rules were added later, so a missing list means "no rules". */
const aboutObject = (r: Rule): boolean => ('objectId' in r.when && !!r.when.objectId) || ('objectId' in r.then && !!r.then.objectId);

function validateRules(raw: unknown, spriteIds: Set<string>, levelIds: Set<string>, errors: string[]): Rule[] {
  if (!Array.isArray(raw) || raw.length > LIMITS.rulesMax) {
    errors.push(`rules must be a list of up to ${LIMITS.rulesMax}`);
    return [];
  }
  const rules: Rule[] = [];
  raw.forEach((r, i) => {
    const path = `rules[${i}]`;
    if (!isObj(r) || typeof r.id !== 'string' || !r.id || !isObj(r.when) || !isObj(r.then)) {
      errors.push(`${path} is not a rule`);
      return;
    }
    const w = r.when;
    const t = r.then;
    const sprite = (id: unknown) => typeof id === 'string' && spriteIds.has(id);
    // Rules may name an object that has since been removed from the level; they just never fire.
    const optObject = (id: unknown) => id === undefined || (typeof id === 'string' && id.length > 0);
    const oneTarget = (x: Obj) => (x.spriteId === undefined) !== (x.objectId === undefined) && (x.spriteId === undefined ? optObject(x.objectId) : sprite(x.spriteId));
    const countOk = (c: unknown) => (typeof c === 'string' && COUNTS.has(c)) || (Number.isInteger(c) && (c as number) >= 1 && (c as number) <= 999);
    const whenOk =
      w.on === 'start' ||
      w.on === 'goalOpen' ||
      w.on === 'hurt' ||
      (w.on === 'collect' && countOk(w.count) && optObject(w.objectId)) ||
      (w.on === 'beat' && (w.count === 'each' || w.count === 'all') && (w.spriteId === undefined || sprite(w.spriteId)) && optObject(w.objectId)) ||
      ((w.on === 'touch' || w.on === 'hit' || w.on === 'talk') && oneTarget(w));
    const thenOk =
      t.do === 'openGoal' ||
      t.do === 'heal' ||
      t.do === 'win' ||
      (t.do === 'message' && typeof t.text === 'string' && t.text.trim().length > 0 && t.text.length <= LIMITS.messageMaxLength) ||
      ((t.do === 'hide' || t.do === 'show') && oneTarget(t)) ||
      (t.do === 'goLevel' && typeof t.levelId === 'string' && levelIds.has(t.levelId));
    const levelOk = r.levelId === undefined || (typeof r.levelId === 'string' && levelIds.has(r.levelId));
    if (!whenOk) errors.push(`${path}.when is not valid`);
    if (!thenOk) errors.push(`${path}.then is not valid`);
    if (!levelOk) errors.push(`${path} refers to a missing level`);
    if (whenOk && thenOk && levelOk) rules.push(JSON.parse(JSON.stringify({ id: r.id, when: w, then: t, levelId: r.levelId })) as Rule);
  });
  return rules;
}

// ---------------------------------------------------------------------------
// Legacy (CurioSprite 0.1) migration
// ---------------------------------------------------------------------------

function normaliseLegacyColor(c: unknown): string | null {
  if (typeof c !== 'string') return null;
  const s = c.trim().toLowerCase();
  if (s === 'transparent' || /^#[0-9a-f]{6}00$/.test(s)) return null;
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(s)) return s.slice(0, 7);
  return null;
}

/** Upgrades a 0.1 project (`{ id, name, sprites: [{ pixels: string[] }] }`) to v2. */
export function migrateLegacyProject(raw: unknown): ParseResult {
  if (!isObj(raw) || typeof raw.name !== 'string' || !Array.isArray(raw.sprites)) {
    return { ok: false, errors: ['Legacy project is missing its name or sprites'] };
  }
  const created = typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? new Date(raw.createdAt) : new Date();
  const name = raw.name.trim().slice(0, LIMITS.nameMaxLength) || 'Imported Game';
  const project = createProject(name, Number.isNaN(created.getTime()) ? new Date() : created);
  if (typeof raw.id === 'string' && raw.id.length > 0) project.id = raw.id;

  const colorIndex = (hex: string): number => {
    const existing = project.palette.indexOf(hex);
    if (existing >= 0) return existing + 1;
    if (project.palette.length < LIMITS.paletteMax) {
      project.palette.push(hex);
      return project.palette.length;
    }
    return 1;
  };

  const migrated: Sprite[] = [];
  for (const s of raw.sprites) {
    if (!isObj(s) || !Array.isArray(s.pixels) || s.pixels.length !== 256) continue;
    const pixels = s.pixels.map((c) => {
      const hex = normaliseLegacyColor(c);
      return hex ? colorIndex(hex) : 0;
    });
    const spriteName = typeof s.name === 'string' && s.name.trim() ? s.name.slice(0, LIMITS.nameMaxLength) : 'Sprite';
    migrated.push({ ...createSprite(spriteName, 16, pixels), id: createId() });
  }
  if (migrated.length === 0) return { ok: false, errors: ['Legacy project has no readable sprites'] };

  // The first legacy sprite becomes the hero; extra ones are kept alongside.
  const [hero, ...rest] = migrated;
  project.sprites = [hero, ...project.sprites.slice(1), ...rest].slice(0, LIMITS.spritesMax);
  project.player.spriteId = hero.id;
  return finish(validateProject(project), true);
}

/** Returns a deep copy with a fresh ID, suitable for "save as copy" or import. */
export function duplicateProject(project: Project, name: string, now: Date = new Date()): Project {
  const copy = structuredCloneProject(project);
  const ts = now.toISOString();
  return {
    ...copy,
    id: createId(),
    revision: 0,
    meta: { ...copy.meta, name: name.trim().slice(0, LIMITS.nameMaxLength) || copy.meta.name, createdAt: ts, updatedAt: ts },
  };
}

export function structuredCloneProject(project: Project): Project {
  return JSON.parse(JSON.stringify(project)) as Project;
}
