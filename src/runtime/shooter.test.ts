import { describe, expect, it } from 'vitest';
import { emptyActionState, type Action } from '../input/bindings';
import type { InputFrame } from '../input/InputManager';
import { createProject } from '../models/defaults';
import { addLevel, levelView } from '../models/levels';
import { SCREEN_TILES, TILE, type LevelProject } from '../models/project';
import { parseProject, validateProject } from '../models/serialization';
import { createShooterProject } from '../models/shooter';
import { createGame, stepGame, type GameState } from './game';

function frame(held: Action[] = [], pressed: Action[] = []): InputFrame {
  const f = { held: emptyActionState(), pressed: emptyActionState() };
  for (const a of held) f.held[a] = true;
  for (const a of pressed) f.pressed[a] = f.held[a] = true;
  return f;
}
const run = (g: GameState, steps: number, held: Action[] = []) => {
  for (let i = 0; i < steps; i++) stepGame(g, frame(held));
};

const shooter = (): LevelProject => levelView(createShooterProject('Canal'), 0);
/** The starter level without its hello message. */
function quiet(setup?: (p: LevelProject) => void) {
  const p = shooter();
  p.rules = [];
  setup?.(p);
  return createGame(p);
}
const middle = (b: { x: number; w: number }) => b.x + b.w / 2;
/** Plain hearts and no shield, so each hit shows as one heart gone. */
const hearty = () => quiet((p) => (p.player = { ...p.player, health: 'hearts', shield: false }));
/** Shooter shots fly at least this fast. */
const SHOT_FAST = 200;

describe('the shooter starter', () => {
  it('is a canal that bends every way across several screens: boats, drones and gun towers, the ship with a laser, a finish line at the far end', () => {
    const game = createShooterProject('Canal');
    expect(validateProject(game).errors).toEqual([]);
    const [level] = game.levels;
    expect([level.mode, level.winRule]).toEqual(['shooter', 'goal']);
    expect(level.width).toBeGreaterThan(SCREEN_TILES.width * 2);
    expect(level.height).toBeGreaterThan(SCREEN_TILES.height * 2);
    expect(game.sprites.find((s) => s.id === game.player.spriteId)?.name).toBe('Ship');
    expect(game.player.attack?.kind).toBe('throw');
    const named = (id?: string) => game.sprites.find((s) => s.id === id)?.name;
    const enemies = level.objects.filter((o) => level.enemies.some((e) => e.spriteId === o.spriteId)).map((o) => named(o.spriteId));
    expect(new Set(enemies)).toEqual(new Set(['Patrol boat', 'Buzz drone', 'Gun tower']));
    expect(level.objects.filter((o) => o.kind === 'goal').length).toBeGreaterThan(3);
    // Gun towers stand on the bank.
    const towers = level.objects.filter((o) => named(o.spriteId) === 'Gun tower');
    expect(towers.length).toBeGreaterThan(2);
    for (const o of towers) expect([level.tiles[o.y][o.x - 1], level.tiles[o.y][o.x + 1], level.tiles[o.y - 1][o.x], level.tiles[o.y + 1][o.x]]).toContain(TILE.solid);
    // The finish can be reached by water from the start.
    expect(distances(createGame(levelView(game, 0)))[level.playerStart.y * level.width + level.playerStart.x]).toBeLessThan(Infinity);
  });

  it('can be added as a level to any game, and is saved and loaded', () => {
    const made = addLevel(createProject('Mix'), 'shooter');
    if (!made.ok) throw new Error(made.error);
    expect(made.project.levels[1].mode).toBe('shooter');
    expect(validateProject(made.project).errors).toEqual([]);
    const back = parseProject(JSON.stringify(made.project));
    if (!back.ok) throw new Error(back.errors.join());
    expect(back.project.levels[1].mode).toBe('shooter');
    const broken: any = JSON.parse(JSON.stringify(made.project));
    broken.levels[1].mode = 'racing';
    expect(parseProject(broken).ok).toBe(false);
  });
});

/** Squares of water from each square to the finish line (Infinity where it can't be reached). */
function distances(g: GameState): number[] {
  const d = Array<number>(g.cols * g.rows).fill(Infinity);
  const queue = g.goals.map((goal) => goal.ty * g.cols + goal.tx);
  for (const i of queue) d[i] = 0;
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k];
    const x = i % g.cols;
    const y = Math.floor(i / g.cols);
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const n = ny * g.cols + nx;
      if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows || g.solid[n] || d[n] !== Infinity) continue;
      d[n] = d[i] + 1;
      queue.push(n);
    }
  }
  return d;
}

/** Squares from each square to the nearest land. */
function landDistances(g: GameState): number[] {
  const d = Array<number>(g.cols * g.rows).fill(Infinity);
  const queue: number[] = [];
  g.solid.forEach((v, i) => v && (d[i] = 0) === 0 && queue.push(i));
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k];
    const x = i % g.cols;
    const y = Math.floor(i / g.cols);
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const n = ny * g.cols + nx;
      if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows || d[n] !== Infinity) continue;
      d[n] = d[i] + 1;
      queue.push(n);
    }
  }
  return d;
}

const speedOf = (g: GameState) => Math.hypot(g.player.vx, g.player.vy);

describe('flying a shooter', () => {
  it('↑ thrusts the way the ship points, and it drifts on (slowing) when let go; always played in real time', () => {
    const p = shooter();
    p.rules = [];
    p.settings = { ...p.settings, battle: 'turns' };
    const g = createGame(p);
    expect(g.battleStyle).toBe('action');
    const { x, y } = g.player;
    run(g, 60);
    expect([g.player.x, g.player.y]).toEqual([x, y]);
    run(g, 30, ['up']);
    expect(g.player.y).toBeLessThan(y - 10);
    expect(Math.abs(g.player.x - x)).toBeLessThan(1);
    const fast = speedOf(g);
    const at = g.player.y;
    run(g, 20);
    expect(g.player.y).toBeLessThan(at);
    expect(speedOf(g)).toBeLessThan(fast);
    expect(speedOf(g)).toBeGreaterThan(fast * 0.7);
  });

  it('← → turn the ship, and then it thrusts and fires that way', () => {
    const g = quiet();
    g.bombIn = 999;
    // A quarter turn to the right.
    let n = 0;
    while (g.flight.heading < Math.PI / 2 && n++ < 200) run(g, 1, ['right']);
    expect(g.flight.heading).toBeCloseTo(Math.PI / 2, 1);
    expect(g.player.face).toEqual({ x: 1, y: 0 });
    g.flight.heading = Math.PI / 2;
    const { x, y } = g.player;
    run(g, 10, ['up']);
    expect(g.player.x).toBeGreaterThan(x);
    expect(Math.abs(g.player.y - y)).toBeLessThan(2);
    stepGame(g, frame([], ['primary']));
    expect(g.shots[0].vx).toBeGreaterThan(SHOT_FAST);
    expect(Math.abs(g.shots[0].vy)).toBeLessThan(5);
    run(g, 40, ['left']);
    expect(g.flight.heading).toBeLessThan(0);
  });

  it('↓ brakes', () => {
    const g = quiet();
    run(g, 40, ['up']);
    const fast = speedOf(g);
    run(g, 30, ['down']);
    expect(speedOf(g)).toBeLessThan(fast * 0.4);
  });

  it('the screen follows the ship, looking ahead the way it flies', () => {
    const g = quiet();
    const cam = g.flight.camY;
    run(g, 120, ['up']);
    expect(g.flight.camY).toBeLessThan(cam);
    const p = g.player;
    const view = { w: SCREEN_TILES.width * 16, h: SCREEN_TILES.height * 16 };
    expect(p.x).toBeGreaterThan(g.flight.camX);
    expect(p.x + p.w).toBeLessThan(g.flight.camX + view.w);
    // Flying up, the ship is below the middle of the screen.
    expect(p.y - g.flight.camY).toBeGreaterThan(view.h / 2);
  });

  it('it bounces off the bank; a hard bump costs a heart, a gentle one does not', () => {
    const g = hearty();
    g.bombIn = 999;
    g.flight.heading = -Math.PI / 2;
    const hearts = g.hearts;
    // Gently: one little push, then drift into the bank.
    run(g, 3, ['up']);
    run(g, 200);
    expect(g.hearts).toBe(hearts);
    // Hard.
    const g2 = hearty();
    g2.bombIn = 999;
    g2.flight.heading = -Math.PI / 2;
    g2.player.vx = -120;
    const x = g2.player.x;
    run(g2, 60);
    expect(g2.hearts).toBe(hearts - 1);
    // Bounced back off it, still on the water.
    expect(g2.player.vx).toBeGreaterThanOrEqual(0);
    expect(g2.player.x).toBeLessThan(x);
  });

  it('enemies wait until they are on screen; then they move and fire at the ship, and their fire hurts', () => {
    const g = quiet();
    const far = g.enemies.reduce((a, b) => (Math.hypot(a.x - g.player.x, a.y - g.player.y) > Math.hypot(b.x - g.player.x, b.y - g.player.y) ? a : b));
    const { x, y } = far;
    run(g, 120);
    expect([far.x, far.y]).toEqual([x, y]);

    const h = hearty();
    const boat = h.enemies.find((e) => e.moves === 'patrol')!;
    h.player.x = boat.x;
    h.player.y = boat.y + 100;
    h.bombIn = 0;
    const bx = boat.x;
    run(h, 2);
    expect(h.bombs).toHaveLength(1);
    expect(boat.x).not.toBe(bx);
    const hearts = h.hearts;
    h.bombs = [{ x: h.player.x + 4, y: h.player.y - 10, w: 4, h: 4, vx: 0, vy: 90 }];
    h.bombIn = 999;
    run(h, 20);
    expect(h.hearts).toBe(hearts - 1);

  });

  it('gun towers stand at the edge of the water, where the ship can shoot them', () => {
    const t = quiet();
    t.bombIn = 999;
    const ts = t.tileSize;
    const towers = t.enemies.filter((e) => e.moves === 'still');
    // For each, a way to it straight across the water.
    const open = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < t.cols && ty < t.rows && !t.solid[ty * t.cols + tx];
    const ways = towers.map((e) => {
      const tx = Math.floor(middle(e) / ts);
      const ty = Math.floor((e.y + e.h / 2) / ts);
      return [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => [1, 2, 3].every((k) => open(tx + dx * k, ty + dy * k)));
    });
    expect(ways.every(Boolean)).toBe(true);
    const tower = towers[0];
    const [dx, dy] = ways[0]!;
    t.player.x = middle(tower) - t.player.w / 2 + dx * 3 * ts;
    t.player.y = tower.y + dy * 3 * ts;
    t.flight.heading = Math.atan2(-dx, dy);
    stepGame(t, frame([], ['primary']));
    run(t, 30);
    expect(tower.hp).toBe(tower.maxHp - 1);
  });

  it('fire stops at land and rocks, from enemies and from the ship', () => {
    const g = hearty();
    g.bombIn = 999;
    const ts = g.tileSize;
    const p = g.player;
    // Land to the left of the start: fire from beyond it never gets through.
    const ty = Math.floor((p.y + p.h / 2) / ts);
    let tx = Math.floor(middle(p) / ts);
    while (!g.solid[ty * g.cols + tx]) tx--;
    const hearts = g.hearts;
    g.bombs = [{ x: (tx - 1) * ts, y: ty * ts + 6, w: 4, h: 4, vx: 75, vy: 0 }];
    run(g, 120);
    expect(g.bombs).toEqual([]);
    expect(g.hearts).toBe(hearts);
    g.flight.heading = -Math.PI / 2;
    stepGame(g, frame([], ['primary']));
    expect(g.shots).toHaveLength(1);
    run(g, 20);
    expect(g.shots).toEqual([]);
  });

  it('the shield takes hits first; a health bar loses less to small hits; the shield fills back up', () => {
    const g = quiet();
    g.bombIn = 999;
    expect([g.healthStyle, g.hearts, g.maxHearts, g.shield, g.maxShield]).toEqual(['bar', 60, 60, 40, 40]);
    const hit = () => {
      g.player.safe = 0;
      g.bombs = [{ x: g.player.x + 4, y: g.player.y + 4, w: 4, h: 4, vx: 0, vy: 0 }];
      stepGame(g, frame());
    };
    for (let i = 0; i < 4; i++) hit();
    expect([g.shield, g.hearts]).toEqual([0, 60]);
    hit();
    expect(g.hearts).toBe(50);
    // A big hit (touching an enemy) takes more.
    const e = g.enemies[0];
    g.player.safe = 0;
    e.x = g.player.x;
    e.y = g.player.y;
    stepGame(g, frame());
    expect(g.hearts).toBe(30);
    e.alive = false;
    // Not straight away; then it fills up.
    run(g, 60);
    expect(g.shield).toBe(0);
    // It waits 3 seconds, then takes 4 to fill.
    run(g, 60 * 6 + 5);
    expect(g.shield).toBe(40);
  });

  it('with hearts, the shield stops whole hits', () => {
    const g = quiet((p) => (p.player = { ...p.player, health: 'hearts', shield: true }));
    g.bombIn = 999;
    expect([g.hearts, g.shield]).toEqual([3, 2]);
    for (let i = 0; i < 3; i++) {
      g.player.safe = 0;
      g.bombs = [{ x: g.player.x + 4, y: g.player.y + 4, w: 4, h: 4, vx: 0, vy: 0 }];
      stepGame(g, frame());
    }
    expect([g.hearts, g.shield]).toEqual([2, 0]);
  });

  it('health and shield are saved with the game; unknown ones are not loaded', () => {
    const game = createShooterProject('Canal');
    const back = parseProject(JSON.stringify(game));
    if (!back.ok) throw new Error(back.errors.join());
    expect([back.project.player.health, back.project.player.shield]).toEqual(['bar', true]);
    const broken: any = JSON.parse(JSON.stringify(game));
    broken.player.health = 'stars';
    expect(parseProject(broken).ok).toBe(false);
    broken.player.health = 'hearts';
    broken.player.shield = 'yes';
    expect(parseProject(broken).ok).toBe(false);
  });

  it('a pilot who follows the water, turning and thrusting and firing ahead, reaches the finish line', () => {
    const g = quiet();
    const ts = g.tileSize;
    const d = distances(g);
    const clearance = landDistances(g);
    const tileOf = (x: number, y: number) => Math.floor(y / ts) * g.cols + Math.floor(x / ts);
    let steps = 0;
    while (g.status === 'playing' && steps++ < 60 * 300) {
      const p = g.player;
      const cx = middle(p);
      const cy = p.y + p.h / 2;
      // Head for the square a few squares nearer the finish.
      let i = tileOf(cx, cy);
      for (let k = 0; k < 4; k++) {
        const x = i % g.cols;
        const y = Math.floor(i / g.cols);
        // Nearer the finish, keeping to the middle of the water.
        const next = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1], [x + 1, y + 1], [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1]]
          .map(([nx, ny]) => ny * g.cols + nx)
          .filter((n) => d[n] < d[i])
          .sort((a, b) => clearance[b] - clearance[a] || d[a] - d[b]);
        if (next.length) i = next[0];
      }
      const tx = (i % g.cols) * ts + ts / 2;
      const ty = Math.floor(i / g.cols) * ts + ts / 2;
      // An enemy close by is the target instead.
      const clear = (ex: number, ey: number) => Array.from({ length: 12 }, (_, k) => k / 12).every((f) => !g.solid[tileOf(cx + (ex - cx) * f, cy + (ey - cy) * f)]);
      const enemy = g.enemies.find((e) => e.alive && Math.hypot(middle(e) - cx, e.y - cy) < 90 && clear(middle(e), e.y + e.h / 2));
      const aimX = enemy ? middle(enemy) : tx;
      const aimY = enemy ? enemy.y + enemy.h / 2 : ty;
      const want = Math.atan2(aimX - cx, -(aimY - cy));
      const off = Math.atan2(Math.sin(want - g.flight.heading), Math.cos(want - g.flight.heading));
      const held: Action[] = [];
      if (Math.abs(off) > 0.08) held.push(off > 0 ? 'right' : 'left');
      if (!enemy && Math.abs(off) < 0.5 && speedOf(g) < 55) held.push('up');
      if (enemy || speedOf(g) > 75 || Math.abs(off) > 1) held.push('down');
      stepGame(g, frame(held, enemy && Math.abs(off) < 0.15 && steps % 6 === 0 ? ['primary'] : []));
    }
    expect(g.status).toBe('won');
    expect(g.defeated).toBeGreaterThan(0);
  });
});
