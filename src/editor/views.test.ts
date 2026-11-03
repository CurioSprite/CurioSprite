import { describe, expect, it } from 'vitest';
import { createProject } from '../models/defaults';
import { DEFAULT_LOOK, HAIR_STYLES, HEAD_SHAPES, buildHero, buildHeroViews, readLook } from '../models/heroMaker';
import { applyProfileHero, createProfile, readProfile, setProfileHeroFromSprite } from '../models/profile';
import type { AnimatedImage, Sprite } from '../models/project';
import { applyHero } from '../models/projectEdits';
import { parseProject } from '../models/serialization';
import { activeFrame, activeImage, createEditorState, currentSprites, editorReducer, type EditorAction, type EditorState } from './editorState';
import { addView, frameCount, pickView, resizeAnimated, restingImage, viewOf, withView } from './spriteOps';

const blank = (): AnimatedImage => ({ width: 16, height: 16, pixels: new Array(256).fill(0) });
const run = (s: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, s);

describe('hero views', () => {
  it('the made hero walks from the front, the back and the side, and each looks different', () => {
    const views = buildHeroViews(DEFAULT_LOOK);
    for (const f of ['front', 'back', 'side'] as const) expect(views[f]).toHaveLength(4);
    expect(views.back[0]).not.toEqual(views.front[0]);
    expect(views.side[0]).not.toEqual(views.front[0]);
    expect(views.side[1]).not.toEqual(views.side[0]);
  });

  it('every head, hair style and piece of gear builds from every side', () => {
    for (const facing of ['front', 'back', 'side'] as const) {
      for (const head of HEAD_SHAPES) {
        for (const hairStyle of HAIR_STYLES) {
          const picture = buildHero({ ...DEFAULT_LOOK, head, hairStyle, glasses: true, helmet: '#94a3b8', vest: '#92400e' }, 'stepA', facing);
          expect(picture).toHaveLength(256);
        }
      }
    }
  });

  it('the face only shows from the front and the side', () => {
    const eyes = '#16a34a';
    const look = { ...DEFAULT_LOOK, eyes };
    expect(buildHero(look, 'stand', 'front')).toContain(eyes);
    expect(buildHero(look, 'stand', 'side')).toContain(eyes);
    expect(buildHero(look, 'stand', 'back')).not.toContain(eyes);
  });

  it('every part takes any colour from the one shared set', () => {
    const pink = '#ec4899';
    for (const part of ['skin', 'hair', 'shirt', 'legs'] as const) expect(buildHero({ ...DEFAULT_LOOK, [part]: pink })).toContain(pink);
    expect(buildHero({ ...DEFAULT_LOOK, helmet: pink })).toContain(pink);
  });

  it('looks saved with the old per-part colour lists come back as the colours they meant', () => {
    const old = { head: 'round', skin: 5, hairStyle: 'short', hair: 6, eyes: 2, shirt: 7, legs: 1, glasses: false, helmet: 0 };
    expect(readLook(old)).toEqual({ ...old, skin: '#4a2c17', hair: '#ec4899', eyes: '#2563eb', shirt: '#8b5cf6', legs: '#475569', helmet: '#94a3b8' });
    expect(readLook({ ...DEFAULT_LOOK, skin: 'pink' })).toBeUndefined();
  });

  it('a made hero gets all three views, saved and loaded', () => {
    const made = applyHero(createProject('t'), DEFAULT_LOOK, 'replace');
    if (!made.ok) throw new Error(made.error);
    const hero = made.project.sprites.find((s) => s.id === made.project.player.spriteId)!;
    expect(hero.back).toHaveLength(4);
    expect(hero.side).toHaveLength(4);
    const back = parseProject(JSON.stringify(made.project));
    if (!back.ok) throw new Error(back.errors.join());
    expect(back.project.sprites.find((s) => s.id === hero.id)?.side).toEqual(hero.side);
  });

  it('rejects broken views', () => {
    const made = applyHero(createProject('t'), DEFAULT_LOOK, 'replace');
    if (!made.ok) throw new Error(made.error);
    const broken: any = JSON.parse(JSON.stringify(made.project));
    broken.sprites.find((s: Sprite) => s.id === made.project.player.spriteId).side = [[1, 2]];
    expect(parseProject(broken).ok).toBe(false);
  });

  it("a player's hero keeps its views from game to game", () => {
    const profile = readProfile(JSON.parse(JSON.stringify(createProfile('Maya', DEFAULT_LOOK))))!;
    expect(profile.hero.back).toHaveLength(4);
    expect(profile.hero.side).toHaveLength(4);
    const game = applyProfileHero(createProject('t'), profile);
    const hero = game.sprites.find((s) => s.id === game.player.spriteId)!;
    expect(hero.side).toHaveLength(4);
    const again = setProfileHeroFromSprite(profile, hero, game.palette);
    expect(again.hero.side).toEqual(profile.hero.side);
  });
});

describe('which view shows', () => {
  const all = { back: true, side: true };
  it('side-view games always use the side, mirrored going left', () => {
    expect(pickView(all, 'platformer', { x: 1, y: 0 })).toEqual({ facing: 'side', mirror: false });
    expect(pickView(all, 'platformer', { x: -1, y: 0 })).toEqual({ facing: 'side', mirror: true });
  });

  it('top-down games use the back going up, the front going down, the side going across', () => {
    expect(pickView(all, 'topdown', { x: 0, y: -1 }).facing).toBe('back');
    expect(pickView(all, 'topdown', { x: 0, y: 1 }).facing).toBe('front');
    expect(pickView(all, 'topdown', { x: -1, y: 0 })).toEqual({ facing: 'side', mirror: true });
    expect(pickView(all, 'topdown', { x: 3, y: 1 })).toEqual({ facing: 'side', mirror: false });
  });

  it('a sprite without other views uses its front (mirrored going left, as before)', () => {
    const none = { back: false, side: false };
    expect(pickView(none, 'topdown', { x: 0, y: -1 })).toEqual({ facing: 'front', mirror: false });
    expect(pickView(none, 'platformer', { x: -1, y: 0 })).toEqual({ facing: 'front', mirror: true });
  });

  it('the level editor shows side-view games from the side', () => {
    const img = { ...blank(), side: [new Array(256).fill(2)] };
    expect(restingImage(img, 'platformer').pixels[0]).toBe(2);
    expect(restingImage(img, 'topdown').pixels[0]).toBe(0);
  });
});

describe('drawing views in the sprite editor', () => {
  const sprite = (): Sprite => ({ id: 'a', name: 'A', ...blank() });

  it('a new view starts as a copy of the front, and drawing on it leaves the front alone', () => {
    let s = run(createEditorState([sprite()]), { type: 'strokeBegin', x: 0, y: 0 }, { type: 'strokeEnd' });
    s = run(s, { type: 'facing', facing: 'side' });
    expect(s.facing).toBe('side');
    expect(activeFrame(s).pixels[0]).toBe(1);
    s = run(s, { type: 'tool', tool: 'eraser' }, { type: 'strokeBegin', x: 0, y: 0 }, { type: 'strokeEnd' });
    expect(activeImage(s).pixels[0]).toBe(1);
    expect(currentSprites(s)[0].side?.[0][0]).toBe(0);
  });

  it('frames are per view', () => {
    let s = run(createEditorState([sprite()]), { type: 'facing', facing: 'back' }, { type: 'addFrame' }, { type: 'addFrame' });
    expect(currentSprites(s)[0].back).toHaveLength(3);
    expect(currentSprites(s)[0].frames).toBeUndefined();
    s = run(s, { type: 'autoAnimate' });
    expect(currentSprites(s)[0].back).toHaveLength(4);
  });

  it('removing the last frame of a view takes the view away; undo brings it back', () => {
    let s = run(createEditorState([sprite()]), { type: 'facing', facing: 'side' }, { type: 'removeFrame' });
    expect(s.facing).toBe('front');
    expect(currentSprites(s)[0].side).toBeUndefined();
    s = run(s, { type: 'undo' });
    expect(currentSprites(s)[0].side).toHaveLength(1);
    // Undoing the view being added goes back to the front.
    s = run(s, { type: 'facing', facing: 'side' }, { type: 'undo' });
    expect(s.facing).toBe('front');
    expect(currentSprites(s)[0].side).toBeUndefined();
  });

  it('resizing changes every view', () => {
    const big = resizeAnimated(addView(addView(blank(), 'side'), 'back'), 32);
    expect(big.side?.[0]).toHaveLength(1024);
    expect(big.back?.[0]).toHaveLength(1024);
  });

  it('views can be taken out and put back unchanged', () => {
    const img = addView({ ...blank(), frames: [new Array(256).fill(1)] }, 'side');
    expect(frameCount(viewOf(img, 'side')!)).toBe(2);
    expect(withView(img, 'side', viewOf(img, 'side'))).toBe(img);
    expect(withView(img, 'front', viewOf(img, 'front'))).toBe(img);
    expect(withView(img, 'side', null).side).toBeUndefined();
  });
});
