/**
 * CurioSprite project schema (version 2).
 *
 * This module is deliberately free of React and browser APIs so the same
 * format can be read by future tools (a `.curio` packager, a native runtime,
 * a web gallery…).
 *
 * Pixel encoding: each sprite stores `width * height` integers, row-major.
 * `0` is transparent; any other value `n` refers to `palette[n - 1]`.
 */

import type { HeroLook } from './heroMaker';

export const PROJECT_FORMAT = 'curiosprite-project';
export const PROJECT_SCHEMA_VERSION = 4;
export const APP_VERSION = '0.2.0';

export const SPRITE_SIZES = [16, 32] as const;
export type SpriteSize = (typeof SPRITE_SIZES)[number];

export const TRANSPARENT = 0;

export interface SpriteImage {
  width: SpriteSize;
  height: SpriteSize;
  /** Row-major palette indices; 0 = transparent, n = palette[n - 1]. */
  pixels: number[];
}

/**
 * A picture that may be animated: `pixels` is the first frame (the one shown
 * when standing still), `frames` the rest, each the same size.
 *
 * That is the sprite seen from the front. It can also have a `back` view
 * (walking up, in top-down games) and a `side` view (facing right; it is
 * mirrored for left, and used for everything in side-view games). Each is a
 * list of frames, the first one standing still. Without them the front is used.
 */
export interface AnimatedImage extends SpriteImage {
  frames?: number[][];
  back?: number[][];
  side?: number[][];
}

/** Which way a sprite is seen. */
export const FACINGS = ['front', 'back', 'side'] as const;
export type Facing = (typeof FACINGS)[number];

export interface Sprite extends AnimatedImage {
  id: string;
  name: string;
}

export interface ProjectMeta {
  name: string;
  description: string;
  /** ISO-8601 timestamps. */
  createdAt: string;
  updatedAt: string;
  /** Version of CurioSprite that last wrote the project. */
  appVersion: string;
}

export interface PlayerConfig {
  spriteId: string;
  /** Walking speed in world pixels per second. */
  speed: number;
  /** Initial jump velocity in world pixels per second (platformer mode). */
  jumpStrength: number;
  /** Hits the player can take before the game is lost. With a health bar, how big the bar is (each heart's worth of points). */
  hearts: number;
  /** Health shown as hearts (each hit takes one), or a bar (small hits take less). Hearts when missing. */
  health?: HealthStyle;
  /** A shield takes hits first, and fills up again after a while without being hit. */
  shield?: boolean;
  /** The choices last used in "Make your hero", so it can carry on from them. */
  look?: HeroLook;
  /** What the attack looks like and how it works (games without one show a plain swipe). */
  attack?: AttackConfig;
}

export const HEALTH_STYLES = ['hearts', 'bar'] as const;
export type HealthStyle = (typeof HEALTH_STYLES)[number];

/** Swing hits right in front of the hero; throw sends the picture flying until it hits something. */
export const ATTACK_KINDS = ['swing', 'throw'] as const;
export type AttackKind = (typeof ATTACK_KINDS)[number];

export interface AttackConfig {
  /** The attack's picture, drawn pointing right (it is turned to face the way the hero attacks). */
  spriteId: string;
  kind: AttackKind;
}

/**
 * Level terrain is stored as text rows for readability and easy hand-editing:
 * `.` empty, `#` a Block. Everything else in a level is an object.
 */
export const TILE = {
  empty: '.',
  solid: '#',
} as const;
export type TileChar = (typeof TILE)[keyof typeof TILE];

/** Tile letters used by schema v2 for treasure and goals (now objects); read when upgrading. */
export const LEGACY_TILE = { collectible: '*', goal: 'G' } as const;

/** Objects that look the same (same kind and sprite) share a numbering: Slime 1, Slime 2… */
export const objectGroup = (o: Pick<LevelObject, 'kind' | 'spriteId'>): string => (o.kind === 'sprite' ? `sprite:${o.spriteId}` : o.kind);

/** Gives numbers to objects that don't have one yet, after the highest in their group. */
export function numberObjects(objects: LevelObject[]): LevelObject[] {
  const highest = new Map<string, number>();
  for (const o of objects) if (o.n) highest.set(objectGroup(o), Math.max(highest.get(objectGroup(o)) ?? 0, o.n));
  if (objects.every((o) => o.n)) return objects;
  return objects.map((o) => {
    if (o.n) return o;
    const n = (highest.get(objectGroup(o)) ?? 0) + 1;
    highest.set(objectGroup(o), n);
    return { ...o, n };
  });
}

/**
 * - `sprite`: one of your sprites (solid, walk-through or an enemy, as its sprite says)
 * - `treasure`: something to collect, drawn with the Treasure sprite
 * - `goal`: touch it to finish (see `WinRule`), drawn with the Goal sprite
 */
export type ObjectKind = 'sprite' | 'treasure' | 'goal';

/**
 * One thing placed in the level. A sprite is only the picture and the traits
 * every copy shares; each placed object is its own thing, with its own id
 * (for rules), optional name, and optional enemy settings of its own.
 */
export interface LevelObject {
  id: string;
  kind: ObjectKind;
  /** The sprite it is drawn with (`sprite` objects only). */
  spriteId?: string;
  /** Tile coordinates. At most one object per square, and never on a Block. */
  x: number;
  y: number;
  /** Its own name; otherwise it is called by its number, e.g. "Slime 2". */
  name?: string;
  /** Its number among objects that look the same. Given when placed and kept, so "Door 2" stays Door 2 when others are removed. */
  n?: number;
  /** Enemy settings for this one only, instead of its sprite's. */
  moves?: EnemyMoves;
  hp?: number;
}

export const ENEMY_MOVES = ['still', 'wander', 'patrol', 'chase'] as const;
export type EnemyMoves = (typeof ENEMY_MOVES)[number];

/** A sprite that acts as an enemy wherever it is placed in the level. */
export interface EnemyType {
  spriteId: string;
  /** Hits needed to beat it. */
  hp: number;
  moves: EnemyMoves;
}

/** The game window: 25 × 15 tiles of 16 px = 400 × 240 world px, shown at 2× on an 800 × 480 screen. */
export const SCREEN_TILES = { width: 25, height: 15 } as const;

/**
 * What a sprite painted on the floor is: `ground` to walk on (grass, paths,
 * wooden boards), `water` that can't be walked on, and `grass`, tall grass
 * where wild creatures jump out (top-down levels).
 */
export const FLOOR_KINDS = ['ground', 'water', 'grass'] as const;
export type FloorKind = (typeof FLOOR_KINDS)[number];

export interface FloorType {
  spriteId: string;
  kind: FloorKind;
}

/** Letters in `floor` rows: the n-th letter is floorTypes[n]; '.' is bare. */
export const FLOOR_KEYS = '0123456789abcdefghijklmnopqrstuvwxyz';
export const NO_FLOOR = '.';

export interface LevelConfig {
  id: string;
  name: string;
  /** Size in tiles. */
  width: number;
  height: number;
  /** Size of one tile in world pixels. */
  tileSize: number;
  /** CSS hex colour of the sky / floor. */
  background: string;
  tiles: string[];
  playerStart: { x: number; y: number };
  /** Sprite drawn for solid tiles. */
  solidSpriteId: string;
  /** Sprite drawn for collectibles. */
  collectibleSpriteId: string;
  /** Sprite drawn for goal tiles. */
  goalSpriteId: string;
  /** Everything placed in the level apart from Blocks. */
  objects: LevelObject[];
  /** Sprites the player walks through when placed (clouds, trees…). Everything else placed is solid. */
  passThroughSpriteIds: string[];
  /** Sprites that are enemies when placed (never also walk-through). */
  enemies: EnemyType[];
  /**
   * The floor, under everything else: one row per level row, each letter a
   * floor sprite (see FLOOR_KEYS) or '.' for none (the sky / background shows).
   */
  floor: string[];
  /** Sprites painted on the floor, and what each one is. */
  floorTypes: FloorType[];
}

/**
 * The camera view: `platformer` is side view with gravity, `topdown` looks
 * down from above, and `shooter` is a ship along the bottom shooting up at
 * rows of enemies that march across and down.
 */
export type GameMode = 'platformer' | 'topdown' | 'shooter';
export const GAME_MODES: readonly GameMode[] = ['platformer', 'topdown', 'shooter'];

/** `action`: fight in real time. `turns`: touching an enemy opens a turn-based battle. */
export const BATTLE_STYLES = ['action', 'turns'] as const;
export type BattleStyle = (typeof BATTLE_STYLES)[number];

/**
 * How the game is won:
 * - `coins`: collect every treasure (collectible)
 * - `goal`: touch a goal tile
 * - `coinsThenGoal`: collect every treasure, then touch a goal tile
 * - `enemies`: beat every enemy
 */
export const WIN_RULES = ['coins', 'goal', 'coinsThenGoal', 'enemies'] as const;
export type WinRule = (typeof WIN_RULES)[number];

/** Which way a side-view level grows: screens to the right, or stacked on top (a climb). */
export const LEVEL_DIRECTIONS = ['across', 'up'] as const;
export type LevelDirection = (typeof LEVEL_DIRECTIONS)[number];

/** Settings shared by every level of a game. */
export interface GameSettings {
  /** Downward acceleration in world pixels per second² (side view). */
  gravity: number;
  battle: BattleStyle;
}

/** Top-down movement: `free` glides any way; `grid` steps square by square, like classic adventure games. */
export const MOVEMENTS = ['free', 'grid'] as const;
export type Movement = (typeof MOVEMENTS)[number];

/** How one level plays: each level picks its own view and how it is won. */
export interface LevelPlay {
  mode: GameMode;
  /** Top-down only. */
  movement: Movement;
  /** Side view only: the level goes across or up. Top-down levels can grow both ways. */
  direction: LevelDirection;
  winRule: WinRule;
}

/** One level of a game. */
export interface Level extends LevelConfig, LevelPlay {}

/** Everything that decides how one level plays: the game's settings plus the level's own. */
export interface PlaySettings extends GameSettings, LevelPlay {}

/** What starts a rule. */
export type RuleTrigger =
  | { on: 'start' }
  /** `each`: every time one is collected; a number: when that many are collected; `all`: when the last one is. */
  | { on: 'collect'; count: 'each' | 'all' | number; objectId?: string }
  /** The goal changes from locked to open. */
  | { on: 'goalOpen' }
  /** With `spriteId`: only enemies drawn with that sprite ("when a Slime is beaten"); with `objectId`: that one enemy. */
  | { on: 'beat'; count: 'each' | 'all'; spriteId?: string; objectId?: string }
  /** The player touches any copy of a sprite (`spriteId`) or one object (`objectId`). */
  | { on: 'touch'; spriteId?: string; objectId?: string }
  /** The player's attack hits any copy of a sprite (`spriteId`) or one object (`objectId`). */
  | { on: 'hit'; spriteId?: string; objectId?: string }
  /** The player faces it and presses A: for characters who talk, signs to read… */
  | { on: 'talk'; spriteId?: string; objectId?: string }
  /** The player loses a heart. */
  | { on: 'hurt' };

/** What a rule does. */
export type RuleAction =
  | { do: 'message'; text: string }
  /** Unlocks the goal. Any rule with this action makes the goal start locked. */
  | { do: 'openGoal' }
  /** Every copy of a sprite (`spriteId`), or one object (`objectId`), disappears: doors open, keys are picked up… */
  | { do: 'hide'; spriteId?: string; objectId?: string }
  /** Appears. Any rule with this action makes its target start hidden. */
  | { do: 'show'; spriteId?: string; objectId?: string }
  | { do: 'heal' }
  | { do: 'win' }
  /** Takes the player to another level (a door, a cave entrance, a path to the next area). */
  | { do: 'goLevel'; levelId: string };

/** "When … then …". */
export interface Rule {
  id: string;
  when: RuleTrigger;
  then: RuleAction;
  /** The level it belongs to; without one it applies in every level. Rules about a placed object always belong to its level. */
  levelId?: string;
}

export interface Project {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  id: string;
  /** Incremented by storage on every save; used to detect stale overwrites. */
  revision: number;
  meta: ProjectMeta;
  palette: string[];
  sprites: Sprite[];
  player: PlayerConfig;
  /** Played in order: winning one unlocks the next. */
  levels: Level[];
  settings: GameSettings;
  /** Every level's rules, and the ones for the whole game. */
  rules: Rule[];
}

/**
 * One level of a game, the way the level editor and the game itself see it:
 * the game's sprites and player, that level, its settings, and the rules that
 * apply in it (its own and the whole game's).
 */
export interface LevelProject extends Omit<Project, 'levels' | 'settings'> {
  level: LevelConfig;
  settings: PlaySettings;
  /** Which level this is (0 = the first), and how many there are. */
  levelIndex: number;
  levelCount: number;
  /** Every level's id and name, for rules that go to another level. */
  levelNames: Array<{ id: string; name: string }>;
}

/** Portable envelope used for files (future `.curio` packages wrap this). */
export interface ProjectDocument {
  format: typeof PROJECT_FORMAT;
  version: typeof PROJECT_SCHEMA_VERSION;
  exportedAt: string;
  project: Project;
}

export const LIMITS = {
  nameMaxLength: 40,
  descriptionMaxLength: 280,
  paletteMax: 64,
  spritesMax: 64,
  speed: { min: 30, max: 240 },
  jumpStrength: { min: 120, max: 520 },
  gravity: { min: 200, max: 2000 },
  levelWidth: { min: 8, max: 256 },
  /** Up to 8 screens tall, for climbing games. */
  levelHeight: { min: 6, max: 120 },
  hearts: { min: 1, max: 9 },
  enemyHp: { min: 1, max: 9 },
  /** Rules across the whole game (all levels). */
  rulesMax: 200,
  levelsMax: 20,
  /** Frames of animation per sprite, counting the first. */
  framesMax: 8,
  messageMaxLength: 80,
} as const;
