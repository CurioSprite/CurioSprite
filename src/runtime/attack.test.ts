import { describe, expect, it } from 'vitest';
import { emptyActionState, type Action } from '../input/bindings';
import type { InputFrame } from '../input/InputManager';
import { ATTACK_STARTERS, attackColours } from '../models/attacks';
import { createProject, createSprite } from '../models/defaults';
import { createLevelProject } from '../testing';
import { TILE, type AttackKind, type LevelProject } from '../models/project';
import { deleteSprite, rolesOf, setAttackKind, setAttackStarter } from '../models/projectEdits';
import { parseProject, validateProject } from '../models/serialization';
import { createGame, stepGame, type GameState } from './game';

function frame(pressed: Action[] = []): InputFrame {
  const f = { held: emptyActionState(), pressed: emptyActionState() };
  for (const a of pressed) f.pressed[a] = f.held[a] = true;
  return f;
}
const run = (g: GameState, steps: number) => {
  for (let i = 0; i < steps; i++) stepGame(g, frame());
};
/** Top-down Action games attack with A (primary). */
const attack = (g: GameState) => stepGame(g, frame(['primary']));

/**
 * A walled top-down corridor with the player at (2,7) facing right. `row`
 * places things on that row: 'S' a slime (1 hit), 'C' a walk-through crate, 'D' a solid door.
 */
function corridor(kind: AttackKind, row: Record<number, 'S' | 'C' | 'D'>, setup?: (p: LevelProject) => void) {
  const p = createLevelProject('t', new Date(), 'topdown');
  const crate = createSprite('Crate');
  const door = createSprite('Door');
  p.sprites.push(crate, door);
  const slime = p.level.enemies[0].spriteId;
  const { width, height } = p.level;
  p.level.tiles = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => (x === 0 || y === 0 || x === width - 1 || y === height - 1 ? TILE.solid : TILE.empty)).join(''));
  p.level.objects = Object.entries(row).map(([xs, what]) => ({ id: `obj-${xs}`, kind: 'sprite' as const, spriteId: what === 'S' ? slime : what === 'C' ? crate.id : door.id, x: Number(xs), y: 7 }));
  p.level.playerStart = { x: 2, y: 7 };
  p.level.passThroughSpriteIds = [crate.id];
  p.level.enemies = [{ spriteId: slime, hp: 1, moves: 'still' }];
  p.player.attack = { ...p.player.attack!, kind };
  setup?.(p);
  return { game: createGame(p) };
}

describe('thrown attacks', () => {
  it('fly from the hero and beat an enemy far away (a swing would not reach)', () => {
    const swing = corridor('swing', { 8: 'S' }).game;
    attack(swing);
    run(swing, 60);
    expect(swing.defeated).toBe(0);

    const thrown = corridor('throw', { 8: 'S' }).game;
    attack(thrown);
    expect(thrown.shots).toHaveLength(1);
    expect(thrown.shots[0].dir).toEqual({ x: 1, y: 0 });
    run(thrown, 60);
    expect(thrown.defeated).toBe(1);
    expect(thrown.shots).toHaveLength(0);
  });

  it('stop at walls and solid sprites, and fire "attacks" rules for what they pass through', () => {
    const { game } = corridor('throw', { 5: 'C', 7: 'D', 9: 'S' }, (p) => {
      p.rules = [
        { id: 'a', when: { on: 'hit', spriteId: p.sprites.find((s) => s.name === 'Crate')!.id }, then: { do: 'message', text: 'crate' } },
        { id: 'b', when: { on: 'hit', spriteId: p.sprites.find((s) => s.name === 'Door')!.id }, then: { do: 'message', text: 'door' } },
      ];
    });
    attack(game);
    run(game, 20);
    expect(game.message?.text).toBe('door');
    expect(game.shots).toHaveLength(0);
    // The slime behind the door is safe.
    run(game, 60);
    expect(game.defeated).toBe(0);
  });

  it('run out after a while, and only a few fly at once', () => {
    const { game } = corridor('throw', {});
    for (let i = 0; i < 10; i++) {
      attack(game);
      run(game, 3);
    }
    expect(game.shots.length).toBeLessThanOrEqual(3);
    run(game, 120);
    expect(game.shots).toHaveLength(0);
  });
});

describe('the attack sprite', () => {
  it('new games start with a sword that swings', () => {
    const p = createProject('t');
    const sword = p.sprites.find((s) => s.id === p.player.attack?.spriteId);
    expect(sword?.name).toBe('Sword');
    expect(sword?.frames?.length).toBeGreaterThan(0);
    expect(p.player.attack?.kind).toBe('swing');
    expect(rolesOf(p, sword!.id)).toEqual(['attack']);
    expect(deleteSprite(p, sword!.id).ok).toBe(false);
  });

  it('every starter is a full picture; picking one redraws the attack (same id) and sets how it works', () => {
    for (const a of ATTACK_STARTERS) for (const f of attackColours(a)) expect(f).toHaveLength(256);
    const p = createProject('t');
    const id = p.player.attack!.spriteId;
    const r = setAttackStarter(p, 'fireball');
    if (!r.ok) throw new Error(r.error);
    expect(r.project.player.attack).toEqual({ spriteId: id, kind: 'throw' });
    expect(r.project.sprites.find((s) => s.id === id)?.name).toBe('Fireball');
    expect(validateProject(r.project).errors).toEqual([]);
    expect(setAttackKind(r.project, 'swing').player.attack?.kind).toBe('swing');
  });

  it('a game without an attack gets one when a starter is picked', () => {
    const p = createProject('t');
    delete p.player.attack;
    const r = setAttackStarter(p, 'magic');
    if (!r.ok) throw new Error(r.error);
    expect(r.project.sprites).toHaveLength(p.sprites.length + 1);
    expect(r.project.player.attack?.kind).toBe('throw');
  });

  it('is saved and loaded; older games get the starter sword', () => {
    const p = createProject('t');
    const thrown = setAttackKind(p, 'throw');
    const back = parseProject(JSON.stringify(thrown));
    expect(back.ok && back.project.player.attack).toEqual(thrown.player.attack);

    const old: any = JSON.parse(JSON.stringify(p));
    old.sprites = old.sprites.filter((s: { id: string }) => s.id !== p.player.attack!.spriteId);
    delete old.player.attack;
    const upgraded = parseProject(old);
    if (!upgraded.ok) throw new Error(upgraded.errors.join());
    expect(upgraded.project.player.attack).toEqual({ spriteId: 'starter-attack', kind: 'swing' });
    expect(upgraded.project.sprites.find((s) => s.id === 'starter-attack')?.name).toBe('Sword');

    const broken: any = JSON.parse(JSON.stringify(p));
    broken.player.attack.kind = 'laser';
    expect(parseProject(broken).ok).toBe(false);
  });
});
