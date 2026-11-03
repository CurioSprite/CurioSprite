import { describe, expect, it } from 'vitest';
import { createProject } from './defaults';
import { DEFAULT_LOOK, HAIR_STYLES, buildHero, randomLook, readLook, toPalettePixels } from './heroMaker';
import { LIMITS } from './project';
import { applyHero } from './projectEdits';
import { parseProject, validateProject } from './serialization';

describe('hero maker', () => {
  it('builds a full 16 × 16 hero for every hair style, and each style looks different', () => {
    const pictures = HAIR_STYLES.map((hairStyle) => buildHero({ ...DEFAULT_LOOK, hairStyle }).join(','));
    for (const p of pictures) expect(p.split(',')).toHaveLength(256);
    expect(new Set(pictures).size).toBe(HAIR_STYLES.length);
  });

  it('uses the chosen skin tone and adds glasses', () => {
    const plain = buildHero({ ...DEFAULT_LOOK, skin: '#7a4a26' });
    expect(plain).toContain('#7a4a26');
    expect(buildHero({ ...DEFAULT_LOOK, skin: '#7a4a26', glasses: true })).not.toEqual(plain);
  });

  it('adds new colours to the palette once, and reuses ones it already has', () => {
    const palette = ['#1a1c2c', '#ef4444'];
    const { pixels, palette: next } = toPalettePixels(['#1a1c2c', null, '#123456', '#123456'], palette);
    expect(pixels).toEqual([1, 0, 3, 3]);
    expect(next).toEqual(['#1a1c2c', '#ef4444', '#123456']);
  });

  it('uses the nearest colour when the palette is full', () => {
    const full = Array.from({ length: LIMITS.paletteMax }, (_, i) => (i === 7 ? '#ff0000' : '#000000'));
    const { pixels, palette } = toPalettePixels(['#fe0101'], full);
    expect(pixels).toEqual([8]);
    expect(palette).toHaveLength(LIMITS.paletteMax);
  });

  it('makes a valid random look', () => {
    let seed = 1;
    const look = randomLook(() => ((seed = (seed * 16807) % 2147483647) / 2147483647));
    expect(readLook(look)).toEqual(look);
  });
});

describe('applying a made hero', () => {
  it('"Use as my hero" redraws the hero, keeping its id, rules and placements', () => {
    const p = createProject('t');
    const heroId = p.player.spriteId;
    const r = applyHero(p, { ...DEFAULT_LOOK, skin: '#4a2c17' }, 'replace');
    if (!r.ok) throw new Error(r.error);
    const hero = r.project.sprites.find((s) => s.id === heroId)!;
    expect(r.project.player.spriteId).toBe(heroId);
    expect(r.project.player.look?.skin).toBe('#4a2c17');
    expect(hero.width).toBe(16);
    expect(r.project.palette).toContain('#4a2c17');
    expect(validateProject(r.project).errors).toEqual([]);
  });

  it('"Keep the old hero too" adds a new sprite and makes it the Player', () => {
    const p = createProject('t');
    const oldHero = p.player.spriteId;
    const r = applyHero(p, DEFAULT_LOOK, 'new', 'Me');
    if (!r.ok) throw new Error(r.error);
    expect(r.project.sprites).toHaveLength(p.sprites.length + 1);
    expect(r.project.player.spriteId).toBe(r.spriteId);
    expect(r.project.sprites.find((s) => s.id === r.spriteId)?.name).toBe('Me');
    expect(r.project.sprites.some((s) => s.id === oldHero)).toBe(true);
    expect(validateProject(r.project).errors).toEqual([]);
  });

  it('remembers the look when saved, and ignores a broken one', () => {
    const r = applyHero(createProject('t'), { ...DEFAULT_LOOK, hairStyle: 'curly' }, 'replace');
    if (!r.ok) throw new Error(r.error);
    const again = parseProject(JSON.stringify(r.project));
    expect(again.ok && again.project.player.look?.hairStyle).toBe('curly');
    const broken: any = JSON.parse(JSON.stringify(r.project));
    broken.player.look = { skin: 99 };
    const loaded = parseProject(broken);
    expect(loaded.ok && loaded.project.player.look).toBeUndefined();
  });
});
