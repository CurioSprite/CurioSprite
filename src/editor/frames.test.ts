import { describe, expect, it } from 'vitest';
import { createProject, createSprite } from '../models/defaults';
import { DEFAULT_LOOK, HEAD_SHAPES, buildHero, buildHeroWalk, readLook } from '../models/heroMaker';
import { LIMITS } from '../models/project';
import { applyHero } from '../models/projectEdits';
import { applyProfileHero, createProfile, readProfile } from '../models/profile';
import { parseProject, validateProject } from '../models/serialization';
import { activeFrame, activeImage, createEditorState, currentSprites, editorReducer, type EditorAction, type EditorState } from './editorState';
import { autoBounce, duplicateFrame, frameCount, frameOf, removeFrame, resizeAnimated, shiftImage } from './spriteOps';

const run = (s: EditorState, ...a: EditorAction[]) => a.reduce(editorReducer, s);
const dot = () => {
  const s = createSprite('Dot', 16);
  s.pixels[8 * 16 + 8] = 3;
  return s;
};

describe('animation frames', () => {
  it('copies, removes and caps frames', () => {
    let img = duplicateFrame(dot(), 0);
    expect(frameCount(img)).toBe(2);
    expect(frameOf(img, 1).pixels).toEqual(img.pixels);
    expect(frameOf(img, 1).pixels).not.toBe(img.pixels);
    while (frameCount(img) < LIMITS.framesMax) img = duplicateFrame(img, 0);
    expect(duplicateFrame(img, 0)).toBe(img);
    img = removeFrame(img, 0);
    expect(frameCount(img)).toBe(LIMITS.framesMax - 1);
    const single = dot();
    expect(removeFrame(single, 0)).toBe(single);
  });

  it('"Make it move" makes a bounce from the first frame', () => {
    const img = autoBounce(dot());
    expect(frameCount(img)).toBe(4);
    expect(frameOf(img, 1).pixels[7 * 16 + 8]).toBe(3);
    expect(frameOf(img, 2).pixels[6 * 16 + 8]).toBe(3);
    expect(shiftImage(frameOf(img, 0), 0, -1).pixels).toEqual(frameOf(img, 1).pixels);
  });

  it('resizing keeps every frame', () => {
    const big = resizeAnimated(autoBounce(dot()), 32);
    expect(big.width).toBe(32);
    expect(big.frames?.every((f) => f.length === 1024)).toBe(true);
  });

  it('the editor draws on the chosen frame only, and frame changes can be undone', () => {
    let s = createEditorState([dot()]);
    s = run(s, { type: 'addFrame' });
    expect(s.frame).toBe(1);
    s = run(s, { type: 'color', color: 5 }, { type: 'strokeBegin', x: 0, y: 0 }, { type: 'strokeEnd' });
    expect(activeFrame(s).pixels[0]).toBe(5);
    expect(frameOf(activeImage(s), 0).pixels[0]).toBe(0);
    s = run(s, { type: 'undo' }, { type: 'undo' });
    expect(frameCount(activeImage(s))).toBe(1);
    expect(s.frame).toBe(0);
    s = run(s, { type: 'autoAnimate' });
    expect(currentSprites(s)[0].frames).toHaveLength(3);
  });

  it('saves and loads frames, and rejects broken ones', () => {
    const p = createProject('t');
    p.sprites[1] = { ...p.sprites[1], ...autoBounce(p.sprites[1]) };
    const back = parseProject(JSON.stringify(p));
    expect(back.ok && back.project.sprites[1].frames).toHaveLength(3);
    const broken: any = JSON.parse(JSON.stringify(p));
    broken.sprites[1].frames = [[1, 2, 3]];
    expect(parseProject(broken).ok).toBe(false);
  });
});

describe('hero maker: heads, gear and walking', () => {
  it('every head shape builds, and they all look different', () => {
    const heads = HEAD_SHAPES.map((head) => buildHero({ ...DEFAULT_LOOK, head }).join());
    expect(new Set(heads).size).toBe(HEAD_SHAPES.length);
  });

  it('a helmet and a vest change the picture', () => {
    const plain = buildHero(DEFAULT_LOOK).join();
    expect(buildHero({ ...DEFAULT_LOOK, helmet: '#facc15' }).join()).not.toBe(plain);
    expect(buildHero({ ...DEFAULT_LOOK, vest: '#16a34a' }).join()).not.toBe(plain);
  });

  it('the walk is four frames: standing, a step, standing, the other step', () => {
    const [stand, a, stand2, b] = buildHeroWalk(DEFAULT_LOOK);
    expect(stand2).toEqual(stand);
    expect(a).not.toEqual(stand);
    expect(b).not.toEqual(a);
  });

  it('looks saved before heads and gear still load (as round, with none)', () => {
    const { head: _h, ...old } = DEFAULT_LOOK;
    expect(readLook(old)?.head).toBe('round');
    expect(readLook({ ...DEFAULT_LOOK, helmet: 99 })).toBeUndefined();
  });

  it('made heroes and profile heroes walk in the game', () => {
    const made = applyHero(createProject('t'), DEFAULT_LOOK, 'replace');
    if (!made.ok) throw new Error(made.error);
    const hero = made.project.sprites.find((s) => s.id === made.project.player.spriteId)!;
    expect(hero.frames).toHaveLength(3);
    expect(validateProject(made.project).errors).toEqual([]);

    const profile = readProfile(JSON.parse(JSON.stringify(createProfile('Maya', { ...DEFAULT_LOOK, vest: '#92400e' }))))!;
    expect(profile.hero.frames).toHaveLength(3);
    const game = applyProfileHero(createProject('t'), profile);
    expect(game.sprites.find((s) => s.id === game.player.spriteId)?.frames).toHaveLength(3);
  });
});
