import { describe, expect, it } from 'vitest';
import { createProject } from './defaults';
import { LIMITS } from './project';
import { addSprite, assignRole, deleteSprite, duplicateSprite, nextSpriteName, renameSprite, rolesOf } from './projectEdits';
import { validateProject } from './serialization';

describe('sprite list edits', () => {
  it('adds a blank sprite that keeps the project valid', () => {
    const p = createProject('t');
    const before = p.sprites.length;
    const r = addSprite(p, 'Dragon', 32);
    if (!r.ok) throw new Error(r.error);
    expect(r.project.sprites).toHaveLength(p.sprites.length + 1);
    const dragon = r.project.sprites.find((s) => s.id === r.spriteId)!;
    expect(dragon).toMatchObject({ name: 'Dragon', width: 32, height: 32 });
    expect(dragon.pixels.every((v) => v === 0)).toBe(true);
    expect(p.sprites).toHaveLength(before);
    expect(validateProject(r.project).errors).toEqual([]);
  });

  it('picks an unused default name', () => {
    expect(nextSpriteName([{ name: 'A' }, { name: 'Sprite 3' }])).toBe('Sprite 4');
  });

  it('stops at the sprite limit', () => {
    let p = createProject('t');
    while (p.sprites.length < LIMITS.spritesMax) {
      const r = addSprite(p, 'x');
      if (!r.ok) throw new Error(r.error);
      p = r.project;
    }
    expect(addSprite(p, 'one too many').ok).toBe(false);
  });

  it('duplicates a sprite next to the original with its own pixels', () => {
    const p = createProject('t');
    const r = duplicateSprite(p, p.sprites[0].id);
    if (!r.ok) throw new Error(r.error);
    expect(r.project.sprites[1].id).toBe(r.spriteId);
    expect(r.project.sprites[1].pixels).toEqual(p.sprites[0].pixels);
    expect(r.project.sprites[1].pixels).not.toBe(p.sprites[0].pixels);
  });

  it('renames, rejecting blank names', () => {
    const p = createProject('t');
    const r = renameSprite(p, p.sprites[0].id, '  Robo  ');
    expect(r.ok && r.project.sprites[0].name).toBe('Robo');
    expect(renameSprite(p, p.sprites[0].id, '   ').ok).toBe(false);
  });

  it('refuses to delete a sprite the game is using, then allows it once replaced', () => {
    const p = createProject('t');
    const heroId = p.player.spriteId;
    expect(deleteSprite(p, heroId).ok).toBe(false);

    const added = addSprite(p, 'New Hero');
    if (!added.ok) throw new Error(added.error);
    const swapped = assignRole(added.project, 'player', added.spriteId!);
    if (!swapped.ok) throw new Error(swapped.error);
    expect(rolesOf(swapped.project, heroId)).toEqual([]);

    const deleted = deleteSprite(swapped.project, heroId);
    if (!deleted.ok) throw new Error(deleted.error);
    expect(deleted.project.sprites.some((s) => s.id === heroId)).toBe(false);
    expect(validateProject(deleted.project).errors).toEqual([]);
  });

  it('deleting a sprite removes its placements and walk-through setting', () => {
    const p = createProject('t');
    const added = addSprite(p, 'Cloud');
    if (!added.ok) throw new Error(added.error);
    const id = added.spriteId!;
    const withCloud = {
      ...added.project,
      levels: [{ ...added.project.levels[0], objects: [{ id: 'cloud-1', kind: 'sprite' as const, spriteId: id, x: 3, y: 2 }], passThroughSpriteIds: [id] }],
    };
    const r = deleteSprite(withCloud, id);
    if (!r.ok) throw new Error(r.error);
    expect(r.project.levels[0].objects).toEqual([]);
    expect(r.project.levels[0].passThroughSpriteIds).toEqual([]);
    expect(validateProject(r.project).errors).toEqual([]);
  });

  it('deleting an enemy sprite removes its enemy settings and placements', () => {
    const p = createProject('t');
    const slime = p.levels[0].enemies[0].spriteId;
    const r = deleteSprite(p, slime);
    if (!r.ok) throw new Error(r.error);
    expect(r.project.levels[0].enemies).toEqual([]);
    expect(r.project.levels[0].objects.some((o) => o.spriteId === slime)).toBe(false);
    expect(validateProject(r.project).errors).toEqual([]);
  });

  it('deleting a sprite removes the rules that mention it', () => {
    const p = createProject('t');
    const added = addSprite(p, 'Key');
    if (!added.ok) throw new Error(added.error);
    const withRule = { ...added.project, rules: [...added.project.rules, { id: 'k', when: { on: 'touch' as const, spriteId: added.spriteId! }, then: { do: 'win' as const } }] };
    const r = deleteSprite(withRule, added.spriteId!);
    if (!r.ok) throw new Error(r.error);
    expect(r.project.rules.some((x) => x.id === 'k')).toBe(false);
    expect(r.project.rules).toHaveLength(p.rules.length);
  });

  it('assigns coin and ground roles', () => {
    const p = createProject('t');
    const heroId = p.player.spriteId;
    const r = assignRole(p, 'collectible', heroId);
    if (!r.ok) throw new Error(r.error);
    expect(r.project.levels[0].collectibleSpriteId).toBe(heroId);
    expect(rolesOf(r.project, heroId)).toEqual(['player', 'collectible']);
    expect(assignRole(p, 'solid', 'missing').ok).toBe(false);
  });

  it('assigns the goal role, which protects the sprite from deletion', () => {
    const p = createProject('t');
    const added = addSprite(p, 'Castle');
    if (!added.ok) throw new Error(added.error);
    const r = assignRole(added.project, 'goal', added.spriteId!);
    if (!r.ok) throw new Error(r.error);
    expect(r.project.levels[0].goalSpriteId).toBe(added.spriteId);
    expect(rolesOf(r.project, added.spriteId!)).toEqual(['goal']);
    expect(deleteSprite(r.project, added.spriteId!).ok).toBe(false);
  });
});
