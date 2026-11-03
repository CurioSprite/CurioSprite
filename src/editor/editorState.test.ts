import { describe, expect, it } from 'vitest';
import { createSprite } from '../models/defaults';
import { activeHistory, activeImage, createEditorState, currentSprites, editorReducer, type EditorAction, type EditorState } from './editorState';
import { canRedo, canUndo, createHistory, pushHistory, redo, undo } from './history';
import { getPixel } from './spriteOps';

const run = (s: EditorState, ...actions: EditorAction[]) => actions.reduce(editorReducer, s);

describe('history', () => {
  it('undoes and redoes in order', () => {
    let h = createHistory(1);
    h = pushHistory(h, 2);
    h = pushHistory(h, 3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = undo(h);
    expect(h.present).toBe(1);
    expect(canUndo(h)).toBe(false);
    h = redo(h);
    expect(h.present).toBe(2);
    h = pushHistory(h, 9);
    expect(canRedo(h)).toBe(false);
  });

  it('respects the limit', () => {
    let h = createHistory(0);
    for (let i = 1; i <= 10; i++) h = pushHistory(h, i, 3);
    expect(h.past).toEqual([7, 8, 9]);
  });
});

describe('editor reducer', () => {
  const fresh = () => createEditorState([createSprite('Hero'), createSprite('Coin', 32)]);

  it('turns a whole pencil stroke into a single undo step', () => {
    let s = run(fresh(), { type: 'color', color: 3 }, { type: 'strokeBegin', x: 0, y: 0 }, { type: 'strokeMove', x: 5, y: 0 }, { type: 'strokeEnd' });
    expect(getPixel(activeImage(s), 3, 0)).toBe(3);
    expect(activeHistory(s).past).toHaveLength(1);
    s = run(s, { type: 'undo' });
    expect(activeImage(s).pixels.every((p) => p === 0)).toBe(true);
    s = run(s, { type: 'redo' });
    expect(getPixel(activeImage(s), 5, 0)).toBe(3);
  });

  it('erases with the eraser', () => {
    const s = run(
      fresh(),
      { type: 'strokeBegin', x: 2, y: 2 },
      { type: 'strokeEnd' },
      { type: 'tool', tool: 'eraser' },
      { type: 'strokeBegin', x: 2, y: 2 },
      { type: 'strokeEnd' },
    );
    expect(getPixel(activeImage(s), 2, 2)).toBe(0);
    expect(activeHistory(s).past).toHaveLength(2);
  });

  it('fills with the fill tool', () => {
    const s = run(fresh(), { type: 'tool', tool: 'fill' }, { type: 'color', color: 5 }, { type: 'strokeBegin', x: 8, y: 8 }, { type: 'strokeEnd' });
    expect(activeImage(s).pixels.every((p) => p === 5)).toBe(true);
    expect(activeHistory(s).past).toHaveLength(1);
  });

  it('fills with transparency using the see-through colour', () => {
    const s = run(
      fresh(),
      { type: 'tool', tool: 'fill' },
      { type: 'color', color: 4 },
      { type: 'strokeBegin', x: 0, y: 0 },
      { type: 'strokeEnd' },
      { type: 'color', color: 0 },
      { type: 'strokeBegin', x: 3, y: 3 },
      { type: 'strokeEnd' },
    );
    expect(activeImage(s).pixels.every((p) => p === 0)).toBe(true);
  });

  it('clears and resizes undoably', () => {
    let s = run(fresh(), { type: 'strokeBegin', x: 1, y: 1 }, { type: 'strokeEnd' }, { type: 'clear' });
    expect(activeImage(s).pixels.every((p) => p === 0)).toBe(true);
    s = run(s, { type: 'undo' }, { type: 'resize', size: 32 });
    expect(activeImage(s).width).toBe(32);
    expect(getPixel(activeImage(s), 2, 2)).toBe(1);
    s = run(s, { type: 'undo' });
    expect(activeImage(s).width).toBe(16);
  });

  it('keeps separate histories per sprite', () => {
    const start = fresh();
    const coinId = start.sprites[1].id;
    let s = run(start, { type: 'strokeBegin', x: 0, y: 0 }, { type: 'strokeEnd' }, { type: 'select', id: coinId });
    expect(canUndo(activeHistory(s))).toBe(false);
    s = run(s, { type: 'strokeBegin', x: 31, y: 31 }, { type: 'strokeEnd' });
    const [hero, coin] = currentSprites(s);
    expect(getPixel(hero, 0, 0)).toBe(1);
    expect(getPixel(coin, 31, 31)).toBe(1);
  });

  it('adds a new sprite and selects it', () => {
    const extra = createSprite('Dragon', 32);
    const s = run(fresh(), { type: 'addSprite', sprite: extra });
    expect(s.activeId).toBe(extra.id);
    expect(activeImage(s).width).toBe(32);
    expect(currentSprites(s).map((x) => x.name)).toEqual(['Hero', 'Coin', 'Dragon']);
  });

  it('records nothing for a stroke that changes nothing', () => {
    const s = run(fresh(), { type: 'tool', tool: 'eraser' }, { type: 'strokeBegin', x: 0, y: 0 }, { type: 'strokeEnd' });
    expect(canUndo(activeHistory(s))).toBe(false);
  });
});
