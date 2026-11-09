import { describe, expect, it } from 'vitest';
import { emptyActionState, type Action, type Stick } from '../input/bindings';
import type { InputFrame } from '../input/InputManager';
import { createProject } from '../models/defaults';
import { addLevel, levelView } from '../models/levels';
import type { LevelProject } from '../models/project';
import { createRacingProject } from '../models/racing';
import { parseProject, validateProject } from '../models/serialization';
import { RACE_COUNTDOWN, RACE_LAPS, createGame, placeName, racePlace, stepGame, type GameState } from './game';

function frame(held: Action[] = [], stick?: Stick): InputFrame {
  const f = { held: emptyActionState(), pressed: emptyActionState(), stick };
  for (const a of held) f.held[a] = true;
  return f;
}
const run = (g: GameState, steps: number, held: Action[] = [], stick?: Stick) => {
  for (let i = 0; i < steps; i++) stepGame(g, frame(held, stick));
};
const SECOND = 60;
const racing = (): LevelProject => levelView(createRacingProject('Speedway'), 0);
/** The starter race without its hello message, past the countdown. */
function underway(setup?: (p: LevelProject) => void) {
  const p = racing();
  p.rules = [];
  setup?.(p);
  const g = createGame(p);
  run(g, RACE_COUNTDOWN * SECOND + 1);
  return g;
}
const speedOf = (b: { vx: number; vy: number }) => Math.hypot(b.vx, b.vy);
const square = (g: GameState, b: { x: number; y: number; w: number; h: number }) => Math.floor((b.y + b.h / 2) / g.tileSize) * g.cols + Math.floor((b.x + b.w / 2) / g.tileSize);

/**
 * Drives from the seat: steers toward the furthest of the next few squares it
 * can see without crossing grass or hedge, and brakes (B) going into sharp turns.
 */
function driver(g: GameState): { stick: Stick; held: Action[] } {
  const r = g.race!;
  const ts = g.tileSize;
  const cx = g.player.x + g.player.w / 2;
  const cy = g.player.y + g.player.h / 2;
  const centre = (j: number) => ({ x: (j % g.cols) * ts + ts / 2, y: Math.floor(j / g.cols) * ts + ts / 2 });
  const blocked = (x: number, y: number) => {
    const j = Math.floor(y / ts) * g.cols + Math.floor(x / ts);
    return g.solid[j] === 1 || g.rough[j] === 1;
  };
  const seen = (t: { x: number; y: number }) =>
    Array.from({ length: 12 }, (_, k) => (k + 1) / 12).every((f) => [-5, 5].every((o) => !blocked(cx + (t.x - cx) * f + o, cy + (t.y - cy) * f + o)));
  let i = square(g, g.player);
  let target = centre(r.next[i] >= 0 ? r.next[i] : i);
  for (let k = 0; k < 7 && r.next[i] >= 0; k++) {
    i = r.next[i];
    if (k > 0 && !seen(centre(i))) break;
    target = centre(i);
  }
  const want = Math.atan2(target.x - cx, -(target.y - cy));
  const off = Math.atan2(Math.sin(want - g.flight.heading), Math.cos(want - g.flight.heading));
  const sharp = Math.abs(off) > 0.5 && speedOf(g.player) > 80;
  return { stick: { x: Math.max(-1, Math.min(1, off * 5)), y: sharp ? 0 : -1 }, held: sharp ? ['secondary'] : [] };
}

describe('the racing starter', () => {
  it('is a looping track with a finish line and three rival cars, the player at the back of the grid', () => {
    const game = createRacingProject('Speedway');
    expect(validateProject(game).errors).toEqual([]);
    const [level] = game.levels;
    expect([level.mode, level.winRule]).toEqual(['racing', 'goal']);
    expect(game.sprites.find((s) => s.id === game.player.spriteId)?.name).toBe('Race car');
    expect(game.player.attack).toBeUndefined();
    const g = createGame(levelView(game, 0));
    const r = g.race!;
    expect(r.rivals.map((c) => c.name)).toEqual(['Blue racer', 'Orange racer', 'Purple racer']);
    expect(g.enemies).toHaveLength(0);
    expect(r.laps).toBe(RACE_LAPS);
    // A real loop: a long way round, and the line all the way across.
    expect(r.lapLength).toBeGreaterThan(80);
    expect(r.line.reduce((a, b) => a + b, 0)).toBeGreaterThan(8);
    // Everyone points down the track.
    for (const c of r.rivals) expect(Math.abs(c.heading - Math.PI / 2)).toBeLessThan(0.8);
    expect(Math.abs(g.flight.heading - Math.PI / 2)).toBeLessThan(0.8);
    // Rivals ahead and beside on the grid.
    expect(racePlace(g)).toBeGreaterThanOrEqual(3);
  });

  it('can be added as a level to any game, and is saved and loaded', () => {
    const made = addLevel(createProject('Mix'), 'racing');
    if (!made.ok) throw new Error(made.error);
    expect(made.project.levels[1].mode).toBe('racing');
    const back = parseProject(JSON.stringify(made.project));
    if (!back.ok) throw new Error(back.errors.join());
    expect(back.project.levels[1].mode).toBe('racing');
  });
});

describe('a race', () => {
  it('waits for the countdown, then goes', () => {
    const p = racing();
    p.rules = [];
    const g = createGame(p);
    const { x, y } = g.player;
    const rival = { x: g.race!.rivals[0].x };
    run(g, (RACE_COUNTDOWN - 0.5) * SECOND, ['up']);
    expect([g.player.x, g.player.y]).toEqual([x, y]);
    expect(g.race!.rivals[0].x).toBe(rival.x);
    run(g, SECOND * 1.5, ['up']);
    expect(g.player.x).toBeGreaterThan(x + 10);
    expect(g.race!.rivals[0].x).toBeGreaterThan(rival.x + 10);
    expect(g.race!.clock).toBeGreaterThan(0.5);
  });

  it('↑ is the gas, ← → steer (quicker once going), and the car grips: it hardly slides sideways', () => {
    const g = underway();
    g.race!.rivals = [];
    g.flight.heading = Math.PI / 2;
    run(g, SECOND, ['up']);
    const fast = speedOf(g.player);
    expect(fast).toBeGreaterThan(80);
    expect(g.player.vx).toBeGreaterThan(Math.abs(g.player.vy) * 4);
    // Steer right (toward down the screen): the speed swings round with the car instead of carrying on sideways.
    run(g, 40, ['up', 'right']);
    expect(Math.atan2(Math.sin(g.flight.heading - Math.PI / 2), Math.cos(g.flight.heading - Math.PI / 2))).toBeGreaterThan(1);
    const side = g.player.vx * -Math.cos(g.flight.heading) + g.player.vy * -Math.sin(g.flight.heading);
    expect(Math.abs(side)).toBeLessThan(speedOf(g.player) * 0.35);
    // Standing still it only turns slowly.
    const h = underway();
    const before = h.flight.heading;
    run(h, 30, ['right']);
    expect(h.flight.heading - before).toBeLessThan(0.6);
    expect(h.flight.heading - before).toBeGreaterThan(0.1);
  });

  it('a joystick steers as far as it leans, and pushed up gives that much gas', () => {
    const a = underway();
    const b = underway();
    a.race!.rivals = [];
    b.race!.rivals = [];
    run(a, SECOND, [], { x: 0, y: -1 });
    run(b, SECOND, [], { x: 0, y: -0.4 });
    expect(speedOf(b.player)).toBeLessThan(speedOf(a.player) * 0.7);
    const startA = a.flight.heading;
    const startB = b.flight.heading;
    run(a, 20, [], { x: 1, y: -1 });
    run(b, 20, [], { x: 0.3, y: -1 });
    expect(b.flight.heading - startB).toBeLessThan((a.flight.heading - startA) * 0.6);
  });

  it('grass slows the car right down', () => {
    const g = underway();
    g.race!.rivals = [];
    g.rough.fill(1);
    run(g, SECOND * 2, ['up']);
    expect(speedOf(g.player)).toBeLessThanOrEqual(46);
    const h = underway();
    h.race!.rivals = [];
    h.flight.heading = Math.PI / 2;
    run(h, SECOND * 1.5, ['up']);
    expect(speedOf(h.player)).toBeGreaterThan(100);
  });

  it('↓ or B brakes, and once stopped, backs up slowly', () => {
    for (const brake of ['down', 'secondary'] as const) {
      const g = underway();
      g.race!.rivals = [];
      g.flight.heading = Math.PI / 2;
      run(g, SECOND, ['up']);
      const fast = speedOf(g.player);
      run(g, 20, [brake]);
      expect(speedOf(g.player)).toBeLessThan(fast * 0.5);
      run(g, SECOND * 2, [brake]);
      // Going backwards now (left, the other way to the way it points), but slowly.
      expect(g.player.vx).toBeLessThan(-10);
      expect(speedOf(g.player)).toBeLessThanOrEqual(41);
    }
  });

  it('warns when going the wrong way round', () => {
    const g = underway();
    g.race!.rivals = [];
    g.flight.heading = -Math.PI / 2;
    run(g, SECOND * 2, ['up']);
    expect(g.race!.wrongWay).toBeGreaterThan(1);
    g.flight.heading = Math.PI / 2;
    run(g, SECOND, ['up']);
    expect(g.race!.wrongWay).toBe(0);
  });

  it('bumping into cars and hedges never hurts', () => {
    const g = underway();
    const hearts = g.hearts;
    run(g, SECOND * 4, ['up', 'left']);
    run(g, SECOND * 2, ['up', 'right']);
    expect(g.hearts).toBe(hearts);
    expect(g.status).toBe('playing');
  });

  it('rival cars follow the road all the way round and finish the laps, in order', () => {
    const g = underway();
    let steps = 0;
    while (g.race!.rivals.some((c) => c.place === null) && steps++ < SECOND * 180) stepGame(g, frame());
    const places = g.race!.rivals.map((c) => c.place).sort();
    expect(places).toEqual([1, 2, 3]);
    for (const c of g.race!.rivals) expect(c.laps).toBe(RACE_LAPS);
    // Sitting still, the player is last, and hasn't won.
    expect(g.status).toBe('playing');
    expect(racePlace(g)).toBe(4);
  });

  it('going back and forth over the line does not count as laps', () => {
    const g = underway();
    g.race!.rivals = [];
    const line = g.race!.line;
    const lineSquare = line.indexOf(1);
    const ts = g.tileSize;
    for (let i = 0; i < 5; i++) {
      g.player.x = (lineSquare % g.cols) * ts + 2;
      g.player.y = Math.floor(lineSquare / g.cols) * ts + 2;
      run(g, 2);
      g.player.x += ts * 3;
      run(g, 2);
    }
    expect(g.race!.you.laps).toBe(0);
  });

  it('a driver who follows the road wins the race, lap by lap', () => {
    const p = racing();
    const g = createGame(p);
    const messages = new Set<string>();
    let steps = 0;
    let grass = 0;
    while (g.status === 'playing' && steps++ < SECOND * 240) {
      const d = driver(g);
      stepGame(g, frame(d.held, d.stick));
      if (g.rough[square(g, g.player)]) grass++;
      if (g.message) messages.add(g.message.text);
    }
    expect(g.status).toBe('won');
    expect(g.race!.you.laps).toBe(RACE_LAPS);
    expect(messages).toContain('Lap 2!');
    expect(messages).toContain('Final lap!');
    // The way on keeps to the road (the grass is slow)…
    expect(grass / steps).toBeLessThan(0.05);
    // …and the car is faster than the rivals, so from the back of the grid it wins.
    expect(racePlace(g)).toBe(1);
    expect(g.race!.clock).toBeLessThan(90);
  });

  it('names places', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(placeName)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd']);
  });
});
