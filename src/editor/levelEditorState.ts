/** Level editor state machine. Pure reducer, mirrors editorState for sprites. */
import { createHistory, pushHistory, redo, undo, type History } from './history';
import type { LevelObject } from '../models/project';
import {
  clearLayout,
  fillBox,
  moveItem,
  paintLine,
  placeItem,
  removeItem,
  resizeLayout,
  setSpriteKind,
  togglePassThrough,
  updateObject,
  type LevelLayout,
  type PlaceItem,
  type SpriteKind,
} from './levelOps';

type Cell = { x: number; y: number };

/** How a paint drag lays things down: along the pointer's path, or filling a box. */
export type PaintShape = 'draw' | 'box';

export interface LevelEditorState {
  history: History<LevelLayout>;
  /** Item painted by tapping / dragging on empty squares; null = none selected. */
  brush: PlaceItem | null;
  shape: PaintShape;
  stroke: { base: LevelLayout; anchor: Cell; last: Cell } | null;
}

export type LevelEditorAction =
  | { type: 'brush'; brush: PlaceItem | null }
  | { type: 'shape'; shape: PaintShape }
  | { type: 'strokeBegin'; x: number; y: number }
  | { type: 'strokeMove'; x: number; y: number }
  | { type: 'strokeEnd' }
  /** Drag and drop: from the tray (`item`) or from another square (`from`). */
  | { type: 'drop'; item: PlaceItem; x: number; y: number }
  | { type: 'move'; from: Cell; to: Cell }
  | { type: 'remove'; x: number; y: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'clear' }
  | { type: 'resize'; width: number; height: number }
  | { type: 'togglePassThrough'; spriteId: string }
  | { type: 'spriteKind'; spriteId: string; kind: SpriteKind }
  /** One object's own name / enemy settings. */
  | { type: 'updateObject'; id: string; patch: Partial<Pick<LevelObject, 'name' | 'moves' | 'hp'>> };

export function createLevelEditorState(layout: LevelLayout): LevelEditorState {
  return { history: createHistory(layout), brush: null, shape: 'draw', stroke: null };
}

export const currentLayout = (s: LevelEditorState): LevelLayout => s.history.present;

function commit(s: LevelEditorState, layout: LevelLayout): LevelEditorState {
  const history = pushHistory(s.history, layout);
  return history === s.history ? s : { ...s, history };
}

export function levelEditorReducer(s: LevelEditorState, a: LevelEditorAction): LevelEditorState {
  switch (a.type) {
    case 'brush':
      return s.stroke ? s : { ...s, brush: a.brush };
    case 'shape':
      return s.stroke ? s : { ...s, shape: a.shape };
    case 'strokeBegin': {
      if (!s.brush) return s;
      const base = currentLayout(s);
      const next = placeItem(base, a.x, a.y, s.brush);
      const cell = { x: a.x, y: a.y };
      return { ...s, history: { ...s.history, present: next }, stroke: { base, anchor: cell, last: cell } };
    }
    case 'strokeMove': {
      if (!s.stroke || !s.brush) return s;
      const { base, anchor, last } = s.stroke;
      if (last.x === a.x && last.y === a.y) return s;
      // A box is redrawn from the starting layout, so it can shrink as well as grow.
      const next =
        s.shape === 'box'
          ? fillBox(base, anchor.x, anchor.y, a.x, a.y, s.brush)
          : paintLine(currentLayout(s), last.x, last.y, a.x, a.y, s.brush);
      return { ...s, history: { ...s.history, present: next }, stroke: { ...s.stroke, last: { x: a.x, y: a.y } } };
    }
    case 'strokeEnd': {
      if (!s.stroke) return s;
      const { base } = s.stroke;
      const present = currentLayout(s);
      // The whole drag becomes a single undo step.
      const history = present === base ? s.history : pushHistory({ ...s.history, present: base }, present);
      return { ...s, history, stroke: null };
    }
    case 'drop':
      return s.stroke ? s : commit(s, placeItem(currentLayout(s), a.x, a.y, a.item));
    case 'move':
      return s.stroke ? s : commit(s, moveItem(currentLayout(s), a.from, a.to));
    case 'remove':
      return s.stroke ? s : commit(s, removeItem(currentLayout(s), a.x, a.y));
    case 'undo':
      return s.stroke ? s : { ...s, history: undo(s.history) };
    case 'redo':
      return s.stroke ? s : { ...s, history: redo(s.history) };
    case 'clear':
      return commit(s, clearLayout(currentLayout(s)));
    case 'resize':
      return commit(s, resizeLayout(currentLayout(s), a.width, a.height));
    case 'togglePassThrough':
      return s.stroke ? s : commit(s, togglePassThrough(currentLayout(s), a.spriteId));
    case 'spriteKind':
      return s.stroke ? s : commit(s, setSpriteKind(currentLayout(s), a.spriteId, a.kind));
    case 'updateObject':
      return s.stroke ? s : commit(s, updateObject(currentLayout(s), a.id, a.patch));
  }
}
