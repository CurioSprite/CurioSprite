import { describe, expect, it } from 'vitest';
import { emptyActionState, readGamepad, readGamepadStick, type Action } from '../input/bindings';
import type { InputFrame } from '../input/InputManager';
import { createLevelProject } from '../testing';
import { TILE, type WinRule } from '../models/project';
import type { BattleStyle, EnemyMoves, GameMode } from '../models/project';
import { chooseBattle, createGame, goalOpen, stepGame } from './game';

function frame(held: Action[] = [], pressed: Action[] = []): InputFrame {
  const f = { held: emptyActionState(), pressed: emptyActionState() };
  for (const a of held) f.held[a] = true;
  for (const a of pressed) f.pressed[a] = true;
  return f;
}

const run = (game: ReturnType<typeof createGame>, steps: number, f: InputFrame) => {
  for (let i = 0; i < steps; i++) stepGame(game, i === 0 ? f : { held: f.held, pressed: emptyActionState() });
};

describe('platformer runtime', () => {
  it('lands on the ground and stays there', () => {
    const game = createGame(createLevelProject('t'));
    run(game, 60, frame());
    expect(game.player.onGround).toBe(true);
    const y = game.player.y;
    run(game, 30, frame());
    expect(game.player.y).toBe(y);
  });

  it('moves right while held and jumps on A', () => {
    const game = createGame(createLevelProject('t'));
    run(game, 30, frame());
    const startX = game.player.x;
    run(game, 20, frame(['right']));
    expect(game.player.x).toBeGreaterThan(startX);
    const groundY = game.player.y;
    run(game, 10, frame(['primary'], ['primary']));
    expect(game.player.y).toBeLessThan(groundY - 16);
  });

  it('cannot walk through the left edge of the level', () => {
    const game = createGame(createLevelProject('t'));
    run(game, 120, frame(['left']));
    expect(game.player.x).toBe(0);
  });

  it('collects coins and wins when all are taken', () => {
    const project = createLevelProject('t');
    project.settings.winRule = 'coins';
    // One treasure on the row the player stands on, and nothing else.
    project.level.objects = [{ id: 't1', kind: 'treasure', x: 3, y: project.level.playerStart.y }];
    const game = createGame(project);
    expect(game.collectibles).toHaveLength(1);
    run(game, 90, frame(['right']));
    expect(game.collected).toBe(1);
    expect(game.status).toBe('won');
  });
});

describe('top-down runtime', () => {
  it('moves in four directions without gravity', () => {
    const project = createLevelProject('t');
    project.settings.mode = 'topdown';
    const game = createGame(project);
    const y = game.player.y;
    run(game, 30, frame());
    expect(game.player.y).toBe(y);
    run(game, 10, frame(['up']));
    expect(game.player.y).toBeLessThan(y);
  });
});

describe('gamepad mapping', () => {
  const pad = (pressed: number[], axes: number[] = [0, 0]) => ({
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })),
    axes,
  });

  it('maps standard buttons and the stick to actions', () => {
    const s = readGamepad(pad([0, 9], [-0.9, 0.1]));
    expect(s.primary).toBe(true);
    expect(s.start).toBe(true);
    expect(s.left).toBe(true);
    expect(s.down).toBe(false);
  });

  it('ignores stick drift inside the deadzone', () => {
    const s = readGamepad(pad([], [0.2, -0.3]));
    expect(Object.values(s).some(Boolean)).toBe(false);
    expect(readGamepadStick(pad([], [0.2, -0.3]))).toBeNull();
  });

  it('reads the exact way the stick is pushed', () => {
    expect(readGamepadStick(pad([], [0.6, -0.8]))).toEqual({ x: 0.6, y: -0.8 });
  });
});

describe('InputManager', () => {
  it('does not lose a key tapped between two polls', async () => {
    const { InputManager } = await import('../input/InputManager');
    const listeners: Record<string, (e: unknown) => void> = {};
    const fakeWindow = { addEventListener: (t: string, f: (e: unknown) => void) => (listeners[t] = f), removeEventListener: () => {} };
    const input = new InputManager();
    input.attach(fakeWindow as unknown as Window);
    input.poll();
    const key = { code: 'Escape', repeat: false, preventDefault: () => {} };
    listeners.keydown(key);
    listeners.keyup(key);
    expect(input.poll().pressed.home).toBe(true);
    expect(input.poll().pressed.home).toBe(false);
  });

  it('passes on the on-screen joystick\'s exact way until it is let go', async () => {
    const { InputManager } = await import('../input/InputManager');
    const input = new InputManager();
    expect(input.poll().stick).toBeNull();
    input.setVirtualStick({ x: 0.5, y: -0.5 });
    expect(input.poll().stick).toEqual({ x: 0.5, y: -0.5 });
    input.setVirtualStick(null);
    expect(input.poll().stick).toBeNull();
  });
});

describe('placed sprites', () => {
  /** A level with no ground at all, just a row of the given sprite under the player. */
  function floatingFloor(passThrough: boolean) {
    const project = createLevelProject('t');
    const brick = project.sprites[0].id;
    const { width, height, playerStart } = project.level;
    project.level.tiles = Array(height).fill('.'.repeat(width));
    project.level.objects = Array.from({ length: 8 }, (_, x) => ({ id: `b${x}`, kind: 'sprite' as const, spriteId: brick, x, y: playerStart.y + 1 }));
    project.level.passThroughSpriteIds = passThrough ? [brick] : [];
    return createGame(project);
  }

  it('are solid ground by default, whatever they look like', () => {
    const game = floatingFloor(false);
    run(game, 90, frame());
    expect(game.player.onGround).toBe(true);
    expect(game.falls).toBe(0);
  });

  it('can be made walk-through', () => {
    const game = floatingFloor(true);
    run(game, 120, frame());
    expect(game.falls).toBeGreaterThan(0);
  });
});

describe('win rules', () => {
  /** A flat floor with a coin at x=3 and a goal at x=6 on the player's row (start at x=1). */
  function course(winRule: WinRule, coinX = 3, goalX = 6) {
    const project = createLevelProject('t');
    const { width, height, playerStart } = project.level;
    const tiles = Array.from({ length: height }, () => TILE.empty.repeat(width).split(''));
    tiles[playerStart.y + 1].fill(TILE.solid);
    project.level.tiles = tiles.map((r) => r.join(''));
    project.level.objects = [
      ...(coinX >= 0 ? [{ id: 'coin', kind: 'treasure' as const, x: coinX, y: playerStart.y }] : []),
      { id: 'goal', kind: 'goal' as const, x: goalX, y: playerStart.y },
    ];
    project.settings.winRule = winRule;
    return createGame(project);
  }

  it('"goal": wins on touching the goal, coins are a bonus', () => {
    const game = course('goal', -1);
    run(game, 60, frame(['right']));
    expect(game.status).toBe('won');
  });

  it('"coins": ignores the goal until every coin is taken', () => {
    const game = course('coins', 12);
    run(game, 75, frame(['right']));
    expect(game.player.x).toBeGreaterThan(6 * 16);
    expect(game.status).toBe('playing');
    run(game, 60, frame(['right']));
    expect(game.status).toBe('won');
  });

  it('"coinsThenGoal": the goal is locked until every coin is taken', () => {
    const locked = course('coinsThenGoal', 12);
    expect(goalOpen(locked)).toBe(false);
    let sawLocked = false;
    for (let i = 0; i < 75; i++) {
      stepGame(locked, frame(['right']));
      sawLocked ||= locked.atLockedGoal;
    }
    expect(sawLocked).toBe(true);
    expect(locked.status).toBe('playing');

    const open = course('coinsThenGoal', 3);
    run(open, 60, frame(['right']));
    expect(open.collected).toBe(1);
    expect(open.status).toBe('won');
  });
});

describe('battles', () => {
  /**
   * An open arena (walled in top-down, a floor in side view) with the player at
   * (2, 7) and one enemy at `enemyX` on the same row.
   */
  function arena(opts: { mode?: GameMode; battle?: BattleStyle; moves?: EnemyMoves; hp?: number; enemyX?: number; hearts?: number }) {
    const { mode = 'topdown', battle = 'action', moves = 'still', hp = 1, enemyX = 5, hearts = 3 } = opts;
    const project = createLevelProject('t', new Date(), mode);
    const { width, height } = project.level;
    const slime = project.level.enemies[0].spriteId;
    const tiles = Array.from({ length: height }, (_, y) =>
      Array.from({ length: width }, (_, x) => (x === 0 || x === width - 1 || y === 0 || y === height - 1 || (mode === 'platformer' && y === 8) ? TILE.solid : TILE.empty)).join(''),
    );
    project.level.tiles = tiles;
    project.level.playerStart = { x: 2, y: 7 };
    project.level.objects = [{ id: 'enemy', kind: 'sprite', spriteId: slime, x: enemyX, y: 7 }];
    project.level.enemies = [{ spriteId: slime, hp, moves }];
    project.settings = { ...project.settings, mode, battle, winRule: 'enemies' };
    project.player.hearts = hearts;
    return createGame(project);
  }

  it('action, top-down: A attacks the way you face and beats the enemy', () => {
    const game = arena({ hp: 2, enemyX: 4 });
    run(game, 10, frame(['right']));
    stepGame(game, frame([], ['primary']));
    run(game, 30, frame());
    expect(game.enemies[0].hp).toBe(1);
    // It was knocked back; walk up to it again.
    run(game, 18, frame(['right']));
    stepGame(game, frame([], ['primary']));
    run(game, 20, frame());
    expect(game.enemies[0].alive).toBe(false);
    expect(game.status).toBe('won');
  });

  it('action, side view: B attacks (A still jumps)', () => {
    const game = arena({ mode: 'platformer', enemyX: 3 });
    run(game, 30, frame());
    stepGame(game, frame(['right'], ['secondary']));
    run(game, 20, frame());
    expect(game.defeated).toBe(1);
  });

  it('touching an enemy costs a heart, then you are safe for a moment', () => {
    const game = arena({ enemyX: 3, hearts: 3 });
    run(game, 20, frame(['right']));
    expect(game.hearts).toBe(2);
    expect(game.player.safe).toBeGreaterThan(0);
  });

  it('running out of hearts loses the game', () => {
    const game = arena({ enemyX: 3, hearts: 1, hp: 9 });
    run(game, 20, frame(['right']));
    expect(game.hearts).toBe(0);
    expect(game.status).toBe('lost');
  });

  it('chasing enemies come after the player', () => {
    const game = arena({ moves: 'chase', enemyX: 7 });
    const startX = game.enemies[0].x;
    run(game, 30, frame());
    expect(game.enemies[0].x).toBeLessThan(startX);
  });

  it('patrolling enemies turn around at ledges in side view', () => {
    const project = createLevelProject('t', new Date(), 'platformer');
    const { width, height } = project.level;
    const slime = project.level.enemies[0].spriteId;
    // A 5-block platform the enemy walks along.
    project.level.tiles = Array.from({ length: height }, (_, y) => (y === 10 ? '.'.repeat(10) + '#'.repeat(5) + '.'.repeat(width - 15) : '.'.repeat(width)));
    project.level.objects = [{ id: 'enemy', kind: 'sprite', spriteId: slime, x: 12, y: 9 }];
    project.level.enemies = [{ spriteId: slime, hp: 1, moves: 'patrol' }];
    project.level.playerStart = { x: 1, y: 1 };
    const game = createGame(project);
    for (let i = 0; i < 600; i++) {
      stepGame(game, frame());
      // The player falls off the world; keep it out of the way.
      game.player.y = 0;
    }
    expect(game.enemies[0].alive).toBe(true);
    expect(game.enemies[0].x).toBeGreaterThanOrEqual(10 * 16 - 1);
    expect(game.enemies[0].x).toBeLessThanOrEqual(15 * 16 - 12 + 1);
  });

  it('turn-based: bumping an enemy starts a battle; attacking wins it', () => {
    const game = arena({ battle: 'turns', enemyX: 3, hp: 2 });
    run(game, 20, frame(['right']));
    expect(game.battle).not.toBeNull();
    const startX = game.player.x;
    // Pass messages and attack until the battle ends.
    for (let i = 0; i < 2000 && game.battle; i++) {
      if (game.battle.phase === 'choose') chooseBattle(game, 'attack');
      stepGame(game, frame());
    }
    expect(game.player.x).toBe(startX);
    expect(game.battle).toBeNull();
    expect(game.enemies[0].alive).toBe(false);
    expect(game.status).toBe('won');
  });

  it('turn-based: defend blocks the next attack and powers up your hit', () => {
    const game = arena({ battle: 'turns', enemyX: 3, hp: 2, hearts: 1 });
    run(game, 20, frame(['right']));
    while (game.battle?.phase !== 'choose') stepGame(game, frame());
    chooseBattle(game, 'defend');
    while (game.battle?.phase !== 'choose') stepGame(game, frame());
    expect(game.hearts).toBe(1);
    chooseBattle(game, 'attack');
    expect(game.enemies[0].hp).toBe(0);
  });

  it('turn-based: running away ends the battle without beating the enemy', () => {
    const game = arena({ battle: 'turns', enemyX: 3 });
    run(game, 20, frame(['right']));
    while (game.battle?.phase !== 'choose') stepGame(game, frame());
    chooseBattle(game, 'run');
    for (let i = 0; i < 120 && game.battle; i++) stepGame(game, frame());
    expect(game.battle).toBeNull();
    expect(game.enemies[0].alive).toBe(true);
    expect(game.player.safe).toBeGreaterThan(0);
  });

  it('turn-based: keyboard picks a choice with arrows and A', () => {
    const game = arena({ battle: 'turns', enemyX: 3 });
    run(game, 20, frame(['right']));
    while (game.battle?.phase !== 'choose') stepGame(game, frame());
    stepGame(game, frame([], ['right']));
    expect(game.battle?.choice).toBe(1);
    stepGame(game, frame([], ['primary']));
    expect(game.battle?.message).toMatch(/get ready/);
  });
});

describe('placed Coin and Flag sprites', () => {
  it('act as coins and goals in the game', () => {
    const project = createLevelProject('t', new Date(), 'topdown');
    const before = createGame(project);
    project.level.objects.push(
      { id: 'c', kind: 'sprite', spriteId: project.level.collectibleSpriteId, x: 5, y: 5 },
      { id: 'g', kind: 'sprite', spriteId: project.level.goalSpriteId, x: 6, y: 5 },
    );
    const game = createGame(project);
    expect(game.collectibles).toHaveLength(before.collectibles.length + 1);
    expect(game.goals).toHaveLength(before.goals.length + 1);
    expect(game.solid[5 * game.cols + 5]).toBe(0);
    expect(game.solid[5 * game.cols + 6]).toBe(0);
  });
});
