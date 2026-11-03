import { describe, expect, it } from 'vitest';
import { createProject } from './defaults';
import { DEFAULT_LOOK } from './heroMaker';
import { applyProfileHero, createProfile, heroImage, readProfile, setProfileHeroFromSprite } from './profile';
import { validateProject } from './serialization';
import { MemoryProjectRepository } from '../storage/repository';

describe('player profiles', () => {
  it('a new player gets a hero made from their look', () => {
    const p = createProfile('  Maya ', { ...DEFAULT_LOOK, skin: '#4a2c17' });
    expect(p.name).toBe('Maya');
    expect(p.hero.size).toBe(16);
    expect(p.hero.colours).toHaveLength(256);
    expect(p.hero.colours).toContain('#4a2c17');
  });

  it("puts the player's hero into a new game, named after them, keeping the hero's id", () => {
    const project = createProject('t');
    const heroId = project.player.spriteId;
    const p = createProfile('Maya', { ...DEFAULT_LOOK, skin: '#4a2c17' });
    const game = applyProfileHero(project, p);
    const hero = game.sprites.find((s) => s.id === heroId)!;
    expect(hero.name).toBe('Maya');
    expect(game.player.spriteId).toBe(heroId);
    expect(game.palette).toContain('#4a2c17');
    expect(validateProject(game).errors).toEqual([]);
  });

  it('keeps a hero exactly as drawn in a game (32 × 32 too), and it comes back the same', () => {
    const project = createProject('t');
    const drawn = { width: 32 as const, height: 32 as const, pixels: Array.from({ length: 1024 }, (_, i) => (i % 3 === 0 ? 5 : 0)) };
    const p = setProfileHeroFromSprite(createProfile('Sam', DEFAULT_LOOK), drawn, project.palette);
    expect(p.hero.size).toBe(32);
    const { image, palette } = heroImage(p, project.palette);
    expect(image.pixels.map((v) => (v ? palette[v - 1] : null))).toEqual(drawn.pixels.map((v) => (v ? project.palette[v - 1] : null)));
  });

  it('ignores damaged stored profiles', () => {
    const good = createProfile('Ok', DEFAULT_LOOK);
    expect(readProfile(JSON.parse(JSON.stringify(good)))).toEqual(good);
    expect(readProfile({ ...good, name: '  ' })).toBeNull();
    expect(readProfile({ ...good, hero: { size: 16, colours: ['red'] } })).toBeNull();
    expect(readProfile({ ...good, look: { skin: 99 } })?.look).toBeUndefined();
  });

  it('are stored and listed oldest first, skipping damaged ones', async () => {
    const repo = new MemoryProjectRepository();
    const a = createProfile('A', DEFAULT_LOOK, new Date('2026-01-01'));
    const b = createProfile('B', DEFAULT_LOOK, new Date('2026-02-01'));
    await repo.saveProfile(b);
    await repo.saveProfile(a);
    await repo.saveProfile({ ...a, id: 'broken', name: '' });
    expect((await repo.listProfiles()).map((p) => p.name)).toEqual(['A', 'B']);
    await repo.removeProfile(a.id);
    expect((await repo.listProfiles()).map((p) => p.name)).toEqual(['B']);
  });
});
