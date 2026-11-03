/**
 * Sprite editor state machine. Pure reducer: no React, no canvas, so it is
 * fully unit-testable.
 */
import type { AnimatedImage, Facing, Sprite, SpriteImage, SpriteSize } from '../models/project';
import { TRANSPARENT } from '../models/project';
import { createHistory, pushHistory, redo, undo, type History } from './history';
import {
  addView,
  autoBounce,
  clearImage,
  drawLine,
  duplicateFrame,
  floodFill,
  frameCount,
  frameOf,
  removeFrame,
  resizeAnimated,
  setPixel,
  viewOf,
  withFrame,
  withView,
} from './spriteOps';

export type Tool = 'pencil' | 'eraser' | 'fill';

export interface EditorState {
  /** Sprite metadata in project order (pixels live in `histories`). */
  sprites: Array<Pick<Sprite, 'id' | 'name'>>;
  /** Each sprite's picture, with all its animation frames, and its undo history. */
  histories: Record<string, History<AnimatedImage>>;
  activeId: string;
  /** Which view of the active sprite is being drawn: front, back or side. */
  facing: Facing;
  /** Which animation frame of that view is being drawn (0 = the first). */
  frame: number;
  tool: Tool;
  /** Palette value: 1-based colour, or 0 (TRANSPARENT) to paint / fill see-through pixels. */
  color: number;
  showGrid: boolean;
  stroke: { base: AnimatedImage; last: { x: number; y: number } } | null;
}

export type EditorAction =
  | { type: 'select'; id: string }
  | { type: 'tool'; tool: Tool }
  | { type: 'color'; color: number }
  | { type: 'toggleGrid' }
  | { type: 'strokeBegin'; x: number; y: number }
  | { type: 'strokeMove'; x: number; y: number }
  | { type: 'strokeEnd' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'clear' }
  | { type: 'resize'; size: SpriteSize }
  | { type: 'addSprite'; sprite: Sprite }
  /** Animation frames of the active view. */
  | { type: 'frame'; index: number }
  /** Draw another view (starting it as a copy of the front if it's new). */
  | { type: 'facing'; facing: Facing }
  | { type: 'addFrame' }
  | { type: 'removeFrame' }
  | { type: 'autoAnimate' };

function imageOf(s: Sprite): AnimatedImage {
  const img: AnimatedImage = { width: s.width, height: s.height, pixels: s.pixels };
  if (s.frames?.length) img.frames = s.frames;
  if (s.back?.length) img.back = s.back;
  if (s.side?.length) img.side = s.side;
  return img;
}

export function createEditorState(sprites: Sprite[], activeId?: string): EditorState {
  const histories: Record<string, History<AnimatedImage>> = {};
  for (const s of sprites) histories[s.id] = createHistory(imageOf(s));
  return {
    sprites: sprites.map(({ id, name }) => ({ id, name })),
    histories,
    activeId: activeId && histories[activeId] ? activeId : sprites[0]?.id ?? '',
    facing: 'front',
    frame: 0,
    tool: 'pencil',
    color: 1,
    showGrid: true,
    stroke: null,
  };
}

export const activeHistory = (s: EditorState): History<AnimatedImage> => s.histories[s.activeId];
/** The active sprite with all its views and frames. */
export const activeImage = (s: EditorState): AnimatedImage => activeHistory(s).present;
/** The view being drawn, as an animated picture of its own. */
export const activeView = (s: EditorState): AnimatedImage => viewOf(activeImage(s), s.facing) ?? viewOf(activeImage(s), 'front')!;
/** The frame being drawn. */
export const activeFrame = (s: EditorState): SpriteImage => frameOf(activeView(s), Math.min(s.frame, frameCount(activeView(s)) - 1));

/** Sprites with their current pixels, ready to be stored in the project. */
export function currentSprites(s: EditorState): Sprite[] {
  return s.sprites.map(({ id, name }) => {
    return { id, name, ...s.histories[id].present };
  });
}

function withActive(s: EditorState, h: History<AnimatedImage>): EditorState {
  if (h === activeHistory(s)) return s;
  // Keep the selection inside the picture: the view may have gone (undo), the animation got shorter.
  const facing = viewOf(h.present, s.facing) ? s.facing : 'front';
  const frame = Math.min(s.frame, frameCount(viewOf(h.present, facing)!) - 1);
  return { ...s, facing, frame, histories: { ...s.histories, [s.activeId]: h } };
}

/** Replace the present image without recording history (mid-stroke). */
function setPresent(s: EditorState, img: AnimatedImage): EditorState {
  const h = activeHistory(s);
  return img === h.present ? s : withActive(s, { ...h, present: img });
}

/** Records a new picture as one undo step. */
const commit = (s: EditorState, img: AnimatedImage): EditorState => withActive(s, pushHistory(activeHistory(s), img));

/** Changes the selected view and returns the whole picture. */
const onView = (s: EditorState, change: (view: AnimatedImage) => AnimatedImage): AnimatedImage => withView(activeImage(s), s.facing, change(activeView(s)));

/** Draws on the selected frame and returns the whole picture. */
const onFrame = (s: EditorState, draw: (frame: SpriteImage) => SpriteImage): AnimatedImage => onView(s, (view) => withFrame(view, s.frame, draw(activeFrame(s))));

function paintColor(s: EditorState): number {
  return s.tool === 'eraser' ? TRANSPARENT : s.color;
}

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case 'select':
      return s.histories[a.id] && !s.stroke ? { ...s, activeId: a.id, facing: 'front', frame: 0 } : s;
    case 'tool':
      return { ...s, tool: a.tool };
    case 'color':
      return { ...s, color: a.color, tool: s.tool === 'eraser' ? 'pencil' : s.tool };
    case 'toggleGrid':
      return { ...s, showGrid: !s.showGrid };
    case 'strokeBegin': {
      if (s.tool === 'fill') return commit(s, onFrame(s, (f) => floodFill(f, a.x, a.y, s.color)));
      const base = activeImage(s);
      const next = setPresent(s, onFrame(s, (f) => setPixel(f, a.x, a.y, paintColor(s))));
      return { ...next, stroke: { base, last: { x: a.x, y: a.y } } };
    }
    case 'strokeMove': {
      if (!s.stroke) return s;
      const { last } = s.stroke;
      if (last.x === a.x && last.y === a.y) return s;
      const next = setPresent(s, onFrame(s, (f) => drawLine(f, last.x, last.y, a.x, a.y, paintColor(s))));
      return { ...next, stroke: { ...s.stroke, last: { x: a.x, y: a.y } } };
    }
    case 'strokeEnd': {
      if (!s.stroke) return s;
      const h = activeHistory(s);
      const { base } = s.stroke;
      // Collapse the whole stroke into a single undo step.
      const committed = h.present === base ? h : pushHistory({ ...h, present: base }, h.present);
      return { ...withActive(s, committed), stroke: null };
    }
    case 'undo':
      return s.stroke ? s : withActive(s, undo(activeHistory(s)));
    case 'redo':
      return s.stroke ? s : withActive(s, redo(activeHistory(s)));
    case 'clear':
      return commit(s, onFrame(s, clearImage));
    case 'resize':
      return commit(s, resizeAnimated(activeImage(s), a.size));
    case 'addSprite': {
      if (s.stroke || s.histories[a.sprite.id]) return s;
      return {
        ...s,
        sprites: [...s.sprites, { id: a.sprite.id, name: a.sprite.name }],
        histories: { ...s.histories, [a.sprite.id]: createHistory(imageOf(a.sprite)) },
        activeId: a.sprite.id,
        facing: 'front',
        frame: 0,
      };
    }
    case 'frame':
      return s.stroke || a.index < 0 || a.index >= frameCount(activeView(s)) ? s : { ...s, frame: a.index };
    case 'facing': {
      if (s.stroke || a.facing === s.facing) return s;
      const img = activeImage(s);
      // A new view starts as a copy of the front (one undo step).
      const next = viewOf(img, a.facing) ? s : commit(s, addView(img, a.facing));
      return { ...next, facing: a.facing, frame: 0 };
    }
    case 'addFrame': {
      if (s.stroke) return s;
      const view = activeView(s);
      const next = duplicateFrame(view, s.frame);
      return next === view ? s : { ...commit(s, onView(s, () => next)), frame: s.frame + 1 };
    }
    case 'removeFrame': {
      if (s.stroke) return s;
      // The last frame of a back or side view takes the view away (the front is used again).
      if (s.facing !== 'front' && frameCount(activeView(s)) === 1) return { ...commit(s, withView(activeImage(s), s.facing, null)), facing: 'front', frame: 0 };
      return { ...commit(s, onView(s, (view) => removeFrame(view, s.frame))), frame: Math.max(0, s.frame - 1) };
    }
    case 'autoAnimate':
      return s.stroke ? s : { ...commit(s, onView(s, autoBounce)), frame: 0 };
  }
}
