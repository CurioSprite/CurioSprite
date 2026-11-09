import { Brush, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Eraser, Minus, MoveHorizontal, MoveVertical, Play, Plus, Redo2, Pencil, Settings2, Square, Trash2, Trophy, Undo2, Zap } from 'lucide-react';
import { useEffect, useMemo, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { useDialogs } from '../components/Dialogs';
import { SaveButton } from '../components/SaveButton';
import { SpriteThumb } from '../components/SpriteThumb';
import { TopBar } from '../components/TopBar';
import { LevelStage, LevelTimeline, cellFromPoint, onEndHandle, tileXFromPoint, type CellHighlight } from '../editor/LevelStage';
import { createLevelEditorState, currentLayout, levelEditorReducer } from '../editor/levelEditorState';
import { fitToScreenHeight, isStart, itemAt, layoutOf, sameItem, spriteKindOf, type LevelLayout, type PlaceItem, type SpriteKind } from '../editor/levelOps';
import { canRedo, canUndo } from '../editor/history';
import { createLevelArt } from '../graphics/levelPainter';
import { LIMITS, SCREEN_TILES, TILE, type EnemyMoves, type FloorKind, type LevelConfig, type LevelProject, type Project, type Rule, type Sprite, type WinRule } from '../models/project';
import { WIN_RULE_HELP, WIN_RULE_LABELS, levelCounts, needsGoal, winProblem } from '../models/winRules';
import { RACE_LAPS } from '../runtime/game';
import { applyRoles } from '../models/levelRoles';
import { ObjectMenu } from '../components/ObjectMenu';
import { ObjectPanel } from '../components/ObjectPanel';
import { RulesEditor, createRule, objectSpriteId } from '../components/RulesEditor';
import { objectName, objectRules, ruleSubject } from '../models/rules';
import { PlayScreen } from './PlayScreen';
import { levelView } from '../models/levels';

interface Props {
  game: Project;
  /** The level being edited. */
  levelIndex: number;
  dirty: boolean;
  /** Pushes the edited level into the open game (not yet saved). */
  onChange(level: LevelConfig): void;
  /** Changes how the level is won (a setting, not part of level undo). */
  onChangeWinRule(rule: WinRule): void;
  onChangeRules(rules: Rule[]): void;
  onSave(): void;
  onBack(): void;
}

type Cell = { x: number; y: number };

/** An item being dragged: from the tray, or picked up from a square. */
type Drag =
  | { source: 'tray'; item: PlaceItem; pointerId: number; startX: number; startY: number; moved: boolean; x: number; y: number }
  | { source: 'stage'; item: PlaceItem; from: Cell; pointerId: number; startX: number; startY: number; moved: boolean; x: number; y: number };

const DRAG_THRESHOLD = 6;
const EDGE_SCROLL_PX = 40;
const EDGE_SCROLL_SPEED = 10; // tiles per second
const EDGE_SCROLL_DELAY = 0.35; // seconds held at the edge before scrolling
/** Blocks of "outside" shown past the level end, so its handle is easy to grab. */
const END_ROOM = 2;
const MIN_WIDTH = SCREEN_TILES.width;

const treasures = (n: number) => `${n} treasure${n === 1 ? '' : 's'}`;

const KIND_LABELS: Record<SpriteKind['kind'], string> = { solid: 'Solid', through: 'Walk-through', enemy: 'Enemy', floor: 'Floor' };
const KIND_HELP: Record<SpriteKind['kind'], string> = {
  solid: 'the player stands on it and bumps into it',
  through: 'the player walks past it (clouds, trees…)',
  enemy: 'it moves around and the player battles it',
  floor: 'painted under everything: grass, paths, water…',
};
const FLOOR_LABELS: Record<FloorKind, string> = { ground: 'Ground', water: 'Water', grass: 'Tall grass' };
const FLOOR_HELP: Record<FloorKind, string> = {
  ground: 'walk on it: grass, paths, sand, floorboards',
  water: 'nobody can walk on it',
  grass: 'wild creatures jump out (top-down levels): every enemy sprite in this level can appear',
};
/** A sprite's chip: what it is, and for floor which kind. */
const kindLabel = (k: SpriteKind): string => (k.kind === 'floor' ? FLOOR_LABELS[k.floor] : KIND_LABELS[k.kind]);
const MOVE_LABELS: Record<EnemyMoves, string> = {
  still: 'Stays put',
  wander: 'Wanders around',
  patrol: 'Walks back and forth',
  chase: 'Chases the player',
};
const MAX_WIDTH = LIMITS.levelWidth.max;
const MAX_HEIGHT = LIMITS.levelHeight.max;

/** The level end being dragged to a new length (in blocks). */
type EndDrag = { pointerId: number; width: number; x: number; y: number };

export function LevelEditorScreen({ game, levelIndex, dirty, onChange, onChangeWinRule, onChangeRules, onSave, onBack }: Props) {
  const dialogs = useDialogs();
  const project = useMemo(() => levelView(game, levelIndex), [game, levelIndex]);
  const initial = useMemo(() => {
    const base = layoutOf(project.level);
    // Placed Block / Coin / Flag sprites become real blocks, coins and goals.
    return { base, fitted: fitToScreenHeight(applyRoles(base, project.level)) };
    // Only on first mount: later level updates come from this editor itself.
  }, []);
  const [state, dispatch] = useReducer(levelEditorReducer, initial.fitted, createLevelEditorState);
  const layout = currentLayout(state);
  // Rebuilt only when what the art depends on changes, not on every level edit.
  const art = useMemo(
    () => createLevelArt(project),
    [project.sprites, project.palette, project.level.background, project.player.spriteId, project.level.solidSpriteId, project.level.collectibleSpriteId, project.level.goalSpriteId],
  );
  const [cam, setCam] = useState({ x: 0, y: Math.max(0, initial.fitted.height - SCREEN_TILES.height) });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [endDrag, setEndDrag] = useState<EndDrag | null>(null);
  const [endHover, setEndHover] = useState(false);
  const [testing, setTesting] = useState(false);
  /** Rules sheet: closed, open, or open at one sprite's rules. */
  const [rulesOpen, setRulesOpen] = useState<{ focus?: string } | null>(null);
  /** The placed object whose panel is open. */
  const [selected, setSelected] = useState<string | null>(null);
  /** The little menu shown after tapping something in the level. */
  const [menu, setMenu] = useState<{ cell: Cell; objectId?: string; x: number; y: number; size: number } | null>(null);
  const stageRef = useRef<HTMLCanvasElement>(null);

  // Keep the open game in sync, so one Save stores everything.
  const projectRef = useRef(project);
  projectRef.current = project;
  const lastSynced = useRef<LevelLayout | null>(initial.base === initial.fitted ? initial.fitted : null);
  useEffect(() => {
    if (state.stroke || layout === lastSynced.current) return;
    lastSynced.current = layout;
    onChange({ ...projectRef.current.level, ...layout });
  }, [layout, state.stroke, onChange]);

  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const endRef = useRef(endDrag);
  endRef.current = endDrag;
  // The window can look a little past the level end; while the end is being
  // stretched it may scroll on toward the longest allowed level.
  const clampCam = (x: number, y: number) => {
    const l = layoutRef.current;
    const extent = (endRef.current ? MAX_WIDTH : l.width) + END_ROOM;
    return {
      x: Math.max(0, Math.min(extent - SCREEN_TILES.width, x)),
      y: Math.max(0, Math.min(Math.max(0, l.height - SCREEN_TILES.height), y)),
    };
  };
  // Re-clamp when the level gets shorter.
  useEffect(() => setCam((c) => clampCam(c.x, c.y)), [layout.width, layout.height, endDrag === null]);

  const camRef = useRef(cam);
  camRef.current = cam;
  const cellAt = (clientX: number, clientY: number) => cellFromPoint(stageRef.current, clientX, clientY, camRef.current.x, camRef.current.y);

  // ----- Drag and drop -------------------------------------------------------
  const dragRef = useRef(drag);
  dragRef.current = drag;
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      const moved = d.moved || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD;
      setDrag({ ...d, x: e.clientX, y: e.clientY, moved });
    };
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      setDrag(null);
      const cell = cellAt(e.clientX, e.clientY);
      if (d.source === 'tray') {
        if (!d.moved) {
          // A tap selects the item for painting (tap again to stop).
          dispatch({ type: 'brush', brush: sameItem(state.brush, d.item) ? null : d.item });
        } else if (cell) {
          dispatch({ type: 'drop', item: d.item, x: cell.x, y: cell.y });
        }
      } else if (!d.moved) {
        // A tap on something placed offers what can be done with it.
        openMenu(d.from, d.item);
      } else if (cell) {
        dispatch({ type: 'move', from: d.from, to: cell });
      } else if (d.item.kind !== 'start') {
        // Dragged out of the window: delete it.
        dispatch({ type: 'remove', x: d.from.x, y: d.from.y });
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drag !== null, state.brush]);

  // ----- Dragging the level end (length in blocks) ------------------------------
  /** Length under the pointer; past the window's edge, scrolling takes over. */
  const endWidthAt = (clientX: number): number => {
    const r = stageRef.current?.getBoundingClientRect();
    // Keep the handle a little inside the window so it never disappears off the edge.
    const room = r ? (END_ROOM * r.width) / SCREEN_TILES.width : 0;
    const clamped = r ? Math.max(r.left, Math.min(r.right - room, clientX)) : clientX;
    const x = tileXFromPoint(stageRef.current, clamped, camRef.current.x) ?? layoutRef.current.width;
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(x)));
  };
  useEffect(() => {
    if (!endDrag) return;
    const onMove = (e: PointerEvent) => {
      const d = endRef.current;
      if (d && e.pointerId === d.pointerId) setEndDrag({ ...d, width: endWidthAt(e.clientX), x: e.clientX, y: e.clientY });
    };
    const onUp = (e: PointerEvent) => {
      const d = endRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      setEndDrag(null);
      if (d.width !== layoutRef.current.width) void resizeTo(d.width);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [endDrag !== null]);

  // Scroll the window when an item is held just inside its left or right
  // edge. The short wait stops it scrolling while an item from the tray is
  // simply being carried in across the edge.
  // The level end scrolls straight away: dragging it to the edge always means "keep going".
  useEffect(() => {
    if (!drag && !endDrag) return;
    let frame = 0;
    let last = performance.now();
    let heldFor = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = (now - last) / 1000;
      last = now;
      const p = dragRef.current ?? endRef.current;
      const r = stageRef.current?.getBoundingClientRect();
      if (!p || !r || p.y < r.top || p.y > r.bottom) {
        heldFor = 0;
        return;
      }
      const stretching = endRef.current !== null;
      // Stretching may continue past the window's edge; items must stay inside it.
      const zoneLeft = stretching ? p.x < r.left + EDGE_SCROLL_PX : p.x >= r.left && p.x < r.left + EDGE_SCROLL_PX;
      const zoneRight = stretching ? p.x > r.right - EDGE_SCROLL_PX : p.x <= r.right && p.x > r.right - EDGE_SCROLL_PX;
      const dir = zoneLeft ? -1 : zoneRight ? 1 : 0;
      // Items can also be carried up or down a tall level.
      const inside = p.x >= r.left && p.x <= r.right;
      const dirY = stretching || !inside ? 0 : p.y < r.top + EDGE_SCROLL_PX ? -1 : p.y > r.bottom - EDGE_SCROLL_PX ? 1 : 0;
      heldFor = dir || dirY ? heldFor + dt : 0;
      if ((!dir && !dirY) || (!stretching && heldFor < EDGE_SCROLL_DELAY)) return;
      setCam((c) => {
        const next = clampCam(c.x + dir * EDGE_SCROLL_SPEED * dt, c.y + dirY * EDGE_SCROLL_SPEED * dt);
        camRef.current = next;
        return next;
      });
      const e = endRef.current;
      if (e) {
        const width = endWidthAt(e.x);
        if (width !== e.width) setEndDrag({ ...e, width });
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [drag !== null, endDrag !== null]);

  const onStageDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (drag || state.stroke || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (canLengthen && onEndHandle(stageRef.current, e.clientX, cam.x, layout.width)) {
      e.preventDefault();
      setEndDrag({ pointerId: e.pointerId, width: layout.width, x: e.clientX, y: e.clientY });
      return;
    }
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    e.preventDefault();
    if (cell.x >= layout.width) return;
    if (state.brush) {
      // Painting covers whatever is there, so whole areas can be painted in one drag.
      e.currentTarget.setPointerCapture(e.pointerId);
      dispatch({ type: 'strokeBegin', x: cell.x, y: cell.y });
      return;
    }
    const item = itemAt(layout, cell.x, cell.y);
    // Pick it up.
    if (item) setDrag({ source: 'stage', item, from: cell, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, x: e.clientX, y: e.clientY });
  };

  const onStageMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const cell = cellAt(e.clientX, e.clientY);
    const overEnd = canLengthen && !drag && !state.stroke && onEndHandle(stageRef.current, e.clientX, cam.x, layout.width);
    setEndHover(overEnd);
    setHover(overEnd || (cell && cell.x >= layout.width) ? null : cell);
    if (state.stroke && cell) dispatch({ type: 'strokeMove', x: cell.x, y: cell.y });
  };

  useEffect(() => {
    if (!state.stroke) return;
    const end = () => dispatch({ type: 'strokeEnd' });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [state.stroke !== null]);

  // The menu points at a square; if the level scrolls, it would point at the wrong one.
  useEffect(() => setMenu(null), [cam.x, cam.y]);

  const openMenu = (cell: Cell, item: PlaceItem) => {
    if (item.kind === 'start' || item.kind === 'erase') return;
    const r = stageRef.current?.getBoundingClientRect();
    if (!r) return;
    const t = r.width / SCREEN_TILES.width;
    const c = camRef.current;
    setMenu({
      cell,
      objectId: 'objectId' in item ? item.objectId : undefined,
      x: r.left + (cell.x - c.x + 0.5) * t,
      y: r.top + (cell.y - c.y + 0.5) * t,
      size: t,
    });
  };

  const startTrayDrag = (item: PlaceItem) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    setDrag({ source: 'tray', item, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, x: e.clientX, y: e.clientY });
  };

  // Where the dragged item would land.
  const dropCell = drag && drag.moved ? cellAt(drag.x, drag.y) : null;
  const box = state.stroke && state.shape === 'box' && state.brush?.kind !== 'start' ? state.stroke : null;
  const highlight: CellHighlight | null = dropCell
    ? { ...dropCell, ok: drag?.item.kind === 'start' || !isStart(layout, dropCell.x, dropCell.y) }
    : box
      ? (() => {
          // Same clamping as fillBox: the box never reaches past the level end.
          const left = Math.max(0, Math.min(box.anchor.x, box.last.x));
          const right = Math.min(layout.width - 1, Math.max(box.anchor.x, box.last.x));
          const top = Math.max(0, Math.min(box.anchor.y, box.last.y));
          const bottom = Math.min(layout.height - 1, Math.max(box.anchor.y, box.last.y));
          return { x: left, y: top, w: right - left + 1, h: bottom - top + 1, ok: true };
        })()
    : !drag && hover && state.brush
      ? { ...hover, ok: state.brush.kind === 'start' || !isStart(layout, hover.x, hover.y) }
      : null;
  const deleting = drag?.source === 'stage' && drag.moved && drag.item.kind !== 'start' && !dropCell;

  // ----- Keyboard -------------------------------------------------------------
  useEffect(() => {
    if (testing) return;
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && k === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if (mod && k === 's') {
        e.preventDefault();
        onSave();
      } else if (e.key === 'Escape' && state.brush) {
        e.preventDefault();
        dispatch({ type: 'brush', brush: null });
      } else if (!mod && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        if (document.activeElement && document.activeElement !== document.body) return;
        e.preventDefault();
        const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
        const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
        setCam((c) => clampCam(c.x + dx, c.y + dy));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [testing, onSave, layout.width, state.brush]);

  // ----- Level length ---------------------------------------------------------
  async function resizeTo(width: number) {
    const l = layoutRef.current;
    const lost = l.tiles.some((row) => [...row.slice(width)].some((c) => c !== TILE.empty)) || l.objects.some((o) => o.x >= width);
    if (lost) {
      const ok = await dialogs.confirm({
        title: `Shorten to ${width} blocks?`,
        message: 'Things at the end of the level will be removed. You can press Undo to get them back.',
        confirmLabel: 'Shorten',
      });
      if (!ok) return;
    }
    dispatch({ type: 'resize', width, height: l.height });
  }
  /** Taller levels grow (and lower ones shrink) at the top, so the ground stays put. */
  async function resizeHeightTo(height: number) {
    const l = layoutRef.current;
    const cut = l.height - height;
    const lost = cut > 0 && (l.tiles.slice(0, cut).some((row) => [...row].some((c) => c !== TILE.empty)) || l.objects.some((o) => o.y < cut));
    if (lost) {
      const ok = await dialogs.confirm({
        title: `Make it ${height} blocks tall?`,
        message: 'Things at the top of the level will be removed. You can press Undo to get them back.',
        confirmLabel: 'Make it lower',
      });
      if (!ok) return;
    }
    dispatch({ type: 'resize', width: l.width, height });
    // Keep looking at the same part of the level (the cam is clamped once the new size is in).
    setCam((c) => ({ x: c.x, y: c.y - cut }));
  }
  const H = SCREEN_TILES.height;
  const lowerHeight = Math.max(H, (Math.ceil(layout.height / H) - 1) * H);
  const tallerHeight = Math.min(MAX_HEIGHT, (Math.floor(layout.height / H) + 1) * H);
  const screensTall = (() => {
    const n = layout.height / H;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  })();
  // Side-view levels grow one way (across, or up for a climb); top-down, shooter and racing ones both ways.
  // A control also shows if the level is already bigger that way, so it can be made smaller.
  const { mode, direction } = project.settings;
  const side = mode === 'platformer';
  const canLengthen = !side || direction === 'across' || layout.width > SCREEN_TILES.width;
  const canHeighten = !side || direction === 'up' || layout.height > H;
  // Tall levels (climbs) get their map beside the window, going up.
  const tall = layout.height > H && layout.height / H >= layout.width / SCREEN_TILES.width;
  const onWheel = (e: ReactWheelEvent<HTMLCanvasElement>) => {
    if (drag || endDrag || state.stroke) return;
    const step = (d: number) => d / 40;
    // A plain wheel goes along the level; up and down when it is a tall one.
    const dx = tall ? step(e.deltaX) : step(e.deltaX || e.deltaY);
    const dy = tall ? step(e.deltaY) : 0;
    setCam((c) => clampCam(c.x + dx, c.y + dy));
  };

  // − / + jump to the previous / next whole screen.
  const S = SCREEN_TILES.width;
  const shorterWidth = Math.max(MIN_WIDTH, (Math.ceil(layout.width / S) - 1) * S);
  const longerWidth = Math.min(MAX_WIDTH, (Math.floor(layout.width / S) + 1) * S);
  const shownWidth = endDrag?.width ?? layout.width;
  const screensText = (() => {
    const n = shownWidth / S;
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  })();

  /** Solid, walk-through or enemy; enemies also get how they move and how tough they are. */
  const chooseKind = async (sprite: Sprite) => {
    const current = spriteKindOf(layoutRef.current, sprite.id);
    const kind = await dialogs.choose<SpriteKind['kind']>({
      title: `What is ${sprite.name} in the level?`,
      message: 'This applies everywhere it is placed.',
      options: (['solid', 'through', 'enemy', 'floor'] as const).map((k) => ({
        value: k,
        label: `${KIND_LABELS[k]}: ${KIND_HELP[k]}`,
        tone: current.kind === k ? 'primary' : 'plain',
      })),
    });
    if (!kind) return;
    if (kind === 'floor') {
      const floor = await dialogs.choose<FloorKind>({
        title: `What kind of floor is ${sprite.name}?`,
        message: 'Paint it under everything else. Things placed on it stay on top.',
        options: (Object.keys(FLOOR_LABELS) as FloorKind[]).map((f) => ({
          value: f,
          label: `${FLOOR_LABELS[f]}: ${FLOOR_HELP[f]}`,
          tone: current.kind === 'floor' && current.floor === f ? 'primary' : 'plain',
        })),
      });
      if (floor) dispatch({ type: 'spriteKind', spriteId: sprite.id, kind: { kind: 'floor', floor } });
      return;
    }
    if (kind !== 'enemy') {
      dispatch({ type: 'spriteKind', spriteId: sprite.id, kind: { kind } });
      return;
    }
    const moves = await dialogs.choose<EnemyMoves>({
      title: `How does ${sprite.name} move?`,
      options: (Object.keys(MOVE_LABELS) as EnemyMoves[]).map((m) => ({
        value: m,
        label: MOVE_LABELS[m],
        tone: current.kind === 'enemy' && current.moves === m ? 'primary' : 'plain',
      })),
    });
    if (!moves) return;
    const hp = await dialogs.choose<string>({
      title: `How tough is ${sprite.name}?`,
      options: [1, 2, 3, 5].map((n) => ({
        value: String(n),
        label: n === 1 ? '1 hit beats it' : `${n} hits beat it`,
        tone: current.kind === 'enemy' && current.hp === n ? 'primary' : 'plain',
      })),
    });
    if (!hp) return;
    dispatch({ type: 'spriteKind', spriteId: sprite.id, kind: { kind: 'enemy', moves, hp: Number(hp) } });
  };

  const chooseWinRule = async () => {
    const next = await dialogs.choose<WinRule>({
      title: 'How is the game won?',
      options: (Object.keys(WIN_RULE_LABELS) as WinRule[]).map((r) => ({
        value: r,
        label: `${WIN_RULE_LABELS[r]}: ${WIN_RULE_HELP[r]}`,
        tone: r === project.settings.winRule ? 'primary' : 'plain',
      })),
    });
    if (next && next !== project.settings.winRule) onChangeWinRule(next);
  };

  const clear = async () => {
    const ok = await dialogs.confirm({
      title: 'Clear the whole level?',
      message: 'All blocks, treasure and placed sprites will be removed. The player start stays. You can press Undo afterwards.',
      confirmLabel: 'Clear',
      danger: true,
    });
    if (ok) dispatch({ type: 'clear' });
  };

  // ----- Tray -----------------------------------------------------------------
  const spriteById = (id: string): Sprite => project.sprites.find((s) => s.id === id) ?? project.sprites[0];
  const tray: Array<{ key: string; label: string; item: PlaceItem; sprite?: Sprite }> = [
    { key: 'solid', label: 'Block', item: { kind: 'solid' }, sprite: spriteById(project.level.solidSpriteId) },
    { key: 'treasure', label: 'Treasure', item: { kind: 'collectible' }, sprite: spriteById(project.level.collectibleSpriteId) },
    { key: 'goal', label: 'Goal', item: { kind: 'goal' }, sprite: spriteById(project.level.goalSpriteId) },
    { key: 'start', label: 'Start', item: { kind: 'start' }, sprite: spriteById(project.player.spriteId) },
    { key: 'erase', label: 'Eraser', item: { kind: 'erase' } },
  ];
  // The Hero, Block, Coin and Goal sprites are placed from the top section instead.
  const roleIds = new Set([project.player.spriteId, project.level.solidSpriteId, project.level.collectibleSpriteId, project.level.goalSpriteId]);
  // Floor sprites paint the floor; everything else is placed on top.
  const isFloor = (id: string) => layout.floorTypes.some((f) => f.spriteId === id);
  const scenery = project.sprites
    .filter((s) => !roleIds.has(s.id))
    .map((s) => ({ key: s.id, label: s.name, item: { kind: isFloor(s.id) ? 'floor' : 'decoration', spriteId: s.id } as PlaceItem, sprite: s }));
  const thumbFor = (item: PlaceItem): Sprite | undefined => {
    if (item.kind === 'decoration' || item.kind === 'floor') return spriteById(item.spriteId);
    return tray.find((t) => t.item.kind === item.kind)?.sprite;
  };
  const ruleCount = (spriteId: string) =>
    project.rules.filter((r) => {
      const subject = ruleSubject(r);
      return subject.kind === 'sprite' && subject.spriteId === spriteId;
    }).length;
  const brushItem = state.brush;
  const brushSprite = brushItem ? thumbFor(brushItem) : undefined;
  const brushLabel = brushItem
    ? brushItem.kind === 'decoration' || brushItem.kind === 'floor'
      ? spriteById(brushItem.spriteId).name
      : (tray.find((t) => t.item.kind === brushItem.kind)?.label ?? '')
    : '';
  const rule = project.settings.winRule;
  const counts = levelCounts(layout);
  const { treasure: coins, goals, enemies } = counts;
  const problem = winProblem(rule, counts);
  const winText =
    problem ??
    (rule === 'enemies'
      ? `Win by beating ${enemies} enem${enemies === 1 ? 'y' : 'ies'}`
      : rule === 'goal'
      ? `Win by reaching the goal${coins ? ` · ${treasures(coins)} to find as a bonus` : ''}`
      : rule === 'coins'
        ? `Win by collecting ${treasures(coins)}`
        : `Win by collecting ${treasures(coins)}, then reaching the goal`);

  if (testing) {
    // Test plays this level as it is now (winning it can carry on to the next).
    return <PlayScreen game={game} startLevel={levelIndex} unlocked={game.levels.length} onUnlock={() => {}} exitLabel="Back to level" onExit={() => setTesting(false)} />;
  }

  // The game as it is being edited (the level here is newer than the saved session's for a moment).
  const liveProject: LevelProject = { ...project, level: { ...project.level, ...layout } };
  const selectedObject = selected ? layout.objects.find((o) => o.id === selected) : undefined;
  const ghost = drag && drag.moved ? thumbFor(drag.item) : undefined;
  const tilePx = (stageRef.current?.getBoundingClientRect().width ?? 400) / SCREEN_TILES.width;

  return (
    <main className={`screen ${drag ? 'dragging' : ''}`}>
      <TopBar
        tone="create"
        backLabel="Game"
        onBack={onBack}
        title={
          <span className="editorTitle">
            {project.meta.name} <span className="muted">· Level</span>
          </span>
        }
      >
        <button type="button" className="iconBtn" aria-label="Undo" disabled={!canUndo(state.history)} onClick={() => dispatch({ type: 'undo' })}>
          <Undo2 size={20} />
        </button>
        <button type="button" className="iconBtn" aria-label="Redo" disabled={!canRedo(state.history)} onClick={() => dispatch({ type: 'redo' })}>
          <Redo2 size={20} />
        </button>
        <button type="button" className="btn rulesBtn" onClick={() => setRulesOpen({})}>
          <Zap size={18} aria-hidden="true" /> Rules{project.rules.length > 0 && <span className="countBadge">{project.rules.length}</span>}
        </button>
        <button type="button" className="btn play" onClick={() => setTesting(true)}>
          <Play size={18} aria-hidden="true" /> Test
        </button>
        <SaveButton dirty={dirty} onSave={onSave} />
      </TopBar>

      {rulesOpen && <RulesEditor project={liveProject} onChange={onChangeRules} onClose={() => setRulesOpen(null)} focusSpriteId={rulesOpen.focus} />}
      {menu && (() => {
        const o = menu.objectId ? layout.objects.find((x) => x.id === menu.objectId) : undefined;
        const remove = () => dispatch({ type: 'remove', x: menu.cell.x, y: menu.cell.y });
        if (!o) {
          return (
            <ObjectMenu
              x={menu.x}
              y={menu.y}
              size={menu.size}
              title="Block"
              icon={<SpriteThumb sprite={spriteById(project.level.solidSpriteId)} palette={project.palette} size={24} />}
              note="Blocks are ground, so they can't have rules. For something with rules (a door, a switch…), place one of your sprites instead."
              items={[{ label: 'Remove block', icon: <Trash2 size={18} aria-hidden="true" />, danger: true, onSelect: remove }]}
              onClose={() => setMenu(null)}
            />
          );
        }
        const name = objectName(liveProject, o.id);
        const own = objectRules(liveProject, o.id).length;
        return (
          <ObjectMenu
            x={menu.x}
            y={menu.y}
            size={menu.size}
            title={name}
            icon={<SpriteThumb sprite={spriteById(objectSpriteId(liveProject, o))} palette={project.palette} size={24} />}
            items={[
              {
                label: 'Add a rule',
                icon: <Zap size={18} aria-hidden="true" />,
                onSelect: async () => {
                  const rule = await createRule(dialogs, liveProject, { kind: 'object', objectId: o.id });
                  if (!rule) return;
                  onChangeRules([...liveProject.rules, rule]);
                  dialogs.toast(`Rule added to ${name}`);
                },
              },
              {
                label: own ? `Rules & settings (${own})` : 'Rules & settings',
                icon: <Settings2 size={18} aria-hidden="true" />,
                onSelect: () => setSelected(o.id),
              },
              {
                label: 'Rename',
                icon: <Pencil size={18} aria-hidden="true" />,
                onSelect: async () => {
                  const next = await dialogs.prompt({
                    title: `Rename ${name}`,
                    message: 'Leave it empty to use its number again.',
                    initialValue: o.name ?? name,
                    confirmLabel: 'Rename',
                    maxLength: LIMITS.nameMaxLength,
                  });
                  if (next !== null) dispatch({ type: 'updateObject', id: o.id, patch: { name: next.trim() || undefined } });
                },
              },
              { label: 'Remove', icon: <Trash2 size={18} aria-hidden="true" />, danger: true, onSelect: remove },
            ]}
            onClose={() => setMenu(null)}
          />
        );
      })()}
      {selectedObject && !rulesOpen && (
        <ObjectPanel
          project={liveProject}
          object={selectedObject}
          onUpdate={(patch) => dispatch({ type: 'updateObject', id: selectedObject.id, patch })}
          onRemove={() => {
            dispatch({ type: 'remove', x: selectedObject.x, y: selectedObject.y });
            setSelected(null);
          }}
          onChangeRules={onChangeRules}
          onOpenSpriteRules={(spriteId) => setRulesOpen({ focus: spriteId })}
          onClose={() => setSelected(null)}
        />
      )}

      <div className="levelBody">
        <section className="levelMain">
          <div className="stageRow">
          <LevelStage
            canvasRef={stageRef}
            layout={layout}
            art={art}
            camX={cam.x}
            camY={cam.y}
            highlight={endDrag ? null : highlight}
            endPreview={endDrag?.width ?? null}
            endHover={endHover}
            showEnd={canLengthen}
            onPointerDown={onStageDown}
            onPointerMove={onStageMove}
            onPointerLeave={() => {
              setHover(null);
              setEndHover(false);
            }}
            onWheel={onWheel}
          />
          {tall && (
            <div className="tallMapCol">
              <button type="button" className="iconBtn small" aria-label="Scroll up" onClick={() => setCam((c) => clampCam(c.x, c.y - H / 2))}>
                <ChevronUp size={20} />
              </button>
              <LevelTimeline vertical layout={layout} art={art} camX={cam.x} camY={cam.y} onScrub={(x, y) => setCam(clampCam(x, y))} />
              <button type="button" className="iconBtn small" aria-label="Scroll down" onClick={() => setCam((c) => clampCam(c.x, c.y + H / 2))}>
                <ChevronDown size={20} />
              </button>
            </div>
          )}
          </div>
          {!tall && (
          <div className="timelineRow">
            <button type="button" className="iconBtn small" aria-label="Scroll left" onClick={() => setCam((c) => clampCam(c.x - SCREEN_TILES.width / 2, c.y))}>
              <ChevronLeft size={20} />
            </button>
            <LevelTimeline layout={layout} art={art} camX={cam.x} camY={cam.y} onScrub={(x, y) => setCam(clampCam(x, y))} />
            <button type="button" className="iconBtn small" aria-label="Scroll right" onClick={() => setCam((c) => clampCam(c.x + SCREEN_TILES.width / 2, c.y))}>
              <ChevronRight size={20} />
            </button>
          </div>
          )}
        </section>

        <aside className={`tray ${deleting ? 'trashing' : ''}`} aria-label="Things to place">
          {deleting ? (
            <div className="trashZone">
              <Trash2 size={40} aria-hidden="true" />
              <strong>Drop here to remove</strong>
            </div>
          ) : (
            <>
              {project.settings.mode === 'racing' ? (
                <div className={`winBox ${goals ? '' : 'warn'}`}>
                  <p className="trayStat">
                    {goals
                      ? `A ${RACE_LAPS}-lap race: the goal squares are the finish line, and enemies are rival cars (${enemies}).`
                      : 'No finish line yet: put goal squares right across the track!'}
                  </p>
                </div>
              ) : (
              <div className={`winBox ${problem ? 'warn' : ''}`}>
                <button type="button" className="winRuleBtn" onClick={() => void chooseWinRule()} aria-label={`How to win: ${WIN_RULE_LABELS[rule]}. Tap to change.`}>
                  <Trophy size={18} aria-hidden="true" />
                  <span>
                    <small>How to win</small>
                    {WIN_RULE_LABELS[rule]}
                  </span>
                  <ChevronDown size={18} aria-hidden="true" />
                </button>
                <p className="trayStat">
                  {winText}
                  {needsGoal(rule) || goals === 0 ? null : ' (goal flags do nothing with this rule)'}
                </p>
              </div>
              )}
              {brushItem ? (
                <div className="paintBar" role="group" aria-label="Painting">
                  <div className="paintWith">
                    {brushSprite ? <SpriteThumb sprite={brushSprite} palette={project.palette} size={24} /> : <Eraser size={20} aria-hidden="true" />}
                    <span>
                      {brushItem.kind === 'erase' ? (
                        <strong>Erasing</strong>
                      ) : (
                        <>
                          Painting <strong>{brushLabel}</strong>
                        </>
                      )}
                    </span>
                  </div>
                  {brushItem.kind !== 'start' && (
                    <div className="segmented paintShape" role="radiogroup" aria-label="Paint shape">
                      <button type="button" role="radio" aria-checked={state.shape === 'draw'} className={state.shape === 'draw' ? 'on' : ''} onClick={() => dispatch({ type: 'shape', shape: 'draw' })}>
                        <Brush size={16} aria-hidden="true" /> Draw
                      </button>
                      <button type="button" role="radio" aria-checked={state.shape === 'box'} className={state.shape === 'box' ? 'on' : ''} onClick={() => dispatch({ type: 'shape', shape: 'box' })}>
                        <Square size={16} aria-hidden="true" /> Box
                      </button>
                    </div>
                  )}
                  <p className="trayHint">
                    {brushItem.kind === 'start' ? 'Tap a square to move the start.' : state.shape === 'box' ? 'Drag across the window to fill a box.' : 'Drag across the window to paint lots at once.'}
                  </p>
                  <button type="button" className="btn small paintDone" onClick={() => dispatch({ type: 'brush', brush: null })}>
                    <Check size={16} aria-hidden="true" /> Done painting
                  </button>
                </div>
              ) : (
                <p className="trayHint">
                  <strong>Tap</strong> something here to paint lots of it, or <strong>drag</strong> one into the window. <strong>Tap</strong> something in the level for its menu: add a rule, rename or remove it.
                </p>
              )}
              <div className="trayGrid">
                {tray.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={`trayItem ${sameItem(state.brush, t.item) ? 'on' : ''}`}
                    aria-pressed={sameItem(state.brush, t.item)}
                    onPointerDown={startTrayDrag(t.item)}
                    onClick={(e) => {
                      // Keyboard / gamepad activation (pointer taps are handled on pointer up).
                      if (e.detail === 0) dispatch({ type: 'brush', brush: sameItem(state.brush, t.item) ? null : t.item });
                    }}
                  >
                    {t.sprite ? <SpriteThumb sprite={t.sprite} palette={project.palette} size={32} /> : <Eraser size={28} aria-hidden="true" />}
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
              <h3 className="trayHeading">Your sprites</h3>
              <p className="trayHint">
                {scenery.length === 0
                  ? 'Sprites you draw (trees, walls, enemies…) show up here. Add one with New sprite on the game screen.'
                  : 'Your Hero, Block, Treasure and Goal are placed from the section above.'}
              </p>
              <div className="trayGrid">
                {scenery.map((t) => {
                  const kind = spriteKindOf(layout, t.sprite.id);
                  return (
                    <div key={t.key} className="trayCell">
                      <button
                        type="button"
                        className={`trayItem ${sameItem(state.brush, t.item) ? 'on' : ''}`}
                        aria-pressed={sameItem(state.brush, t.item)}
                        onPointerDown={startTrayDrag(t.item)}
                        onClick={(e) => {
                          if (e.detail === 0) dispatch({ type: 'brush', brush: sameItem(state.brush, t.item) ? null : t.item });
                        }}
                      >
                        <SpriteThumb sprite={t.sprite} palette={project.palette} size={32} />
                        <span>{t.label}</span>
                      </button>
                      <button
                        type="button"
                        className={`solidChip ${kind.kind}`}
                        aria-label={`${t.label}: ${kindLabel(kind)}. Tap to change.`}
                        title={kind.kind === 'floor' ? FLOOR_HELP[kind.floor] : KIND_HELP[kind.kind]}
                        onClick={() => void chooseKind(t.sprite)}
                      >
                        {kindLabel(kind)}
                      </button>
                      <button
                        type="button"
                        className={`spriteRulesBtn ${ruleCount(t.sprite.id) ? 'has' : ''}`}
                        aria-label={`${t.label} rules (${ruleCount(t.sprite.id)})`}
                        title={`Rules for ${t.label}`}
                        onClick={() => setRulesOpen({ focus: t.sprite.id })}
                      >
                        <Zap size={12} aria-hidden="true" />
                        {ruleCount(t.sprite.id) || ''}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="trayFooter">
                {canLengthen && (
                <div className="lengthControl" aria-label="Level length">
                  <button type="button" className="iconBtn small" aria-label="One screen shorter" disabled={shorterWidth >= layout.width} onClick={() => void resizeTo(shorterWidth)}>
                    <Minus size={18} />
                  </button>
                  <span className="lengthText">
                    <span><MoveHorizontal size={13} aria-hidden="true" /> <strong>{shownWidth}</strong> long</span>
                    <small>{screensText} screens</small>
                  </span>
                  <button type="button" className="iconBtn small" aria-label="One screen longer" disabled={longerWidth <= layout.width} onClick={() => void resizeTo(longerWidth)}>
                    <Plus size={18} />
                  </button>
                </div>
                )}
                {canHeighten && (
                <div className="lengthControl" aria-label="Level height">
                  <button type="button" className="iconBtn small" aria-label="One screen lower" disabled={lowerHeight >= layout.height} onClick={() => void resizeHeightTo(lowerHeight)}>
                    <Minus size={18} />
                  </button>
                  <span className="lengthText">
                    <span><MoveVertical size={13} aria-hidden="true" /> <strong>{layout.height}</strong> tall</span>
                    <small>{screensTall} {screensTall === '1' ? 'screen' : 'screens'}</small>
                  </span>
                  <button type="button" className="iconBtn small" aria-label="One screen taller" disabled={tallerHeight <= layout.height} onClick={() => void resizeHeightTo(tallerHeight)}>
                    <Plus size={18} />
                  </button>
                </div>
                )}
                <button type="button" className="btn danger small" onClick={() => void clear()}>
                  <Trash2 size={16} aria-hidden="true" /> Clear level
                </button>
              </div>
            </>
          )}
        </aside>
      </div>

      {ghost && drag && (
        <div className="dragGhost" style={{ left: drag.x, top: drag.y, width: tilePx * 1.2, height: tilePx * 1.2 }} aria-hidden="true">
          <SpriteThumb sprite={ghost} palette={project.palette} size={tilePx * 1.2} />
        </div>
      )}
    </main>
  );
}
