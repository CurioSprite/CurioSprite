import { describe, expect, it } from 'vitest';
import { emptyActionState, type Action } from '../input/bindings';
import type { InputFrame } from '../input/InputManager';
import { createSprite } from '../models/defaults';
import { createLevelProject } from '../testing';
import { TILE, type LevelProject, type Rule, type RuleAction, type RuleTrigger } from '../models/project';
import { chooseBattle, createGame, goalOpen, stepGame, type GameState } from './game';

function frame(held: Action[] = []): InputFrame {
  const f = { held: emptyActionState(), pressed: emptyActionState() };
  for (const a of held) f.held[a] = true;
  return f;
}
const run = (g: GameState, steps: number, held: Action[] = []) => {
  for (let i = 0; i < steps; i++) stepGame(g, frame(held));
};

let n = 0;
const rule = (when: RuleTrigger, then: RuleAction): Rule => ({ id: `r${n++}`, when, then });

/**
 * A walled top-down corridor: player at (2,7). `row` places things on the
 * player's row by x: '*' treasure, 'G' goal, 'K' key, 'D' door (solid), 'S' slime.
 * Each object's id is `obj-<x>`, so rules can point at one of them.
 */
function corridor(row: Record<number, 'K' | 'D' | '*' | 'G' | 'S'>, rules: Rule[], setup?: (p: LevelProject) => void) {
  const p = createLevelProject('t', new Date(), 'topdown');
  const key = createSprite('Key');
  const door = createSprite('Door');
  p.sprites.push(key, door);
  const slime = p.level.enemies[0].spriteId;
  const { width, height } = p.level;
  const tiles = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x): string => (x === 0 || y === 0 || x === width - 1 || y === height - 1 ? TILE.solid : TILE.empty)));
  p.level.objects = Object.entries(row).map(([xs, what]) => {
    const x = Number(xs);
    const id = `obj-${x}`;
    if (what === '*') return { id, kind: 'treasure' as const, x, y: 7 };
    if (what === 'G') return { id, kind: 'goal' as const, x, y: 7 };
    return { id, kind: 'sprite' as const, spriteId: what === 'K' ? key.id : what === 'D' ? door.id : slime, x, y: 7 };
  });
  p.level.tiles = tiles.map((r) => r.join(''));
  p.level.playerStart = { x: 2, y: 7 };
  p.level.passThroughSpriteIds = [key.id];
  p.level.enemies = [{ spriteId: slime, hp: 1, moves: 'still' }];
  p.rules = rules.map((r) => JSON.parse(JSON.stringify(r).replace(/"KEY"/g, `"${key.id}"`).replace(/"DOOR"/g, `"${door.id}"`).replace(/"SLIME"/g, `"${slime}"`)));
  setup?.(p);
  return createGame(p);
}

describe('rules', () => {
  it('"the game starts" → show a message, which goes away after a few seconds', () => {
    const g = corridor({}, [rule({ on: 'start' }, { do: 'message', text: 'Hello!' })]);
    expect(g.message?.text).toBe('Hello!');
    run(g, 200);
    expect(g.message).toBeNull();
  });

  it('touching a key makes the key and the door disappear', () => {
    const g = corridor({ 4: 'K', 7: 'D' }, [
      rule({ on: 'touch', spriteId: 'KEY' }, { do: 'hide', spriteId: 'KEY' }),
      rule({ on: 'touch', spriteId: 'KEY' }, { do: 'hide', spriteId: 'DOOR' }),
    ]);
    expect(g.solid[7 * g.cols + 7]).toBe(1);
    run(g, 40, ['right']);
    expect(g.props.find((p) => p.x === 4)?.hidden).toBe(true);
    expect(g.solid[7 * g.cols + 7]).toBe(0);
    run(g, 60, ['right']);
    expect(g.player.x).toBeGreaterThan(7 * 16);
  });

  it('a door blocks the way when no rule opens it', () => {
    const g = corridor({ 7: 'D' }, []);
    run(g, 120, ['right']);
    expect(g.player.x).toBeLessThan(7 * 16);
  });

  it('"appear" sprites start hidden and arrive when the rule fires', () => {
    const g = corridor({ 4: '*', 10: 'D' }, [rule({ on: 'collect', count: 'each' }, { do: 'show', spriteId: 'DOOR' })]);
    expect(g.props[0].hidden).toBe(true);
    expect(g.solid[7 * g.cols + 10]).toBe(0);
    run(g, 40, ['right']);
    expect(g.collected).toBe(1);
    expect(g.props[0].hidden).toBe(false);
    expect(g.solid[7 * g.cols + 10]).toBe(1);
  });

  it('collecting a number of treasures opens a locked goal, and "the goal opens" fires', () => {
    const g = corridor(
      { 4: '*', 7: '*', 10: 'G' },
      [rule({ on: 'collect', count: 2 }, { do: 'openGoal' }), rule({ on: 'goalOpen' }, { do: 'message', text: 'Open!' })],
      (p) => (p.settings.winRule = 'goal'),
    );
    expect(goalOpen(g)).toBe(false);
    run(g, 30, ['right']);
    expect(g.collected).toBe(1);
    expect(goalOpen(g)).toBe(false);
    run(g, 30, ['right']);
    expect(g.collected).toBe(2);
    expect(goalOpen(g)).toBe(true);
    expect(g.message?.text).toBe('Open!');
    run(g, 60, ['right']);
    expect(g.status).toBe('won');
  });

  it('a locked goal does not win when touched', () => {
    const g = corridor({ 5: 'G' }, [rule({ on: 'collect', count: 'all' }, { do: 'openGoal' })], (p) => (p.settings.winRule = 'goal'));
    run(g, 60, ['right']);
    expect(g.status).toBe('playing');
    expect(g.atLockedGoal || g.player.x > 5 * 16).toBe(true);
  });

  it('"win the game" ends it as a win', () => {
    const g = corridor({ 4: 'K' }, [rule({ on: 'touch', spriteId: 'KEY' }, { do: 'win' })]);
    run(g, 40, ['right']);
    expect(g.status).toBe('won');
    expect(g.wonByRule).toBe(true);
  });

  it('losing a heart can give one back', () => {
    const g = corridor({ 3: 'S' }, [rule({ on: 'hurt' }, { do: 'message', text: 'Ouch' })], (p) => (p.settings.winRule = 'enemies'));
    run(g, 20, ['right']);
    expect(g.hearts).toBe(2);
    expect(g.message?.text).toBe('Ouch');

    const healed = corridor({ 3: 'S' }, [rule({ on: 'hurt' }, { do: 'heal' })]);
    run(healed, 20, ['right']);
    expect(healed.hearts).toBe(3);
  });

  it('enemies a rule removes no longer need beating', () => {
    const g = corridor({ 4: 'K', 12: 'S' }, [rule({ on: 'touch', spriteId: 'KEY' }, { do: 'hide', spriteId: 'SLIME' })], (p) => (p.settings.winRule = 'enemies'));
    run(g, 40, ['right']);
    expect(g.status).toBe('won');
  });

  it('"a Slime is beaten" fires for each one; "every Slime is beaten" waits for the last', () => {
    const g = corridor({ 5: 'S', 9: 'S', 12: 'K' }, [
      rule({ on: 'beat', count: 'each', spriteId: 'SLIME' }, { do: 'message', text: 'Got one' }),
      rule({ on: 'beat', count: 'all', spriteId: 'SLIME' }, { do: 'show', spriteId: 'KEY' }),
    ]);
    const key = g.props.find((p) => p.x === 12)!;
    expect(key.hidden).toBe(true);
    beatForTest(g, g.enemies[0]);
    expect(g.enemies[0].alive).toBe(false);
    expect(g.message?.text).toBe('Got one');
    expect(key.hidden).toBe(true);
    beatForTest(g, g.enemies[1]);
    expect(g.enemies[1].alive).toBe(false);
    expect(key.hidden).toBe(false);
  });

  it('one door can open while another of the same sprite stays shut', () => {
    const g = corridor({ 4: 'K', 7: 'D', 9: 'D' }, [rule({ on: 'touch', spriteId: 'KEY' }, { do: 'hide', objectId: 'obj-7' })]);
    run(g, 40, ['right']);
    expect(g.solid[7 * g.cols + 7]).toBe(0);
    expect(g.solid[7 * g.cols + 9]).toBe(1);
    run(g, 120, ['right']);
    expect(g.player.x).toBeLessThan(9 * 16);
  });

  it('a rule on one key only fires for that key', () => {
    const g = corridor({ 4: 'K', 8: 'K' }, [rule({ on: 'touch', objectId: 'obj-8' }, { do: 'message', text: 'Second key' })]);
    run(g, 40, ['right']);
    expect(g.message).toBeNull();
    run(g, 60, ['right']);
    expect(g.message?.text).toBe('Second key');
  });

  it('"this treasure is collected" fires for that treasure only', () => {
    const g = corridor({ 4: '*', 7: '*' }, [rule({ on: 'collect', count: 'each', objectId: 'obj-7' }, { do: 'message', text: 'The gold one!' })]);
    run(g, 30, ['right']);
    expect(g.collected).toBe(1);
    expect(g.message).toBeNull();
    run(g, 40, ['right']);
    expect(g.message?.text).toBe('The gold one!');
  });

  it('"this enemy is beaten" fires for that enemy only', () => {
    const g = corridor({ 5: 'S', 9: 'S', 12: 'K' }, [rule({ on: 'beat', count: 'each', objectId: 'obj-9' }, { do: 'show', objectId: 'obj-12' })]);
    const key = g.props.find((p) => p.id === 'obj-12')!;
    expect(key.hidden).toBe(true);
    beatForTest(g, g.enemies[0]);
    expect(key.hidden).toBe(true);
    beatForTest(g, g.enemies[1]);
    expect(key.hidden).toBe(false);
  });

  it('one enemy can move and take hits differently from the rest', () => {
    const g = corridor({ 6: 'S', 12: 'S' }, [], (p) => {
      p.level.objects[0].moves = 'chase';
      p.level.objects[0].hp = 5;
    });
    expect(g.enemies.map((e) => [e.moves, e.maxHp])).toEqual([['chase', 5], ['still', 1]]);
    const [chaser, sitter] = g.enemies.map((e) => e.x);
    run(g, 30);
    expect(g.enemies[0].x).toBeLessThan(chaser);
    expect(g.enemies[1].x).toBe(sitter);
  });

  it('treasure a rule makes disappear is no longer needed to collect it all', () => {
    const g = corridor({ 4: 'K', 6: '*', 20: '*' }, [rule({ on: 'touch', spriteId: 'KEY' }, { do: 'hide', objectId: 'obj-20' })], (p) => (p.settings.winRule = 'coins'));
    run(g, 60, ['right']);
    expect(g.collected).toBe(1);
    expect(g.status).toBe('won');
  });

  it('"the player attacks Key 1" fires once per swing, and touching it does not count', () => {
    const g = corridor({ 4: 'K' }, [rule({ on: 'hit', objectId: 'obj-4' }, { do: 'heal' })], (p) => (p.player.hearts = 9));
    g.hearts = 1;
    // Walk into the key (walk-through): that's a touch, not an attack.
    run(g, 40, ['right']);
    expect(g.hearts).toBe(1);
    // Face it and swing: one hit, however long the swing lasts.
    g.player.x = 4 * 16 - g.player.w - 2;
    g.player.face = { x: 1, y: 0 };
    const swing = frame();
    swing.pressed.primary = true;
    stepGame(g, swing);
    run(g, 20);
    expect(g.hearts).toBe(2);
    stepGame(g, swing);
    run(g, 20);
    expect(g.hearts).toBe(3);
  });

  it('"the player attacks a Slime" fires on every hit, not only the last', () => {
    const g = corridor({ 6: 'S' }, [rule({ on: 'hit', spriteId: 'SLIME' }, { do: 'message', text: 'Bonk' })], (p) => (p.level.enemies[0].hp = 3));
    const slime = g.enemies[0];
    g.player.x = slime.x - g.player.w - 2;
    g.player.y = slime.y;
    g.player.face = { x: 1, y: 0 };
    g.player.safe = 5;
    const swing = frame();
    swing.pressed.primary = true;
    stepGame(g, swing);
    expect(slime.hp).toBe(2);
    expect(g.message?.text).toBe('Bonk');
  });

  it('the Attack choice in a turn-based battle counts as attacking', () => {
    const g = corridor({ 3: 'S' }, [rule({ on: 'hit', objectId: 'obj-3' }, { do: 'message', text: 'Take that' })], (p) => {
      p.settings.battle = 'turns';
      p.level.enemies[0].hp = 3;
    });
    run(g, 20, ['right']);
    while (g.battle?.phase !== 'choose') stepGame(g, frame());
    chooseBattle(g, 'attack');
    expect(g.message?.text).toBe('Take that');
  });
});

/** Beats an enemy through a real attack, by standing next to it and pressing A. */
function beatForTest(g: GameState, e: GameState['enemies'][number]) {
  g.player.x = e.x - g.player.w - 2;
  g.player.y = e.y;
  g.player.face = { x: 1, y: 0 };
  g.player.safe = 5;
  e.hp = 1;
  e.hurt = 0;
  const f = frame();
  f.pressed.primary = true;
  stepGame(g, f);
}
