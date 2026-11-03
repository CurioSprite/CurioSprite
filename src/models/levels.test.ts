import { describe, expect, it } from 'vitest';
import { createProject, createSprite } from './defaults';
import { addLevel, duplicateLevel, fromLevelView, levelView, moveLevel, removeLevel, renameLevel, setLevelPlay, setLevelRules } from './levels';
import { LIMITS, type Project, type Rule } from './project';
import { deleteSprite, placedCount, rolesOf } from './projectEdits';
import { parseProject, validateProject } from './serialization';

const made = (r: { ok: true; project: Project } | { ok: false; error: string }): Project => {
  if (!r.ok) throw new Error(r.error);
  return r.project;
};

/** A game with a run, a climb and a top-down level. */
function threeLevels(): Project {
  let p = createProject('Quest');
  p = made(addLevel(p, 'climb'));
  return made(addLevel(p, 'topdown'));
}

describe('levels', () => {
  it('new levels start from the matching starter, sharing the game’s sprites and enemies', () => {
    const p = threeLevels();
    expect(p.levels.map((l) => [l.name, l.mode, l.direction])).toEqual([
      ['Level 1', 'platformer', 'across'],
      ['Level 2', 'platformer', 'up'],
      ['Level 3', 'topdown', 'across'],
    ]);
    expect(new Set(p.levels.map((l) => l.solidSpriteId)).size).toBe(1);
    expect(p.levels[2].enemies).toEqual(p.levels[0].enemies);
    expect(validateProject(p).errors).toEqual([]);
  });

  it('each level is seen on its own: its level, view and win rule, with the game’s sprites', () => {
    const p = setLevelPlay(threeLevels(), 2, { winRule: 'enemies' });
    const v = levelView(p, 2);
    expect(v.level.id).toBe(p.levels[2].id);
    expect(v.settings).toMatchObject({ mode: 'topdown', winRule: 'enemies', battle: p.settings.battle, gravity: p.settings.gravity });
    expect(v.sprites).toBe(p.sprites);
    expect([v.levelIndex, v.levelCount]).toEqual([2, 3]);
    expect(levelView(p, 0).settings.winRule).toBe('goal');
  });

  it('rules: a level sees its own and the every-level ones; editing one level keeps the others', () => {
    let p = threeLevels();
    const [a, b] = p.levels;
    const everywhere: Rule = { id: 'all', when: { on: 'hurt' }, then: { do: 'message', text: 'Ouch' } };
    const onlyA: Rule = { id: 'a', when: { on: 'start' }, then: { do: 'message', text: 'A' }, levelId: a.id };
    const onlyB: Rule = { id: 'b', when: { on: 'start' }, then: { do: 'message', text: 'B' }, levelId: b.id };
    p = { ...p, rules: [everywhere, onlyA, onlyB] };
    expect(levelView(p, 0).rules.map((r) => r.id)).toEqual(['all', 'a']);
    expect(levelView(p, 1).rules.map((r) => r.id)).toEqual(['all', 'b']);
    // Level 1's rules edited: B's own rule stays.
    p = setLevelRules(p, 0, [everywhere]);
    expect(p.rules.map((r) => r.id).sort()).toEqual(['all', 'b']);
    // A view's changes go back where they belong.
    const v = levelView(p, 1);
    const back = fromLevelView(p, { ...v, settings: { ...v.settings, winRule: 'coins', battle: 'turns' } });
    expect(back.levels[1].winRule).toBe('coins');
    expect(back.settings.battle).toBe('turns');
    expect(back.levels[0].winRule).toBe('goal');
  });

  it('a copy gets new object ids, and its own rules point at the copies', () => {
    let p = createProject('t');
    const door = p.levels[0].objects[0];
    p = { ...p, rules: [{ id: 'r', when: { on: 'start' }, then: { do: 'hide', objectId: door.id }, levelId: p.levels[0].id }] };
    const r = duplicateLevel(p, 0);
    const q = made(r);
    const copy = q.levels[1];
    expect(copy.objects.map((o) => o.id)).not.toContain(door.id);
    const copied = q.rules.find((x) => x.levelId === copy.id)!;
    expect(copied.then).toEqual({ do: 'hide', objectId: copy.objects[0].id });
    expect(validateProject(q).errors).toEqual([]);
  });

  it('can be reordered, renamed and removed (taking their own rules), but a game keeps one', () => {
    let p = threeLevels();
    const ids = p.levels.map((l) => l.id);
    p = moveLevel(p, 2, 0);
    expect(p.levels.map((l) => l.id)).toEqual([ids[2], ids[0], ids[1]]);
    p = made(renameLevel(p, 0, '  The Maze '));
    expect(p.levels[0].name).toBe('The Maze');
    expect(renameLevel(p, 0, ' ').ok).toBe(false);
    p = { ...p, rules: [...p.rules, { id: 'mine', when: { on: 'start' }, then: { do: 'heal' }, levelId: ids[2] }] };
    p = made(removeLevel(p, 0));
    expect(p.levels).toHaveLength(2);
    expect(p.rules.some((r) => r.id === 'mine')).toBe(false);
    p = made(removeLevel(p, 0));
    expect(removeLevel(p, 0).ok).toBe(false);
  });

  it('stops at the most levels a game can have', () => {
    let p = createProject('t');
    while (p.levels.length < LIMITS.levelsMax) p = made(addLevel(p, 'platformer'));
    expect(addLevel(p, 'platformer').ok).toBe(false);
  });

  it('are saved and loaded, each with its own view', () => {
    const p = threeLevels();
    const back = parseProject(JSON.stringify(p));
    if (!back.ok) throw new Error(back.errors.join());
    expect(back.project.levels.map((l) => l.mode)).toEqual(['platformer', 'platformer', 'topdown']);
    const broken: any = JSON.parse(JSON.stringify(p));
    broken.rules.push({ id: 'x', when: { on: 'start' }, then: { do: 'heal' }, levelId: 'gone' });
    expect(parseProject(broken).ok).toBe(false);
  });

  it('a game saved before levels becomes one level; rules about its objects belong to it, the rest work everywhere', () => {
    const p = createProject('Old');
    const door = p.levels[0].objects[0];
    const raw: any = JSON.parse(JSON.stringify(p));
    raw.rules.push({ id: 'door', when: { on: 'start' }, then: { do: 'hide', objectId: door.id } });
    const { mode, direction: _d, winRule, ...level } = raw.levels[0];
    const v3 = { ...raw, schemaVersion: 3, level, settings: { ...raw.settings, mode, winRule } };
    delete v3.levels;
    const r = parseProject(v3);
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.project.levels).toHaveLength(1);
    expect(r.project.rules.find((x) => x.id === 'door')?.levelId).toBe(r.project.levels[0].id);
    expect(r.project.rules.filter((x) => x.id !== 'door').every((x) => !x.levelId)).toBe(true);
  });
});

describe('sprites across levels', () => {
  it('deleting a sprite clears it from every level; roles and counts look at every level', () => {
    let p = threeLevels();
    const crate = createSprite('Crate');
    p = { ...p, sprites: [...p.sprites, crate] };
    p = { ...p, levels: p.levels.map((l, i) => ({ ...l, objects: [...l.objects, { id: `c${i}`, kind: 'sprite' as const, spriteId: crate.id, x: 1, y: 1 }] })) };
    expect(placedCount(p, crate.id)).toBe(3);
    const gone = made(deleteSprite(p, crate.id));
    expect(gone.levels.every((l) => l.objects.every((o) => o.spriteId !== crate.id))).toBe(true);

    // A Block in only one level still counts as the game's Block.
    const q = { ...p, levels: p.levels.map((l, i) => (i === 2 ? { ...l, solidSpriteId: crate.id } : l)) };
    expect(rolesOf(q, crate.id)).toEqual(['solid']);
  });
});
