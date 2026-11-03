import { describe, expect, it } from 'vitest';
import { createProject } from '../models/defaults';
import { SCREEN_TILES, TILE } from '../models/project';
import { applyRoles } from '../models/levelRoles';
import { validateProject } from '../models/serialization';
import { createLevelEditorState, currentLayout, levelEditorReducer, type LevelEditorAction, type LevelEditorState } from './levelEditorState';
import {
  clearLayout,
  countTiles,
  fillBox,
  fitToScreenHeight,
  itemAt,
  layoutOf,
  moveItem,
  paintLine,
  placeItem,
  removeItem,
  resizeLayout,
  type LevelLayout,
} from './levelOps';

const blank = (w = 10, h = 6): LevelLayout => ({
  width: w,
  height: h,
  tiles: Array(h).fill('.'.repeat(w)),
  floor: Array(h).fill('.'.repeat(w)),
  floorTypes: [],
  playerStart: { x: 0, y: h - 1 },
  objects: [],
  passThroughSpriteIds: [],
  enemies: [],
});
const run = (s: LevelEditorState, ...actions: LevelEditorAction[]) => actions.reduce(levelEditorReducer, s);
const tree = { kind: 'decoration', spriteId: 'tree' } as const;
/** What is on a square, ignoring which object it is. */
const kindAt = (l: LevelLayout, x: number, y: number) => {
  const item = itemAt(l, x, y);
  if (!item) return null;
  const { objectId: _id, ...rest } = item as { objectId?: string };
  return rest;
};
const count = (l: LevelLayout, kind: string) => l.objects.filter((o) => o.kind === kind).length;

describe('placing items', () => {
  it('places one item per square, replacing what was there', () => {
    let l = placeItem(blank(), 3, 2, { kind: 'solid' });
    expect(l.tiles[2]).toBe('...#......');
    l = placeItem(l, 3, 2, tree);
    expect(kindAt(l, 3, 2)).toEqual(tree);
    expect(l.tiles[2]).toBe('..........');
    l = placeItem(l, 3, 2, { kind: 'collectible' });
    expect(kindAt(l, 3, 2)).toEqual({ kind: 'collectible' });
    expect(l.objects).toHaveLength(1);
  });

  it('returns the same layout when nothing changes', () => {
    const l = placeItem(blank(), 1, 1, tree);
    expect(placeItem(l, 1, 1, tree)).toBe(l);
    expect(placeItem(l, 99, 1, { kind: 'solid' })).toBe(l);
  });

  it('never covers the start square', () => {
    const l = blank();
    expect(placeItem(l, 0, 5, { kind: 'solid' })).toBe(l);
    expect(removeItem(l, 0, 5)).toBe(l);
  });

  it('moves the start, clearing its new square', () => {
    const l = placeItem(blank(), 5, 3, { kind: 'solid' });
    const moved = placeItem(l, 5, 3, { kind: 'start' });
    expect(moved.playerStart).toEqual({ x: 5, y: 3 });
    expect(itemAt(moved, 5, 3)).toEqual({ kind: 'start' });
    expect(moved.tiles[3]).toBe('..........');
  });

  it('paints a gap-free line', () => {
    const l = paintLine(blank(), 1, 1, 8, 1, { kind: 'solid' });
    expect(l.tiles[1]).toBe('.########.');
  });
});

describe('filling a box', () => {
  it('fills every square between two corners, in any direction', () => {
    const l = fillBox(blank(), 7, 4, 2, 3, { kind: 'solid' });
    expect(l.tiles[3]).toBe('..######..');
    expect(l.tiles[4]).toBe('..######..');
    expect(countTiles(l, TILE.solid)).toBe(12);
  });

  it('replaces what was there and skips the start square', () => {
    let l = placeItem(blank(), 3, 5, tree);
    l = placeItem(l, 4, 5, { kind: 'collectible' });
    l = fillBox(l, 0, 5, 9, 5, { kind: 'solid' });
    expect(l.tiles[5]).toBe('.#########');
    expect(l.objects).toEqual([]);
    expect(itemAt(l, 0, 5)).toEqual({ kind: 'start' });
  });

  it('fills with sprites and erases', () => {
    let l = fillBox(blank(), 1, 1, 3, 2, tree);
    expect(l.objects).toHaveLength(6);
    expect(new Set(l.objects.map((o) => o.id)).size).toBe(6);
    expect(fillBox(l, 1, 1, 3, 2, tree)).toBe(l);
    l = fillBox(l, 0, 0, 9, 1, { kind: 'erase' });
    expect(l.objects).toHaveLength(3);
  });

  it('clips to the level and leaves it alone when nothing changes', () => {
    const l = fillBox(blank(), 8, 0, 40, 0, { kind: 'solid' });
    expect(l.tiles[0]).toBe('........##');
    expect(fillBox(l, 8, 0, 9, 0, { kind: 'solid' })).toBe(l);
  });
});

describe('goals', () => {
  it('places, paints and erases goal flags like other items', () => {
    let l = placeItem(blank(), 9, 5, { kind: 'goal' });
    expect(kindAt(l, 9, 5)).toEqual({ kind: 'goal' });
    l = fillBox(l, 7, 0, 7, 2, { kind: 'goal' });
    expect(count(l, 'goal')).toBe(4);
    l = fillBox(l, 0, 0, 9, 5, { kind: 'erase' });
    expect(count(l, 'goal')).toBe(0);
  });
});

describe('objects are individuals', () => {
  it('every placed thing gets its own id, and keeps it when moved', () => {
    let l = placeItem(blank(), 2, 2, tree);
    l = placeItem(l, 4, 2, tree);
    const [a, b] = l.objects;
    expect(a.id).not.toBe(b.id);
    l = moveItem(l, { x: 2, y: 2 }, { x: 6, y: 3 });
    expect(l.objects.find((o) => o.id === a.id)).toMatchObject({ x: 6, y: 3 });
  });

  it('keeps its number when others are removed, so "Slime 3" stays Slime 3', () => {
    let l = paintLine(blank(), 1, 1, 3, 1, tree);
    expect(l.objects.map((o) => o.n)).toEqual([1, 2, 3]);
    l = removeItem(l, 1, 1);
    expect(l.objects.map((o) => o.n)).toEqual([2, 3]);
    l = placeItem(l, 6, 1, tree);
    expect(l.objects.map((o) => o.n)).toEqual([2, 3, 4]);
    l = placeItem(l, 7, 1, { kind: 'collectible' });
    expect(l.objects[l.objects.length - 1].n).toBe(1);
  });

  it('painting over the same kind of thing keeps it (and its rules)', () => {
    let l = placeItem(blank(), 3, 1, { kind: 'collectible' });
    const id = l.objects[0].id;
    l = paintLine(l, 0, 1, 9, 1, { kind: 'collectible' });
    expect(l.objects.some((o) => o.id === id)).toBe(true);
    expect(count(l, 'treasure')).toBe(10);
  });

  it('can have its own name and enemy settings, and go back to its sprite\'s', () => {
    let s = run(createLevelEditorState(blank()), { type: 'drop', item: tree, x: 2, y: 2 });
    const id = currentLayout(s).objects[0].id;
    s = run(s, { type: 'updateObject', id, patch: { name: 'Big Tree', moves: 'chase', hp: 5 } });
    expect(currentLayout(s).objects[0]).toMatchObject({ name: 'Big Tree', moves: 'chase', hp: 5 });
    s = run(s, { type: 'updateObject', id, patch: { moves: undefined } });
    expect('moves' in currentLayout(s).objects[0]).toBe(false);
    s = run(s, { type: 'undo' }, { type: 'undo' });
    expect(currentLayout(s).objects[0].name).toBeUndefined();
  });
});

describe('drag and drop', () => {
  it('moves a block, a coin and scenery', () => {
    let l = placeItem(blank(), 2, 2, { kind: 'solid' });
    l = placeItem(l, 3, 3, tree);
    l = moveItem(l, { x: 2, y: 2 }, { x: 7, y: 1 });
    l = moveItem(l, { x: 3, y: 3 }, { x: 4, y: 4 });
    expect(itemAt(l, 2, 2)).toBeNull();
    expect(itemAt(l, 7, 1)).toEqual({ kind: 'solid' });
    expect(itemAt(l, 3, 3)).toBeNull();
    expect(kindAt(l, 4, 4)).toEqual(tree);
  });

  it('drags the start to a new square', () => {
    const l = moveItem(blank(), { x: 0, y: 5 }, { x: 6, y: 2 });
    expect(l.playerStart).toEqual({ x: 6, y: 2 });
  });

  it('will not drop onto the start square', () => {
    const l = placeItem(blank(), 2, 5, { kind: 'solid' });
    expect(moveItem(l, { x: 2, y: 5 }, { x: 0, y: 5 })).toBe(l);
  });
});

describe('resizing', () => {
  it('grows from the bottom-left so the ground stays at the bottom', () => {
    let l = placeItem(blank(10, 6), 1, 5, { kind: 'solid' });
    l = placeItem(l, 4, 2, tree);
    const bigger = resizeLayout(l, 20, 9);
    expect(bigger.tiles).toHaveLength(9);
    expect(bigger.tiles.every((r) => r.length === 20)).toBe(true);
    expect(itemAt(bigger, 1, 8)).toEqual({ kind: 'solid' });
    expect(kindAt(bigger, 4, 5)).toEqual(tree);
    expect(bigger.playerStart).toEqual({ x: 0, y: 8 });
  });

  it('drops items beyond the new width and keeps the start inside', () => {
    let l = placeItem(blank(30, 10), 25, 2, { kind: 'start' });
    l = placeItem(l, 28, 4, tree);
    const smaller = resizeLayout(l, 10, 10);
    expect(smaller.playerStart).toEqual({ x: 9, y: 2 });
    expect(smaller.objects).toEqual([]);
  });

  it('grows old 13-row levels to a full screen', () => {
    const l = fitToScreenHeight(blank(40, 13));
    expect(l.height).toBe(SCREEN_TILES.height);
    expect(l.playerStart.y).toBe(SCREEN_TILES.height - 1);
  });

  it('keeps levels valid', () => {
    const p = createProject('t');
    let layout = resizeLayout(layoutOf(p.levels[0]), 100, 15);
    layout = placeItem(layout, 80, 3, { kind: 'decoration', spriteId: p.sprites[0].id });
    expect(validateProject({ ...p, levels: [{ ...p.levels[0], ...layout }] }).errors).toEqual([]);
    expect(validateProject({ ...p, levels: [{ ...p.levels[0], ...clearLayout(layout) }] }).errors).toEqual([]);
  });
});

describe('level editor reducer', () => {
  it('paints with the selected brush as one undo step', () => {
    let s = run(createLevelEditorState(blank()), { type: 'brush', brush: { kind: 'solid' } });
    s = run(s, { type: 'strokeBegin', x: 2, y: 4 }, { type: 'strokeMove', x: 8, y: 4 }, { type: 'strokeEnd' });
    expect(currentLayout(s).tiles[4]).toBe('..#######.');
    expect(s.history.past).toHaveLength(1);
    s = run(s, { type: 'undo' });
    expect(countTiles(currentLayout(s), TILE.solid)).toBe(0);
  });

  it('does not paint without a brush', () => {
    const s = createLevelEditorState(blank());
    expect(run(s, { type: 'strokeBegin', x: 1, y: 1 })).toBe(s);
  });

  it('records drops, moves and removals as separate undo steps', () => {
    let s = run(
      createLevelEditorState(blank()),
      { type: 'drop', item: { kind: 'collectible' }, x: 3, y: 1 },
      { type: 'move', from: { x: 3, y: 1 }, to: { x: 5, y: 2 } },
      { type: 'drop', item: tree, x: 7, y: 2 },
      { type: 'remove', x: 7, y: 2 },
    );
    expect(kindAt(currentLayout(s), 5, 2)).toEqual({ kind: 'collectible' });
    expect(currentLayout(s).objects).toHaveLength(1);
    expect(s.history.past).toHaveLength(4);
    s = run(s, { type: 'undo' });
    expect(kindAt(currentLayout(s), 7, 2)).toEqual(tree);
  });

  it('clears and resizes undoably', () => {
    let s = run(createLevelEditorState(blank()), { type: 'drop', item: { kind: 'solid' }, x: 1, y: 1 }, { type: 'clear' });
    expect(countTiles(currentLayout(s), TILE.solid)).toBe(0);
    s = run(s, { type: 'resize', width: 50, height: 15 });
    expect(currentLayout(s).width).toBe(50);
    s = run(s, { type: 'undo' }, { type: 'undo' });
    expect(countTiles(currentLayout(s), TILE.solid)).toBe(1);
  });
});

describe('box painting', () => {
  it('previews from where the drag began, so the box can shrink, and is one undo step', () => {
    let s = run(createLevelEditorState(blank()), { type: 'brush', brush: { kind: 'solid' } }, { type: 'shape', shape: 'box' });
    s = run(s, { type: 'strokeBegin', x: 2, y: 1 }, { type: 'strokeMove', x: 8, y: 3 });
    expect(countTiles(currentLayout(s), TILE.solid)).toBe(21);
    s = run(s, { type: 'strokeMove', x: 4, y: 2 }, { type: 'strokeEnd' });
    expect(countTiles(currentLayout(s), TILE.solid)).toBe(6);
    expect(s.history.past).toHaveLength(1);
    s = run(s, { type: 'undo' });
    expect(countTiles(currentLayout(s), TILE.solid)).toBe(0);
  });

  it('does not change brush or shape mid-drag', () => {
    const s = run(createLevelEditorState(blank()), { type: 'brush', brush: { kind: 'solid' } }, { type: 'strokeBegin', x: 1, y: 1 });
    expect(run(s, { type: 'shape', shape: 'box' })).toBe(s);
    expect(run(s, { type: 'brush', brush: null })).toBe(s);
  });
});

describe('sprite kinds', () => {
  it('switches a sprite between solid, walk-through and enemy as undo steps', () => {
    let s = run(createLevelEditorState(blank()), { type: 'spriteKind', spriteId: 'bat', kind: { kind: 'through' } });
    expect(currentLayout(s).passThroughSpriteIds).toEqual(['bat']);
    s = run(s, { type: 'spriteKind', spriteId: 'bat', kind: { kind: 'enemy', hp: 2, moves: 'chase' } });
    expect(currentLayout(s).passThroughSpriteIds).toEqual([]);
    expect(currentLayout(s).enemies).toEqual([{ spriteId: 'bat', hp: 2, moves: 'chase' }]);
    s = run(s, { type: 'undo' });
    expect(currentLayout(s).enemies).toEqual([]);
    expect(currentLayout(s).passThroughSpriteIds).toEqual(['bat']);
  });
});

describe('solid or walk-through sprites', () => {
  it('toggles a sprite as one undo step and keeps it through resizes', () => {
    let s = run(createLevelEditorState(blank()), { type: 'togglePassThrough', spriteId: 'tree' });
    expect(currentLayout(s).passThroughSpriteIds).toEqual(['tree']);
    s = run(s, { type: 'resize', width: 30, height: 10 });
    expect(currentLayout(s).passThroughSpriteIds).toEqual(['tree']);
    s = run(s, { type: 'undo' }, { type: 'undo' });
    expect(currentLayout(s).passThroughSpriteIds).toEqual([]);
  });
});

describe('placed Block / Treasure / Goal sprites', () => {
  it('become real blocks, treasure and goals, keeping their ids', () => {
    const roles = { solidSpriteId: 'block', collectibleSpriteId: 'coin', goalSpriteId: 'flag' };
    const at = (id: string, spriteId: string, x: number) => ({ id, kind: 'sprite' as const, spriteId, x, y: 1 });
    const l = { ...blank(), objects: [at('a', 'coin', 1), at('b', 'flag', 2), at('c', 'block', 3), at('d', 'tree', 4)] };
    const fixed = applyRoles(l, roles);
    expect(fixed.tiles[1]).toBe('...#......');
    expect(fixed.objects).toEqual([
      { id: 'a', kind: 'treasure', x: 1, y: 1, n: 1 },
      { id: 'b', kind: 'goal', x: 2, y: 1, n: 1 },
      { ...at('d', 'tree', 4), n: 1 },
    ]);
    expect(applyRoles(fixed, roles)).toBe(fixed);
  });
});
