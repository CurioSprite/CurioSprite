import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent, type RefObject } from 'react';
import { paintLevel, prepareCanvas, type LevelArt } from '../graphics/levelPainter';
import { SCREEN_TILES } from '../models/project';
import type { LevelLayout } from './levelOps';

export interface CellHighlight {
  x: number;
  y: number;
  ok: boolean;
  /** Size in squares (a box being painted); 1 × 1 when left out. */
  w?: number;
  h?: number;
}

interface StageProps {
  canvasRef: RefObject<HTMLCanvasElement>;
  layout: LevelLayout;
  art: LevelArt;
  camX: number;
  camY: number;
  highlight: CellHighlight | null;
  /** New level length while the end handle is being dragged. */
  endPreview: number | null;
  /** Pointer is over the end handle. */
  endHover: boolean;
  /** The level can be stretched at its end (not in climbs, which grow up). */
  showEnd?: boolean;
  onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>): void;
  onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>): void;
  onPointerLeave(): void;
  /** Mouse wheel / trackpad scrolling over the window. */
  onWheel?(e: ReactWheelEvent<HTMLCanvasElement>): void;
}

/** Converts a screen point to a level square, or null when outside the stage. */
export function cellFromPoint(canvas: HTMLCanvasElement | null, clientX: number, clientY: number, camX: number, camY: number) {
  if (!canvas) return null;
  const r = canvas.getBoundingClientRect();
  if (clientX < r.left || clientX >= r.right || clientY < r.top || clientY >= r.bottom) return null;
  const t = r.width / SCREEN_TILES.width;
  return { x: Math.floor((clientX - r.left) / t + camX), y: Math.floor((clientY - r.top) / t + camY) };
}

/** Level x position (in blocks, fractional) under a screen point. */
export function tileXFromPoint(canvas: HTMLCanvasElement | null, clientX: number, camX: number): number | null {
  if (!canvas) return null;
  const r = canvas.getBoundingClientRect();
  return (clientX - r.left) / (r.width / SCREEN_TILES.width) + camX;
}

/** True when a point is on the level's end handle (or the space beyond the end). */
export function onEndHandle(canvas: HTMLCanvasElement | null, clientX: number, camX: number, levelWidth: number): boolean {
  const x = tileXFromPoint(canvas, clientX, camX);
  if (x === null || !canvas) return false;
  const t = canvas.getBoundingClientRect().width / SCREEN_TILES.width;
  return x >= levelWidth || Math.abs(x - levelWidth) * t <= Math.max(10, t * 0.45);
}

function drawEndHandle(ctx: CanvasRenderingContext2D, x: number, h: number, active: boolean, label: string | null): void {
  ctx.fillStyle = '#f97316';
  ctx.fillRect(x - 2, 0, 4, h);
  const pw = 26;
  const ph = 56;
  const py = h / 2 - ph / 2;
  ctx.fillStyle = active ? '#fdba74' : '#f97316';
  ctx.beginPath();
  ctx.roundRect(x - pw / 2, py, pw, ph, 10);
  ctx.fill();
  ctx.fillStyle = '#1c0a00';
  ctx.font = '800 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('‹›', x, h / 2 + 1);
  ctx.font = '800 10px system-ui, sans-serif';
  ctx.fillText('END', x, py + 10);
  if (label) {
    ctx.font = '800 13px system-ui, sans-serif';
    const w = ctx.measureText(label).width + 16;
    // Keep the label inside the window.
    const lx = Math.max(w / 2 + 4, Math.min(ctx.canvas.clientWidth - w / 2 - 4, x));
    ctx.fillStyle = '#0b1020e0';
    ctx.beginPath();
    ctx.roundRect(lx - w / 2, py - 32, w, 24, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, lx, py - 20);
  }
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

/** The game window: exactly one 25 × 15 screen, as the player will see it. */
export function LevelStage({ canvasRef, layout, art, camX, camY, highlight, endPreview, endHover, showEnd = true, onPointerDown, onPointerMove, onPointerLeave, onWheel }: StageProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Largest 5:3 box that fits.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const update = () => {
      const ratio = SCREEN_TILES.width / SCREEN_TILES.height;
      const w = Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight * ratio));
      setSize({ w, h: Math.floor(w / ratio) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0) return;
    const ctx = prepareCanvas(canvas, size.w, size.h);
    if (!ctx) return;
    const t = size.w / SCREEN_TILES.width;
    paintLevel(ctx, layout, art, { tilePx: t, camX, camY, viewW: size.w, viewH: size.h, grid: true });
    if (highlight) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = highlight.ok ? '#ffffff' : '#f43f5e';
      const w = highlight.w ?? 1;
      const h = highlight.h ?? 1;
      ctx.strokeRect((highlight.x - camX) * t + 1.5, (highlight.y - camY) * t + 1.5, w * t - 3, h * t - 3);
    }

    // Level end: preview of the new length while dragging, then the handle.
    const endX = (layout.width - camX) * t;
    const top = -camY * t;
    const levelH = layout.height * t;
    if (endPreview !== null && endPreview !== layout.width) {
      const px = (endPreview - camX) * t;
      if (endPreview < layout.width) {
        ctx.fillStyle = 'rgba(244,63,94,0.4)'; // blocks that will be cut off
        ctx.fillRect(px, top, endX - px, levelH);
      } else {
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = art.background; // new empty space
        ctx.fillRect(endX, top, px - endX, levelH);
        ctx.globalAlpha = 1;
      }
    }
    const handleAt = endPreview ?? layout.width;
    const hx = (handleAt - camX) * t;
    if (showEnd && hx > -20 && hx < size.w + 20) {
      const screens = handleAt / SCREEN_TILES.width;
      const label = endPreview !== null ? `${handleAt} blocks · ${Number.isInteger(screens) ? screens : screens.toFixed(1)} screens` : null;
      drawEndHandle(ctx, hx, size.h, endPreview !== null || endHover, label);
    }
  }, [canvasRef, size, layout, art, camX, camY, highlight, endPreview, endHover, showEnd]);

  return (
    <div className="stageWrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="levelStage"
        style={{ width: size.w, height: size.h, cursor: endHover || endPreview !== null ? 'ew-resize' : undefined }}
        aria-label="Level: game window"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onWheel={onWheel}
      />
    </div>
  );
}

interface TimelineProps {
  layout: LevelLayout;
  art: LevelArt;
  camX: number;
  camY: number;
  onScrub(camX: number, camY: number): void;
  /** A tall map beside the window (for climbing levels), bottom to top. */
  vertical?: boolean;
}

/** Width of the tall map beside the window. */
const TALL_MAP_W = 56;

/** The whole level, start to finish, with the game window marked. Drag to move through it. */
export function LevelTimeline({ layout, art, camX, camY, onScrub, vertical = false }: TimelineProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [room, setRoom] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const update = () => setRoom({ w: wrap.clientWidth, h: wrap.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Along the bottom the strip is stretched to fit; the tall map keeps squares square.
  const s = Math.min(TALL_MAP_W / layout.width, room.h / layout.height);
  const width = vertical ? Math.round(layout.width * s) : room.w;
  const height = vertical ? Math.round(layout.height * s) : 56;
  const sx = width / layout.width;
  const sy = height / layout.height;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;
    const ctx = prepareCanvas(canvas, width, height);
    if (!ctx) return;
    ctx.save();
    ctx.scale(1, sy / sx);
    paintLevel(ctx, layout, art, { tilePx: sx, camX: 0, camY: 0, viewW: width, viewH: layout.height * sx, blocks: true });
    ctx.restore();

    // Screen boundaries and numbers: left to right, or bottom to top on the tall map.
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.strokeStyle = 'rgba(11,16,32,0.5)';
    ctx.fillStyle = 'rgba(11,16,32,0.75)';
    if (vertical) {
      for (let i = 0; i * SCREEN_TILES.height < layout.height; i++) {
        const y = Math.round(height - i * SCREEN_TILES.height * sy) - 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        ctx.fillText(String(i + 1), 3, y - 3);
      }
    } else {
      for (let i = 0; i * SCREEN_TILES.width < layout.width; i++) {
        const x = Math.round(i * SCREEN_TILES.width * sx) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        ctx.fillText(String(i + 1), x + 4, 13);
      }
    }

    // The game window (the editor may look slightly past the end; keep the box on the strip).
    const bw = Math.min(width, SCREEN_TILES.width * sx);
    const bh = Math.min(height, SCREEN_TILES.height * sy);
    const bx = Math.max(0, Math.min(width - bw, camX * sx));
    const by = Math.max(0, Math.min(height - bh, camY * sy));
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.lineWidth = vertical ? 2 : 3;
    ctx.strokeStyle = '#f97316';
    ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
  }, [layout, art, camX, camY, width, height, sx, sy, vertical]);

  const scrub = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onScrub((e.clientX - r.left) / sx - SCREEN_TILES.width / 2, (e.clientY - r.top) / sy - SCREEN_TILES.height / 2);
  };

  return (
    <div className={vertical ? 'tallMapWrap' : 'timelineWrap'} ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="timeline"
        style={{ width, height, cursor: vertical ? 'ns-resize' : undefined }}
        aria-label={vertical ? 'Level map, bottom to top' : 'Level timeline'}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          scrub(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) scrub(e);
        }}
      />
    </div>
  );
}
