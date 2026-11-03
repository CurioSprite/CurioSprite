/**
 * Game simulation. Pure logic with no rendering or DOM access, so it can be
 * tested headlessly and reused by other front-ends.
 */
import { FLOOR_KEYS, NO_FLOOR, SCREEN_TILES, TILE, type AttackKind, type Movement, type BattleStyle, type EnemyMoves, type GameMode, type HealthStyle, type LevelProject, type Rule, type WinRule } from '../models/project';
import { goalWaitsForRule, startsHidden } from '../models/rules';
import type { InputFrame } from '../input/InputManager';
import { applyRoles } from '../models/levelRoles';

export const STEP = 1 / 60;

const PLAYER_W = 12;
const PLAYER_H = 15;
const ENEMY_W = 12;
const ENEMY_H = 13;
const MAX_FALL = 600;
const COYOTE_TIME = 0.1;
const JUMP_BUFFER = 0.12;
const DASH_TIME = 0.15;
const DASH_COOLDOWN = 0.5;
const DASH_MULTIPLIER = 3;

const ATTACK_TIME = 0.18;
const ATTACK_COOLDOWN = 0.32;
const ATTACK_REACH = 14;
/** Thrown attacks: how fast they fly, for how long, their size, and how many can be in the air. */
const SHOT_SPEED = 200;
const SHOT_LIFE = 0.9;
const SHOT_SIZE = 10;
const SHOT_COOLDOWN = 0.35;
const SHOTS_MAX = 3;
/** Square-by-square movement: holding B runs this much faster. */
const RUN_MULTIPLIER = 1.8;
/** Chance a wild creature jumps out on each step into tall grass. */
const ENCOUNTER_CHANCE = 0.12;
/**
 * Shooter: the arrows (or joystick) point the way to fly. The ship swings
 * round to face it, and thrusts once it points roughly that way. B brakes.
 * It keeps drifting when you let go, slowing a little. Bumping the bank hard
 * hurts. Enemies on screen fire at it now and then.
 */
const TURN_RATE = 5;
/** The ship only thrusts once it points within this much (radians) of the way it is told to go. */
const THRUST_WITHIN = Math.PI / 2;
const THRUST = 160;
const BRAKE = 2.5;
const DRAG = 0.35;
const FLY_MAX = 130;
/** Bumping land slower than this doesn't hurt. */
const BUMP_HURTS = 60;
/** How far ahead of the ship the screen looks, at top speed. */
const LOOK_AHEAD = 70;
const SHOOTER_SHOT_SPEED = 240;
const BOMB_SPEED = 75;
const BOMB_SIZE = 4;
const BOMBS_MAX = 4;
/** The game window in world pixels. */
const VIEW_W = SCREEN_TILES.width * 16;
const VIEW_H = SCREEN_TILES.height * 16;
/**
 * Health: with hearts every hit takes one. A health bar has this many points
 * for each heart, and small hits (fire, bumps) take less than big ones.
 */
const POINTS_PER_HEART = 20;
type Harm = 'touch' | 'fall' | 'battle' | 'fire' | 'bump';
const DAMAGE: Record<Harm, number> = { touch: 20, fall: 20, battle: 20, fire: 10, bump: 12 };
/** A shield takes hits first: two hits' worth with hearts, or this many points on a bar. */
const SHIELD_HITS = 2;
const SHIELD_POINTS = 40;
/** After this long without being hit the shield fills back up, over this long. */
const SHIELD_WAIT = 3;
const SHIELD_REFILL = 4;
/** How long the shield glows after it stops a hit. */
const SHIELD_FLASH = 0.4;
/** After being hit (or running from a battle) the player can't be hurt for a moment. */
const SAFE_TIME = 1.2;
const KNOCK_TIME = 0.2;
const KNOCK_SPEED = 160;
const ENEMY_HURT_TIME = 0.35;
const ENEMY_SPEED = 32;
const CHASE_SPEED = 46;
const CHASE_RANGE = 7; // tiles
const ENEMY_HIT_CHANCE = 0.6; // turn-based battles
const MESSAGE_TIME = 1.1;
const MESSAGE_MIN = 0.25;
/** How long a rule's message stays on screen. */
export const RULE_MESSAGE_TIME = 3;

export interface Collectible {
  /** The level object it came from. */
  id: string;
  tx: number;
  ty: number;
  collected: boolean;
  hidden: boolean;
  /** Made to disappear by a rule: no longer needed to collect them all. */
  removed: boolean;
}

export interface Goal {
  id: string;
  tx: number;
  ty: number;
  hidden: boolean;
}

/** Anything that moves and collides with the level. */
export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
}

export interface PlayerState extends Body {
  facing: 1 | -1;
  /** Last direction moved, for top-down attacks. */
  face: { x: number; y: number };
  coyote: number;
  jumpBuffer: number;
  dashTime: number;
  dashCooldown: number;
  dashDir: { x: number; y: number };
  attackTime: number;
  attackCooldown: number;
  /** Square-by-square movement: the square being stepped to. */
  step: { tx: number; ty: number } | null;
  /** The square the player was last on (for tall grass in smooth movement). */
  lastTile: { tx: number; ty: number } | null;
  /** Can't be hurt (or start a battle) while above zero. */
  safe: number;
  knock: number;
}

export interface Enemy extends Body {
  /** The level object it came from. */
  id: string;
  spriteId: string;
  name: string;
  moves: EnemyMoves;
  hp: number;
  maxHp: number;
  alive: boolean;
  dir: { x: number; y: number };
  /** Time until a wandering enemy picks a new direction. */
  turnIn: number;
  hurt: number;
  knock: number;
  /** Not in the game right now (waiting for a rule to show it, or removed by one). */
  hidden: boolean;
  /** Made to disappear by a rule: it no longer needs beating. */
  removed: boolean;
  /** Jumped out of tall grass: only here for its battle. */
  wild?: boolean;
}

/** A placed sprite that isn't an enemy: scenery or a solid block. */
export interface Prop {
  id: string;
  spriteId: string;
  x: number;
  y: number;
  /** Blocks the player when visible. */
  solid: boolean;
  hidden: boolean;
}

/** A thrown attack in the air. */
export interface Shot extends Box {
  vx: number;
  vy: number;
  /** The way it flies (one of the four directions), for turning its picture. */
  dir: { x: number; y: number };
  life: number;
  /** Placed sprites it has already passed through (each fires its rule once). */
  hits: Set<string>;
}

/** Something an enemy fired in a shooter, flying at the ship. */
export interface Bomb extends Box {
  vx: number;
  vy: number;
}

/** Shooter: the way the ship points (radians, 0 is up, turning right), whether it is thrusting, and where the screen is (its top left, in world pixels) and looks. */
export interface Flight {
  heading: number;
  thrusting: boolean;
  camX: number;
  camY: number;
  lookX: number;
  lookY: number;
}

export const BATTLE_CHOICES = ['attack', 'defend', 'run'] as const;
export type BattleChoice = (typeof BATTLE_CHOICES)[number];

/** What happens after the current battle message. */
type BattleNext = 'choose' | 'enemyTurn' | 'beaten' | 'end' | 'lose' | 'flee';

export interface Battle {
  enemy: number;
  phase: 'choose' | 'message';
  choice: number;
  message: string;
  /** Seconds the message has been shown. */
  shown: number;
  next: BattleNext;
  defending: boolean;
  powered: boolean;
}

export type GameStatus = 'playing' | 'won' | 'lost';

export interface GameState {
  mode: GameMode;
  battleStyle: BattleStyle;
  tileSize: number;
  cols: number;
  rows: number;
  /** Squares the player collides with: ground tiles plus solid placed sprites. */
  solid: Uint8Array;
  /** Squares drawn with the solid-block sprite. */
  ground: Uint8Array;
  collectibles: Collectible[];
  /** Goal squares; touching one wins, once the rule allows. */
  goals: Goal[];
  enemies: Enemy[];
  props: Prop[];
  rules: Rule[];
  /** A rule's message on screen, and how long it has shown. */
  message: { text: string; shown: number } | null;
  /** Some rule opens the goal; until it does, the goal is locked. */
  goalWaits: boolean;
  goalOpenedByRule: boolean;
  /** For noticing the moment the goal opens. */
  wasGoalOpen: boolean;
  /** Props / enemies the player was touching last step (for "touches" rules). */
  touching: Set<string>;
  /** Placed sprites already hit by the current swing (each is hit once per swing). */
  swingHits: Set<string>;
  /** Swing in front of the hero, or throw. */
  attackKind: AttackKind;
  /** Top-down: glide, or step square by square. */
  movement: Movement;
  /** Tall grass squares (wild creatures jump out). */
  grass: Uint8Array;
  /** The creatures that can jump out of tall grass: the level's enemy sprites. */
  wildTypes: Array<{ spriteId: string; name: string; hp: number }>;
  /** A rule is taking the player to another level (by its id). */
  goTo: string | null;
  /** Lines being said by a character the player talked to; the game waits while they show. */
  dialog: string[];
  /** Set while a "talks to" rule runs, so its messages go in the text box. */
  talking: boolean;
  shots: Shot[];
  /** Shooter: the flight; enemy fire in the air; time until the next shot. */
  flight: Flight;
  bombs: Bomb[];
  bombIn: number;
  wonByRule: boolean;
  winRule: WinRule;
  /** The player is touching a goal that is still locked (coins left first). */
  atLockedGoal: boolean;
  player: PlayerState;
  start: { x: number; y: number };
  speed: number;
  jumpStrength: number;
  gravity: number;
  /** Health left and the most there can be: hearts, or points on a health bar. */
  hearts: number;
  maxHearts: number;
  healthStyle: HealthStyle;
  /** The shield (0 when the game has none): how full, how full it gets, time until it starts filling again, and its glow after stopping a hit. */
  shield: number;
  maxShield: number;
  shieldWait: number;
  shieldHit: number;
  collected: number;
  defeated: number;
  battle: Battle | null;
  status: GameStatus;
  time: number;
  falls: number;
  /** Seeded random numbers, so games replay the same way in tests. */
  seed: number;
}

export function createGame(project: LevelProject): GameState {
  const { player, settings } = project;
  const level = applyRoles(project.level, project.level);
  const ts = level.tileSize;
  const ground = new Uint8Array(level.width * level.height);
  level.tiles.forEach((row, ty) => {
    for (let tx = 0; tx < row.length; tx++) if (row[tx] === TILE.solid) ground[ty * level.width + tx] = 1;
  });
  const hidden = startsHidden(project);
  const collectibles: Collectible[] = [];
  const goals: Goal[] = [];
  // Placed sprites are solid unless marked walk-through; enemies come alive instead.
  const solid = ground.slice();
  const passThrough = new Set(level.passThroughSpriteIds);
  const enemyTypes = new Map(level.enemies.map((e) => [e.spriteId, e]));
  const names = new Map(project.sprites.map((s) => [s.id, s.name]));
  const enemies: Enemy[] = [];
  const props: Prop[] = [];
  for (const d of level.objects) {
    const startsHiddenNow = hidden.objects.has(d.id) || (d.spriteId !== undefined && hidden.sprites.has(d.spriteId));
    if (d.kind === 'treasure') {
      collectibles.push({ id: d.id, tx: d.x, ty: d.y, collected: false, hidden: startsHiddenNow, removed: false });
      continue;
    }
    if (d.kind === 'goal') {
      goals.push({ id: d.id, tx: d.x, ty: d.y, hidden: startsHiddenNow });
      continue;
    }
    const spriteId = d.spriteId!;
    const type = enemyTypes.get(spriteId);
    if (type) {
      // Each enemy may have its own moves / toughness instead of its sprite's.
      const hp = d.hp ?? type.hp;
      enemies.push({
        x: d.x * ts + (ts - ENEMY_W) / 2,
        y: d.y * ts + (ts - ENEMY_H),
        w: ENEMY_W,
        h: ENEMY_H,
        vx: 0,
        vy: 0,
        onGround: false,
        id: d.id,
        spriteId,
        name: d.name ?? names.get(spriteId) ?? 'Enemy',
        moves: d.moves ?? type.moves,
        hp,
        maxHp: hp,
        alive: true,
        dir: { x: enemies.length % 2 ? -1 : 1, y: 0 },
        turnIn: 0,
        hurt: 0,
        knock: 0,
        hidden: startsHiddenNow,
        removed: false,
      });
      continue;
    }
    const prop = { id: d.id, spriteId, x: d.x, y: d.y, solid: !passThrough.has(spriteId), hidden: startsHiddenNow };
    props.push(prop);
    if (prop.solid && !prop.hidden) solid[d.y * level.width + d.x] = 1;
  }
  // The floor: water can't be walked on, and wild creatures live in tall grass (top-down levels).
  const grass = new Uint8Array(level.width * level.height);
  if (settings.mode === 'topdown') {
    level.floor.forEach((row, ty) => {
      for (let tx = 0; tx < row.length; tx++) {
        if (row[tx] === NO_FLOOR) continue;
        const kind = level.floorTypes[FLOOR_KEYS.indexOf(row[tx])]?.kind;
        if (kind === 'water') solid[ty * level.width + tx] = 1;
        if (kind === 'grass') grass[ty * level.width + tx] = 1;
      }
    });
  }
  const start = { x: level.playerStart.x * ts + (ts - PLAYER_W) / 2, y: level.playerStart.y * ts + (ts - PLAYER_H) };
  const s: GameState = {
    mode: settings.mode,
    // Shooters are always played in real time.
    battleStyle: settings.mode === 'shooter' ? 'action' : settings.battle,
    tileSize: ts,
    cols: level.width,
    rows: level.height,
    solid,
    ground,
    collectibles,
    goals,
    enemies,
    props,
    winRule: settings.winRule,
    atLockedGoal: false,
    player: freshPlayer(start),
    start,
    speed: player.speed,
    jumpStrength: player.jumpStrength,
    gravity: settings.gravity,
    hearts: player.health === 'bar' ? player.hearts * POINTS_PER_HEART : player.hearts,
    maxHearts: player.health === 'bar' ? player.hearts * POINTS_PER_HEART : player.hearts,
    healthStyle: player.health ?? 'hearts',
    shield: player.shield ? (player.health === 'bar' ? SHIELD_POINTS : SHIELD_HITS) : 0,
    maxShield: player.shield ? (player.health === 'bar' ? SHIELD_POINTS : SHIELD_HITS) : 0,
    shieldWait: 0,
    shieldHit: 0,
    collected: 0,
    defeated: 0,
    battle: null,
    status: 'playing',
    time: 0,
    falls: 0,
    seed: 12345,
    rules: project.rules,
    message: null,
    goalWaits: goalWaitsForRule(project),
    goalOpenedByRule: false,
    wasGoalOpen: false,
    touching: new Set(),
    swingHits: new Set(),
    attackKind: player.attack?.kind ?? 'swing',
    movement: settings.mode === 'topdown' ? settings.movement : 'free',
    grass,
    wildTypes: level.enemies.map((e) => ({ spriteId: e.spriteId, name: names.get(e.spriteId) ?? 'Creature', hp: e.hp })),
    dialog: [],
    talking: false,
    goTo: null,
    shots: [],
    flight: { heading: 0, thrusting: false, camX: 0, camY: 0, lookX: 0, lookY: 0 },
    bombs: [],
    bombIn: 1.5,
    wonByRule: false,
  };
  s.wasGoalOpen = goalOpen(s);
  if (s.mode === 'shooter') placeCamera(s);
  fire(s, { type: 'start' });
  return s;
}

// ----- Rules ----------------------------------------------------------------------

type GameEvent =
  | { type: 'start' }
  | { type: 'goalOpen' }
  | { type: 'hurt' }
  | { type: 'collect'; objectId: string }
  | { type: 'beat'; spriteId: string; objectId: string }
  | { type: 'touch'; spriteId: string; objectId: string }
  | { type: 'hit'; spriteId: string; objectId: string }
  | { type: 'talk'; spriteId: string; objectId: string };

function triggered(s: GameState, rule: Rule, e: GameEvent): boolean {
  const w = rule.when;
  switch (w.on) {
    case 'start':
    case 'goalOpen':
    case 'hurt':
      return e.type === w.on;
    case 'collect':
      if (e.type !== 'collect') return false;
      if (w.objectId) return e.objectId === w.objectId;
      if (w.count === 'each') return true;
      if (w.count === 'all') return allCoinsCollected(s);
      return s.collected === w.count;
    case 'beat': {
      if (e.type !== 'beat' || (w.spriteId && e.spriteId !== w.spriteId)) return false;
      if (w.objectId) return e.objectId === w.objectId;
      if (w.count === 'each') return true;
      return w.spriteId ? enemiesLeft(s, w.spriteId) === 0 : enemiesLeft(s) === 0;
    }
    case 'touch':
    case 'hit':
    case 'talk':
      return e.type === w.on && (w.objectId ? e.objectId === w.objectId : e.spriteId === w.spriteId);
  }
}

type Target = { spriteId?: string; objectId?: string };
const hits = (t: Target, x: { id: string; spriteId?: string }) => (t.objectId ? x.id === t.objectId : x.spriteId !== undefined && x.spriteId === t.spriteId);

/** Shows or hides one object, or every placed copy of a sprite. */
function setHidden(s: GameState, t: Target, hidden: boolean): void {
  for (const c of s.collectibles) {
    if (!hits(t, c) || c.collected) continue;
    c.hidden = hidden;
    c.removed = hidden;
  }
  for (const g of s.goals) if (hits(t, g)) g.hidden = hidden;
  for (const p of s.props) {
    if (!hits(t, p)) continue;
    p.hidden = hidden;
    const i = p.y * s.cols + p.x;
    s.solid[i] = p.solid && !hidden ? 1 : s.ground[i];
  }
  for (const e of s.enemies) {
    if (!hits(t, e) || !e.alive) continue;
    e.hidden = hidden;
    e.removed = hidden;
  }
}

function act(s: GameState, rule: Rule): void {
  const a = rule.then;
  switch (a.do) {
    case 'message':
      // What a character says goes in the text box; other messages pop up for a moment.
      if (s.talking) s.dialog.push(a.text);
      else s.message = { text: a.text, shown: 0 };
      return;
    case 'openGoal':
      s.goalOpenedByRule = true;
      return;
    case 'hide':
      setHidden(s, a, true);
      return;
    case 'show':
      setHidden(s, a, false);
      return;
    case 'heal':
      s.hearts = Math.min(s.maxHearts, s.hearts + (s.healthStyle === 'bar' ? POINTS_PER_HEART : 1));
      return;
    case 'win':
      if (s.status === 'playing') {
        s.status = 'won';
        s.wonByRule = true;
      }
      return;
    case 'goLevel':
      // The screen showing the game takes the player there (it isn't part of this level).
      s.goTo ??= a.levelId;
      return;
  }
}

/** Runs every rule the event triggers. Actions never cause new events, so this can't loop. */
function fire(s: GameState, e: GameEvent): void {
  for (const rule of s.rules) if (triggered(s, rule, e)) act(s, rule);
}

/** Notices new touches of placed sprites (or single objects) that some rule is waiting for. */
function checkTouches(s: GameState): void {
  const touchRules = s.rules.flatMap((r) => (r.when.on === 'touch' ? [r.when] : []));
  if (touchRules.length === 0) return;
  const wanted = (x: { id: string; spriteId: string }) => touchRules.some((w) => hits(w, x));
  const p = s.player;
  const ts = s.tileSize;
  // One pixel bigger, so standing on or pushing against a solid sprite counts.
  const reach = { x: p.x - 1, y: p.y - 1, w: p.w + 2, h: p.h + 2 };
  const now = new Map<string, string>();
  for (const prop of s.props) {
    if (!prop.hidden && wanted(prop) && overlap(reach, { x: prop.x * ts, y: prop.y * ts, w: ts, h: ts })) now.set(prop.id, prop.spriteId);
  }
  for (const e of s.enemies) {
    if (e.alive && !e.hidden && wanted(e) && overlap(reach, e)) now.set(e.id, e.spriteId);
  }
  for (const [objectId, spriteId] of now) if (!s.touching.has(objectId)) fire(s, { type: 'touch', spriteId, objectId });
  s.touching = new Set(now.keys());
}

/** Enemies still to beat (ones a rule removed don't count). */
export const enemiesLeft = (s: GameState, spriteId?: string): number =>
  s.enemies.filter((e) => e.alive && !e.removed && (!spriteId || e.spriteId === spriteId)).length;

function freshPlayer(start: { x: number; y: number }): PlayerState {
  return {
    x: start.x,
    y: start.y,
    w: PLAYER_W,
    h: PLAYER_H,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: 1,
    face: { x: 1, y: 0 },
    coyote: 0,
    jumpBuffer: 0,
    dashTime: 0,
    dashCooldown: 0,
    dashDir: { x: 1, y: 0 },
    attackTime: 0,
    attackCooldown: 0,
    step: null,
    lastTile: null,
    safe: 0,
    knock: 0,
  };
}

/** Deterministic 0–1 random number (mulberry32). */
function random(s: GameState): number {
  s.seed = (s.seed + 0x6d2b79f5) | 0;
  let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const worldWidth = (s: GameState): number => s.cols * s.tileSize;
export const worldHeight = (s: GameState): number => s.rows * s.tileSize;

/** Level edges are walls left/right; above and below are open in side view. */
export function isSolidTile(s: GameState, tx: number, ty: number): boolean {
  if (tx < 0 || tx >= s.cols) return true;
  if (ty < 0 || ty >= s.rows) return s.mode !== 'platformer';
  return s.solid[ty * s.cols + tx] === 1;
}

function overlapsSolid(s: GameState, x: number, y: number, w: number, h: number): boolean {
  const ts = s.tileSize;
  const x0 = Math.floor(x / ts);
  const x1 = Math.floor((x + w - 0.001) / ts);
  const y0 = Math.floor(y / ts);
  const y1 = Math.floor((y + h - 0.001) / ts);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) if (isSolidTile(s, tx, ty)) return true;
  }
  return false;
}

/** Moves a body sideways; returns true if it hit a wall. */
function moveX(s: GameState, b: Body, dx: number): boolean {
  if (dx === 0) return false;
  b.x += dx;
  if (!overlapsSolid(s, b.x, b.y, b.w, b.h)) return false;
  const ts = s.tileSize;
  b.x = dx > 0 ? Math.floor((b.x + b.w) / ts) * ts - b.w : (Math.floor(b.x / ts) + 1) * ts;
  b.vx = 0;
  return true;
}

/** Moves a body up or down; returns true if it hit something. */
function moveY(s: GameState, b: Body, dy: number): boolean {
  if (dy === 0) return false;
  b.y += dy;
  if (!overlapsSolid(s, b.x, b.y, b.w, b.h)) return false;
  const ts = s.tileSize;
  if (dy > 0) {
    b.y = Math.floor((b.y + b.h) / ts) * ts - b.h;
    b.onGround = true;
  } else {
    b.y = (Math.floor(b.y / ts) + 1) * ts;
  }
  b.vy = 0;
  return true;
}

type Box = { x: number; y: number; w: number; h: number };
const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function axis(frame: InputFrame): { x: number; y: number } {
  const h = frame.held;
  return { x: Number(h.right) - Number(h.left), y: Number(h.down) - Number(h.up) };
}

/** The button that attacks in action battles: B in side view (A jumps), A in top-down and shooters (B brakes). */
const attackPressed = (s: GameState, frame: InputFrame): boolean =>
  s.battleStyle === 'action' && (s.mode === 'platformer' ? frame.pressed.secondary : frame.pressed.primary);

function stepPlatformer(s: GameState, frame: InputFrame, dt: number): void {
  const p = s.player;
  const dir = axis(frame);
  if (p.knock > 0) {
    p.knock = Math.max(0, p.knock - dt);
  } else {
    p.vx = dir.x * s.speed;
    if (dir.x !== 0) {
      p.facing = dir.x > 0 ? 1 : -1;
      p.face = { x: p.facing, y: 0 };
    }
  }

  p.coyote = p.onGround ? COYOTE_TIME : Math.max(0, p.coyote - dt);
  p.jumpBuffer = frame.pressed.primary ? JUMP_BUFFER : Math.max(0, p.jumpBuffer - dt);
  if (p.jumpBuffer > 0 && p.coyote > 0) {
    p.vy = -s.jumpStrength;
    p.coyote = 0;
    p.jumpBuffer = 0;
  }
  // Releasing the jump button early gives a shorter hop.
  const gravity = p.vy < 0 && !frame.held.primary && p.knock === 0 ? s.gravity * 2.2 : s.gravity;
  p.vy = Math.min(MAX_FALL, p.vy + gravity * dt);

  p.onGround = false;
  moveX(s, p, p.vx * dt);
  moveY(s, p, p.vy * dt);
  if (p.y < 0) {
    p.y = 0;
    p.vy = Math.max(0, p.vy);
  }
  if (p.y > worldHeight(s) + s.tileSize) {
    s.falls++;
    // Falling costs a heart and puts you back at the start.
    hurtPlayer(s, null);
    if (s.status === 'playing') s.player = { ...freshPlayer(s.start), safe: SAFE_TIME };
  }
}

/** The square the player stands on (by the middle of their feet). */
export function playerTile(s: GameState): { tx: number; ty: number } {
  const p = s.player;
  return { tx: Math.floor((p.x + p.w / 2) / s.tileSize), ty: Math.floor((p.y + p.h - 1) / s.tileSize) };
}

/** Where the player stands when exactly on a square. */
const squareSpot = (s: GameState, tx: number, ty: number) => ({ x: tx * s.tileSize + (s.tileSize - PLAYER_W) / 2, y: ty * s.tileSize + (s.tileSize - PLAYER_H) });

/** Square-by-square movement: one whole square per step, turning first, like classic adventure games. */
function stepGrid(s: GameState, frame: InputFrame, dt: number): void {
  const p = s.player;
  if (p.knock > 0) {
    // Bumped (or ran from a battle): stand still a moment rather than slide off the grid.
    p.knock = Math.max(0, p.knock - dt);
    p.vx = p.vy = 0;
    return;
  }
  if (!p.step) {
    const dir = axis(frame);
    // One direction at a time; keep going the way you were facing if both are held.
    const want = dir.x && dir.y ? (p.face.x ? { x: dir.x, y: 0 } : { x: 0, y: dir.y }) : dir;
    if (!want.x && !want.y) {
      p.vx = p.vy = 0;
      return;
    }
    p.face = { x: Math.sign(want.x), y: Math.sign(want.y) };
    if (want.x) p.facing = want.x > 0 ? 1 : -1;
    const here = playerTile(s);
    const next = { tx: here.tx + p.face.x, ty: here.ty + p.face.y };
    if (isSolidTile(s, next.tx, next.ty)) {
      p.vx = p.vy = 0;
      return;
    }
    p.step = next;
  }
  const target = squareSpot(s, p.step.tx, p.step.ty);
  const speed = s.speed * (frame.held.secondary ? RUN_MULTIPLIER : 1);
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const dist = Math.hypot(dx, dy);
  const move = speed * dt;
  p.vx = dist ? (dx / dist) * speed : 0;
  p.vy = dist ? (dy / dist) * speed : 0;
  if (dist <= move) {
    p.x = target.x;
    p.y = target.y;
    p.step = null;
    enteredSquare(s);
  } else {
    p.x += (dx / dist) * move;
    p.y += (dy / dist) * move;
  }
}

/** A step onto a new square: wild creatures may jump out of tall grass. */
function enteredSquare(s: GameState): void {
  const { tx, ty } = playerTile(s);
  const last = s.player.lastTile;
  if (last && last.tx === tx && last.ty === ty) return;
  s.player.lastTile = { tx, ty };
  if (tx < 0 || ty < 0 || tx >= s.cols || ty >= s.rows || !s.grass[ty * s.cols + tx]) return;
  if (s.wildTypes.length === 0 || s.player.safe > 0 || s.battle) return;
  if (random(s) >= ENCOUNTER_CHANCE) return;
  const type = s.wildTypes[Math.floor(random(s) * s.wildTypes.length)];
  // Wild creatures don't stand in the level: they are only here for the battle.
  s.enemies.push({
    x: -100,
    y: -100,
    w: ENEMY_W,
    h: ENEMY_H,
    vx: 0,
    vy: 0,
    onGround: false,
    id: `wild-${s.enemies.length}`,
    spriteId: type.spriteId,
    name: `Wild ${type.name}`,
    moves: 'still',
    hp: type.hp,
    maxHp: type.hp,
    alive: true,
    dir: { x: 1, y: 0 },
    turnIn: 0,
    hurt: 0,
    knock: 0,
    hidden: true,
    removed: true,
    wild: true,
  });
  startBattle(s, s.enemies.length - 1);
}

/** The thing just in front of the player that has something to say (a "talks to" rule), if any. */
function talkTarget(s: GameState): { spriteId: string; objectId: string } | null {
  const ts = s.tileSize;
  const p = s.player;
  const f = s.mode === 'platformer' ? { x: p.facing, y: 0 } : p.face;
  const here = playerTile(s);
  const tx = here.tx + f.x;
  const ty = here.ty + f.y;
  const talks = s.rules.filter((r) => r.when.on === 'talk');
  if (!talks.length) return null;
  const listens = (spriteId: string, objectId: string) =>
    talks.some((r) => (r.when.on === 'talk' && r.when.objectId ? r.when.objectId === objectId : 'spriteId' in r.when && r.when.spriteId === spriteId));
  for (const prop of s.props) {
    if (!prop.hidden && prop.x === tx && prop.y === ty && listens(prop.spriteId, prop.id)) return { spriteId: prop.spriteId, objectId: prop.id };
  }
  for (const e of s.enemies) {
    if (!e.alive || e.hidden) continue;
    const ex = Math.floor((e.x + e.w / 2) / ts);
    const ey = Math.floor((e.y + e.h - 1) / ts);
    if (ex === tx && ey === ty && listens(e.spriteId, e.id)) return { spriteId: e.spriteId, objectId: e.id };
  }
  return null;
}

/** A pressed: talk to whoever is in front. Returns true if someone was talked to (so A does nothing else). */
function tryTalk(s: GameState, frame: InputFrame): boolean {
  if (!frame.pressed.primary || s.mode !== 'topdown') return false;
  const target = talkTarget(s);
  if (!target) return false;
  s.talking = true;
  fire(s, { type: 'talk', ...target });
  s.talking = false;
  return true;
}

function stepTopDown(s: GameState, frame: InputFrame, dt: number): void {
  const p = s.player;
  if (s.movement === 'grid') {
    stepGrid(s, frame, dt);
    return;
  }
  const dir = axis(frame);
  const len = Math.hypot(dir.x, dir.y);
  const nx = len ? dir.x / len : 0;
  const ny = len ? dir.y / len : 0;
  if (len) {
    p.dashDir = { x: nx, y: ny };
    // Face the main direction of movement (attacks go that way).
    p.face = Math.abs(dir.x) >= Math.abs(dir.y) ? { x: Math.sign(dir.x), y: 0 } : { x: 0, y: Math.sign(dir.y) };
    if (dir.x !== 0) p.facing = dir.x > 0 ? 1 : -1;
  }

  // Dash: B in action battles (A attacks), A otherwise.
  const dashPressed = s.battleStyle === 'action' ? frame.pressed.secondary : frame.pressed.primary;
  p.dashCooldown = Math.max(0, p.dashCooldown - dt);
  if (dashPressed && p.dashCooldown === 0 && p.knock === 0) {
    p.dashTime = DASH_TIME;
    p.dashCooldown = DASH_COOLDOWN;
  }
  if (p.knock > 0) {
    p.knock = Math.max(0, p.knock - dt);
  } else if (p.dashTime > 0) {
    p.dashTime = Math.max(0, p.dashTime - dt);
    p.vx = p.dashDir.x * s.speed * DASH_MULTIPLIER;
    p.vy = p.dashDir.y * s.speed * DASH_MULTIPLIER;
  } else {
    p.vx = nx * s.speed;
    p.vy = ny * s.speed;
  }
  moveX(s, p, p.vx * dt);
  moveY(s, p, p.vy * dt);
  p.onGround = false;
  p.y = Math.max(0, Math.min(worldHeight(s) - p.h, p.y));
  enteredSquare(s);
}

/** Shooter: how much of its top speed the ship is flying at (0–1). */
export const throttle = (s: GameState): number => Math.min(1, Math.hypot(s.player.vx, s.player.vy) / FLY_MAX);

/** The way the ship points, as a step of length 1. */
const headingDir = (s: GameState) => ({ x: Math.sin(s.flight.heading), y: -Math.cos(s.flight.heading) });

/** Shooter: the screen keeps the ship in the middle, looking ahead the way it flies (stopping at the edges of the level). */
function placeCamera(s: GameState): void {
  const f = s.flight;
  const p = s.player;
  f.camX = Math.max(0, Math.min(worldWidth(s) - VIEW_W, p.x + p.w / 2 + f.lookX - VIEW_W / 2));
  f.camY = Math.max(0, Math.min(worldHeight(s) - VIEW_H, p.y + p.h / 2 + f.lookY - VIEW_H / 2));
}

/** Is a box on the shooter's screen (or just off it)? */
const onScreen = (s: GameState, b: Box): boolean => {
  const { camX, camY } = s.flight;
  const m = s.tileSize;
  return b.x + b.w > camX - m && b.x < camX + VIEW_W + m && b.y + b.h > camY - m && b.y < camY + VIEW_H + m;
};

/**
 * Shooter: ← → turn, ↑ thrusts the way the ship points, ↓ brakes; it drifts
 * on when let go. It bounces off land, and a hard bump costs a heart.
 */
/** The same angle, between -π and π. */
const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

function stepShooter(s: GameState, frame: InputFrame, dt: number): void {
  const p = s.player;
  const f = s.flight;
  // A joystick points exactly (and a gentle push thrusts gently); the arrows point eight ways.
  const aim = frame.stick ?? axis(frame);
  const push = Math.min(1, Math.hypot(aim.x, aim.y));
  f.thrusting = false;
  if (push > 0) {
    // Swing round toward the way it points (the short way), no faster than the ship can turn.
    const want = Math.atan2(aim.x, -aim.y);
    const off = wrapAngle(want - f.heading);
    const turn = TURN_RATE * dt;
    f.heading = wrapAngle(Math.abs(off) <= turn ? want : f.heading + Math.sign(off) * turn);
    f.thrusting = Math.abs(wrapAngle(want - f.heading)) < THRUST_WITHIN;
  }
  const ahead = headingDir(s);
  if (f.thrusting) {
    p.vx += ahead.x * THRUST * push * dt;
    p.vy += ahead.y * THRUST * push * dt;
  }
  const slow = Math.max(0, 1 - (frame.held.secondary ? BRAKE : DRAG) * dt);
  p.vx *= slow;
  p.vy *= slow;
  const speed = Math.hypot(p.vx, p.vy);
  if (speed > FLY_MAX) {
    p.vx *= FLY_MAX / speed;
    p.vy *= FLY_MAX / speed;
  }
  // Attacks and rules use the main way the ship points.
  p.face = Math.abs(ahead.x) > Math.abs(ahead.y) ? { x: Math.sign(ahead.x), y: 0 } : { x: 0, y: Math.sign(ahead.y) };
  if (ahead.x !== 0) p.facing = ahead.x > 0 ? 1 : -1;
  const { vx, vy } = p;
  const hitX = moveX(s, p, vx * dt);
  const hitY = moveY(s, p, vy * dt);
  p.onGround = false;
  if (hitX || hitY) {
    // Bounce back off the bank, softly.
    const bump = Math.hypot(hitX ? vx : 0, hitY ? vy : 0);
    p.vx = hitX ? -vx * 0.4 : vx * 0.7;
    p.vy = hitY ? -vy * 0.4 : vy * 0.7;
    if (bump > BUMP_HURTS && p.safe === 0) hurtPlayer(s, null, 'bump');
  }
  // The screen leans ahead the way the ship is going, the further the faster.
  const ease = Math.min(1, dt * 2);
  f.lookX += ((p.vx / FLY_MAX) * LOOK_AHEAD - f.lookX) * ease;
  f.lookY += ((p.vy / FLY_MAX) * LOOK_AHEAD - f.lookY) * ease;
  placeCamera(s);
}

/** Shooter enemies only move once they are on screen; the ones left behind stay where they are. */
function stepShooterEnemies(s: GameState, dt: number): void {
  for (const e of s.enemies) if (e.alive && !e.hidden && onScreen(s, e)) stepEnemy(s, e, dt);
}

/** Now and then an enemy on screen fires at the ship. Its shots stop at land and rocks (anything solid). */
function stepBombs(s: GameState, dt: number): void {
  const p = s.player;
  s.bombIn -= dt;
  if (s.bombIn <= 0) {
    s.bombIn = 1.2 + random(s) * 1.6;
    // Not ones right beside the ship: their shots would be too quick to dodge.
    const ahead = s.enemies.filter((e) => e.alive && !e.hidden && onScreen(s, e) && Math.hypot(e.x - p.x, e.y - p.y) > s.tileSize * 4);
    if (ahead.length && s.bombs.length < BOMBS_MAX) {
      const e = ahead[Math.floor(random(s) * ahead.length)];
      const from = { x: e.x + e.w / 2, y: e.y + e.h / 2 };
      const dx = p.x + p.w / 2 - from.x;
      const dy = p.y + p.h / 2 - from.y;
      const d = Math.hypot(dx, dy) || 1;
      s.bombs.push({ x: from.x - BOMB_SIZE / 2, y: from.y - BOMB_SIZE / 2, w: BOMB_SIZE, h: BOMB_SIZE, vx: (dx / d) * BOMB_SPEED, vy: (dy / d) * BOMB_SPEED });
    }
  }
  s.bombs = s.bombs.filter((b) => {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (overlap(b, p)) {
      if (p.safe === 0) hurtPlayer(s, null, 'fire');
      return false;
    }
    if (overlapsSolid(s, b.x + b.w / 2 - 1, b.y + b.h / 2 - 1, 2, 2)) return false;
    return onScreen(s, b);
  });
}

// ----- Enemies ----------------------------------------------------------------

/** Is there floor just ahead of a side-view enemy's front foot? */
function floorAhead(s: GameState, e: Enemy, dir: number): boolean {
  const ts = s.tileSize;
  const footX = dir > 0 ? e.x + e.w + 1 : e.x - 1;
  return isSolidTile(s, Math.floor(footX / ts), Math.floor((e.y + e.h + 1) / ts));
}

const SIDE_DIRS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 0 }];
const TOP_DIRS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }, { x: 0, y: 0 }];

function stepEnemy(s: GameState, e: Enemy, dt: number): void {
  e.hurt = Math.max(0, e.hurt - dt);
  const ts = s.tileSize;
  const p = s.player;
  const side = s.mode === 'platformer';

  if (e.knock > 0) {
    e.knock = Math.max(0, e.knock - dt);
  } else {
    // Choose where to go.
    let want = { x: 0, y: 0 };
    let speed = ENEMY_SPEED;
    if (e.moves === 'patrol') {
      want = { x: e.dir.x || 1, y: 0 };
    } else if (e.moves === 'wander') {
      e.turnIn -= dt;
      if (e.turnIn <= 0) {
        const options = side ? SIDE_DIRS : TOP_DIRS;
        e.dir = options[Math.floor(random(s) * options.length)];
        e.turnIn = 0.8 + random(s) * 1.4;
      }
      want = e.dir;
    } else if (e.moves === 'chase') {
      const dx = p.x + p.w / 2 - (e.x + e.w / 2);
      const dy = p.y + p.h / 2 - (e.y + e.h / 2);
      const near = Math.abs(dx) < CHASE_RANGE * ts && Math.abs(dy) < (side ? 3 : CHASE_RANGE) * ts;
      if (near) {
        speed = CHASE_SPEED;
        if (side) {
          want = { x: Math.abs(dx) > 2 ? Math.sign(dx) : 0, y: 0 };
        } else {
          const d = Math.hypot(dx, dy) || 1;
          want = { x: dx / d, y: dy / d };
        }
      }
    }
    // Side-view enemies don't walk off ledges.
    if (side && want.x !== 0 && e.onGround && !floorAhead(s, e, want.x)) {
      if (e.moves !== 'chase') e.dir = { x: -want.x, y: 0 };
      want = { x: 0, y: 0 };
    }
    e.vx = want.x * speed;
    if (!side) e.vy = want.y * speed;
    if (want.x !== 0 && e.moves === 'chase') e.dir = { x: Math.sign(want.x), y: 0 };
  }

  if (side) {
    e.vy = Math.min(MAX_FALL, e.vy + s.gravity * dt);
    e.onGround = false;
  }
  const hitX = moveX(s, e, e.vx * dt);
  const hitY = moveY(s, e, e.vy * dt);
  // Walkers turn around when they bump into something.
  if (e.knock === 0 && e.moves !== 'chase' && (hitX || (!side && hitY))) e.dir = { x: -e.dir.x, y: -e.dir.y };
  if (side && e.y > worldHeight(s) + ts) beat(s, e);
}

/** Pushes a body away from another. */
function knockAway(s: GameState, b: Body & { knock: number }, from: Box, speed: number): void {
  const dx = b.x + b.w / 2 - (from.x + from.w / 2);
  const dy = b.y + b.h / 2 - (from.y + from.h / 2);
  b.knock = KNOCK_TIME;
  if (s.mode === 'platformer') {
    b.vx = (dx >= 0 ? 1 : -1) * speed;
    b.vy = -speed * 0.9;
  } else {
    const d = Math.hypot(dx, dy) || 1;
    b.vx = (dx / d) * speed;
    b.vy = (dy / d) * speed;
  }
}

/**
 * A hit: the shield takes it first, then health. Returns true if health went
 * down. With hearts the shield stops whole hits; on a bar it soaks up what it can.
 */
function takeHit(s: GameState, harm: Harm): boolean {
  const d = s.healthStyle === 'bar' ? DAMAGE[harm] : 1;
  s.shieldWait = SHIELD_WAIT;
  const soaked = s.healthStyle === 'bar' ? Math.min(s.shield, d) : s.shield >= d ? d : 0;
  if (soaked > 0) {
    s.shield = Math.max(0, s.shield - soaked);
    s.shieldHit = SHIELD_FLASH;
  }
  if (d - soaked <= 0) return false;
  s.hearts = Math.max(0, s.hearts - (d - soaked));
  fire(s, { type: 'hurt' });
  return true;
}

/** Fills the shield back up after a while without being hit. */
function stepShield(s: GameState, dt: number): void {
  if (!s.maxShield) return;
  s.shieldHit = Math.max(0, s.shieldHit - dt);
  if (s.shieldWait > 0) s.shieldWait = Math.max(0, s.shieldWait - dt);
  else s.shield = Math.min(s.maxShield, s.shield + (s.maxShield / SHIELD_REFILL) * dt);
}

/** Hurts the player (if they aren't safe). `by` is the enemy, or null for a fall, a bump or a shot. */
function hurtPlayer(s: GameState, by: Enemy | null, harm: Harm = by ? 'touch' : 'fall'): void {
  const p = s.player;
  if (by && p.safe > 0) return;
  p.safe = SAFE_TIME;
  // A shooter's ship keeps flying.
  if (by && s.mode !== 'shooter') knockAway(s, p, by, KNOCK_SPEED);
  takeHit(s, harm);
  if (s.hearts === 0) s.status = 'lost';
}

/** The area the player's attack covers right now, or null. */
export function attackBox(s: GameState): Box | null {
  const p = s.player;
  if (p.attackTime <= 0) return null;
  const f = attackDir(s);
  if (f.y !== 0) return { x: p.x - 3, y: f.y > 0 ? p.y + p.h : p.y - ATTACK_REACH, w: p.w + 6, h: ATTACK_REACH };
  return { x: f.x > 0 ? p.x + p.w : p.x - ATTACK_REACH, y: p.y - 3, w: ATTACK_REACH, h: p.h + 6 };
}

/**
 * An attack hitting placed sprites (crates, switches, signs…): fires "the
 * player attacks …" rules, once per swing or shot. Returns true if it hit a solid one.
 */
function hitProps(s: GameState, box: Box, already: Set<string>): boolean {
  const ts = s.tileSize;
  let solid = false;
  for (const prop of s.props) {
    if (prop.hidden || !overlap(box, { x: prop.x * ts, y: prop.y * ts, w: ts, h: ts })) continue;
    solid ||= prop.solid;
    if (already.has(prop.id)) continue;
    already.add(prop.id);
    fire(s, { type: 'hit', spriteId: prop.spriteId, objectId: prop.id });
  }
  return solid;
}

/** The way the hero faces for attacking. */
const attackDir = (s: GameState): { x: number; y: number } => (s.mode === 'platformer' ? { x: s.player.facing, y: 0 } : s.player.face);

function throwShot(s: GameState): void {
  const p = s.player;
  // A shooter fires exactly the way the ship points.
  const dir = s.mode === 'shooter' ? headingDir(s) : attackDir(s);
  const cx = p.x + p.w / 2 + dir.x * (p.w / 2 + 2);
  const cy = p.y + p.h / 2 + dir.y * (p.h / 2 + 2);
  // A shooter's shots outrun the ship, all the way up the screen.
  const speed = s.mode === 'shooter' ? SHOOTER_SHOT_SPEED + Math.max(0, p.vx * dir.x + p.vy * dir.y) : SHOT_SPEED;
  const life = s.mode === 'shooter' ? VIEW_W / SHOOTER_SHOT_SPEED / 1.5 : SHOT_LIFE;
  s.shots.push({ x: cx - SHOT_SIZE / 2, y: cy - SHOT_SIZE / 2, w: SHOT_SIZE, h: SHOT_SIZE, vx: dir.x * speed, vy: dir.y * speed, dir, life, hits: new Set() });
}

/** An enemy hit by a swing or a shot. */
function hitEnemy(s: GameState, e: Enemy, from: Box): void {
  e.hp--;
  e.hurt = ENEMY_HURT_TIME;
  // In a shooter they stay put (gun towers are built on the bank).
  if (s.mode !== 'shooter') knockAway(s, e, from, KNOCK_SPEED * 0.8);
  fire(s, { type: 'hit', spriteId: e.spriteId, objectId: e.id });
  if (e.hp <= 0) beat(s, e);
}

/** Shots fly on until they hit an enemy, a wall or a solid sprite, or run out. */
function stepShots(s: GameState, dt: number): void {
  s.shots = s.shots.filter((shot) => {
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.life -= dt;
    const enemy = s.enemies.find((e) => e.alive && !e.hidden && e.hurt === 0 && overlap(shot, e));
    if (enemy) {
      hitEnemy(s, enemy, shot);
      return false;
    }
    // Rules fire for whatever it passes; it stops at solid things.
    if (hitProps(s, shot, shot.hits)) return false;
    const middle = { x: shot.x + shot.w / 2 - 1, y: shot.y + shot.h / 2 - 1 };
    if (overlapsSolid(s, middle.x, middle.y, 2, 2)) return false;
    return shot.life > 0 && shot.y < worldHeight(s) + s.tileSize && shot.y + shot.h > -s.tileSize;
  });
}

function beat(s: GameState, e: Enemy): void {
  if (!e.alive) return;
  e.alive = false;
  s.defeated++;
  fire(s, { type: 'beat', spriteId: e.spriteId, objectId: e.id });
}

function stepAction(s: GameState, frame: InputFrame, dt: number): void {
  const p = s.player;
  p.attackCooldown = Math.max(0, p.attackCooldown - dt);
  p.attackTime = Math.max(0, p.attackTime - dt);
  if (attackPressed(s, frame) && p.attackCooldown === 0) {
    // In a shooter, every attack flies.
    if (s.attackKind === 'throw' || s.mode === 'shooter') {
      if (s.shots.length < SHOTS_MAX) {
        throwShot(s);
        p.attackCooldown = SHOT_COOLDOWN;
      }
    } else {
      p.attackTime = ATTACK_TIME;
      p.attackCooldown = ATTACK_COOLDOWN;
      s.swingHits = new Set();
    }
  }
  stepShots(s, dt);
  const box = attackBox(s);
  if (box) hitProps(s, box, s.swingHits);
  for (const e of s.enemies) {
    if (!e.alive || e.hidden) continue;
    if (box && e.hurt === 0 && overlap(box, e)) {
      hitEnemy(s, e, p);
      continue;
    }
    // A slightly smaller box, so brushing past a corner doesn't hurt.
    if (e.hurt === 0 && overlap({ x: p.x + 2, y: p.y + 2, w: p.w - 4, h: p.h - 3 }, e)) hurtPlayer(s, e);
    if (s.status !== 'playing') return;
  }
}

// ----- Turn-based battles ------------------------------------------------------

function say(b: Battle, message: string, next: BattleNext): void {
  b.phase = 'message';
  b.message = message;
  b.shown = 0;
  b.next = next;
}

function startBattle(s: GameState, index: number): void {
  const e = s.enemies[index];
  s.battle = { enemy: index, phase: 'message', choice: 0, message: '', shown: 0, next: 'choose', defending: false, powered: false };
  say(s.battle, `${e.name} wants to battle!`, 'choose');
}

/** Picks a battle action (from the keyboard, a gamepad or a tap). */
export function chooseBattle(s: GameState, choice: BattleChoice): void {
  const b = s.battle;
  if (!b || b.phase !== 'choose' || s.status !== 'playing') return;
  b.choice = BATTLE_CHOICES.indexOf(choice);
  const e = s.enemies[b.enemy];
  if (choice === 'attack') {
    const damage = b.powered ? 2 : 1;
    b.powered = false;
    e.hp = Math.max(0, e.hp - damage);
    e.hurt = ENEMY_HURT_TIME;
    fire(s, { type: 'hit', spriteId: e.spriteId, objectId: e.id });
    say(b, damage > 1 ? `Power hit! ${e.name} takes 2 damage!` : `You hit ${e.name}!`, e.hp <= 0 ? 'beaten' : 'enemyTurn');
  } else if (choice === 'defend') {
    b.defending = true;
    b.powered = true;
    say(b, 'You get ready. Your next hit will be stronger!', 'enemyTurn');
  } else {
    say(b, 'You got away!', 'flee');
  }
}

function advanceBattle(s: GameState): void {
  const b = s.battle!;
  const e = s.enemies[b.enemy];
  switch (b.next) {
    case 'choose':
      b.phase = 'choose';
      return;
    case 'enemyTurn':
      if (b.defending) {
        b.defending = false;
        say(b, `${e.name} attacks, but you block it!`, 'choose');
      } else if (random(s) < ENEMY_HIT_CHANCE) {
        const hurt = takeHit(s, 'battle');
        say(b, hurt ? `${e.name} hits you!` : `Your shield stops ${e.name}'s hit!`, s.hearts === 0 ? 'lose' : 'choose');
      } else {
        say(b, `${e.name} misses!`, 'choose');
      }
      return;
    case 'beaten':
      say(b, `${e.name} is beaten!`, 'end');
      return;
    case 'end':
      beat(s, e);
      s.battle = null;
      s.player.safe = SAFE_TIME / 2;
      dropWild(s, e);
      return;
    case 'flee':
      s.battle = null;
      s.player.safe = SAFE_TIME * 1.5;
      if (e.wild) dropWild(s, e);
      else knockAway(s, s.player, e, KNOCK_SPEED);
      return;
    case 'lose':
      s.battle = null;
      s.status = 'lost';
      return;
  }
}

/** A wild creature leaves once its battle is over. */
function dropWild(s: GameState, e: Enemy): void {
  if (e.wild) s.enemies = s.enemies.filter((x) => x !== e);
}

function stepBattle(s: GameState, frame: InputFrame, dt: number): void {
  const b = s.battle!;
  if (b.phase === 'message') {
    b.shown += dt;
    if (b.shown >= MESSAGE_TIME || (frame.pressed.primary && b.shown >= MESSAGE_MIN)) advanceBattle(s);
    return;
  }
  const n = BATTLE_CHOICES.length;
  if (frame.pressed.left || frame.pressed.up) b.choice = (b.choice + n - 1) % n;
  if (frame.pressed.right || frame.pressed.down) b.choice = (b.choice + 1) % n;
  if (frame.pressed.primary) chooseBattle(s, BATTLE_CHOICES[b.choice]);
}

function stepTurnsOverworld(s: GameState): void {
  const p = s.player;
  if (p.safe > 0) return;
  const index = s.enemies.findIndex((e) => e.alive && !e.hidden && overlap(p, e));
  if (index >= 0) startBattle(s, index);
}

// ----- Coins, goals, winning ---------------------------------------------------

/** The player overlaps the middle of a square (a little forgiving at the edges). */
function touches(s: GameState, tx: number, ty: number): boolean {
  const p = s.player;
  const ts = s.tileSize;
  const inset = ts * 0.2;
  const x = tx * ts + inset;
  const y = ty * ts + inset;
  const size = ts - inset * 2;
  return p.x < x + size && p.x + p.w > x && p.y < y + size && p.y + p.h > y;
}

export const allCoinsCollected = (s: GameState): boolean => s.collectibles.every((c) => c.collected || c.removed);

/** Treasure that still counts (a rule may have removed some). */
export const treasureTotal = (s: GameState): number => s.collectibles.filter((c) => !c.removed).length;

/** Goals count once allowed: after every treasure for `coinsThenGoal`, and after an "open the goal" rule if there is one. */
export const goalOpen = (s: GameState): boolean =>
  (s.winRule !== 'coinsThenGoal' || allCoinsCollected(s)) && (!s.goalWaits || s.goalOpenedByRule);

function collect(s: GameState): void {
  for (const c of s.collectibles) {
    if (!c.collected && !c.hidden && touches(s, c.tx, c.ty)) {
      c.collected = true;
      s.collected++;
      fire(s, { type: 'collect', objectId: c.id });
    }
  }
  const atGoal = s.goals.some((g) => !g.hidden && touches(s, g.tx, g.ty));
  s.atLockedGoal = false;
  if (s.status !== 'playing') return;
  if (s.winRule === 'coins') {
    if (treasureTotal(s) > 0 && allCoinsCollected(s)) s.status = 'won';
  } else if (s.winRule === 'enemies') {
    if (s.enemies.length > 0 && enemiesLeft(s) === 0) s.status = 'won';
  } else if (atGoal) {
    if (goalOpen(s)) s.status = 'won';
    else s.atLockedGoal = true;
  }
}

/** Advances the simulation by one fixed step. Mutates `s` for speed. */
export function stepGame(s: GameState, frame: InputFrame, dt: number = STEP): void {
  if (s.status !== 'playing') return;
  if (s.message) {
    s.message.shown += dt;
    if (s.message.shown >= RULE_MESSAGE_TIME) s.message = null;
  }
  // While a character is talking, the game waits; A (or B) shows the next line.
  if (s.dialog.length) {
    if (frame.pressed.primary || frame.pressed.secondary) s.dialog.shift();
    return;
  }
  if (s.battle) {
    stepBattle(s, frame, dt);
    if (!s.battle) {
      collect(s);
      checkGoalOpened(s);
    }
    return;
  }
  s.time += dt;
  stepShield(s, dt);
  s.player.safe = Math.max(0, s.player.safe - dt);
  // A talks to whoever is in front; then it doesn't also attack or dash.
  if (tryTalk(s, frame)) {
    frame = { held: frame.held, pressed: { ...frame.pressed, primary: false } };
    if (s.dialog.length) return;
  }
  if (s.mode === 'shooter') {
    stepShooter(s, frame, dt);
    if (s.status === 'playing') stepShooterEnemies(s, dt);
    if (s.status === 'playing') stepBombs(s, dt);
  } else {
    if (s.mode === 'platformer') stepPlatformer(s, frame, dt);
    else stepTopDown(s, frame, dt);
    if (s.status === 'playing') for (const e of s.enemies) if (e.alive && !e.hidden) stepEnemy(s, e, dt);
  }
  if (s.status !== 'playing') return;
  if (s.battleStyle === 'action') stepAction(s, frame, dt);
  else stepTurnsOverworld(s);
  if (s.status !== 'playing') return;
  checkTouches(s);
  collect(s);
  checkGoalOpened(s);
}

/** Fires "the goal opens" the moment it unlocks (and re-checks winning on it). */
function checkGoalOpened(s: GameState): void {
  const open = goalOpen(s);
  if (open && !s.wasGoalOpen) fire(s, { type: 'goalOpen' });
  s.wasGoalOpen = open;
}
