/**
 * Draws a level layout for editing and previews (not used by the game
 * runtime, which has its own renderer).
 */
import type { LevelLayout } from '../editor/levelOps';
import type { LevelProject } from '../models/project';
import { FLOOR_KEYS, NO_FLOOR, TILE } from '../models/project';
import { restingImage } from '../editor/spriteOps';
import { createSpriteCanvas } from './spriteCanvas';

export interface LevelArt {
  background: string;
  solid: HTMLCanvasElement;
  collectible: HTMLCanvasElement;
  goal: HTMLCanvasElement;
  player: HTMLCanvasElement;
  sprites: Map<string, HTMLCanvasElement>;
  /** Average colour of each sprite, for tiny minimap squares. */
  average: Map<string, string>;
  solidId: string;
  collectibleId: string;
  goalId: string;
  playerId: string;
}

function averageColor(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) return '#888888';
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
    n++;
  }
  if (!n) return 'rgba(255,255,255,0.3)';
  return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
}

export function createLevelArt(project: LevelProject): LevelArt {
  const sprites = new Map<string, HTMLCanvasElement>();
  const average = new Map<string, string>();
  for (const s of project.sprites) {
    // Seen the way the game shows it standing: from the side in side-view games.
    const canvas = createSpriteCanvas(restingImage(s, project.settings.mode), project.palette);
    sprites.set(s.id, canvas);
    average.set(s.id, averageColor(canvas));
  }
  const get = (id: string) => sprites.get(id) ?? sprites.values().next().value!;
  return {
    background: project.level.background,
    solid: get(project.level.solidSpriteId),
    collectible: get(project.level.collectibleSpriteId),
    goal: get(project.level.goalSpriteId),
    player: get(project.player.spriteId),
    sprites,
    average,
    solidId: project.level.solidSpriteId,
    collectibleId: project.level.collectibleSpriteId,
    goalId: project.level.goalSpriteId,
    playerId: project.player.spriteId,
  };
}

export interface PaintOptions {
  /** CSS pixels per tile. */
  tilePx: number;
  /** Top-left of the view, in tiles. */
  camX: number;
  camY: number;
  /** View size in CSS pixels. */
  viewW: number;
  viewH: number;
  /** Draw tiny coloured squares instead of sprites (minimaps). */
  blocks?: boolean;
  grid?: boolean;
}

/** Paints the visible part of a level; the caller sets up the transform for device pixels. */
export function paintLevel(ctx: CanvasRenderingContext2D, l: LevelLayout, art: LevelArt, o: PaintOptions): void {
  const { tilePx: t, camX, camY, viewW, viewH } = o;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, viewW, viewH);
  const ox = -camX * t;
  const oy = -camY * t;
  ctx.fillStyle = art.background;
  ctx.fillRect(ox, oy, l.width * t, l.height * t);

  const x0 = Math.max(0, Math.floor(camX));
  const x1 = Math.min(l.width - 1, Math.ceil(camX + viewW / t));
  const y0 = Math.max(0, Math.floor(camY));
  const y1 = Math.min(l.height - 1, Math.ceil(camY + viewH / t));
  const draw = (image: HTMLCanvasElement, color: string | undefined, x: number, y: number) => {
    const px = ox + x * t;
    const py = oy + y * t;
    if (o.blocks) {
      ctx.fillStyle = color ?? '#fff';
      ctx.fillRect(px, py, Math.max(1, t), Math.max(1, t));
    } else {
      ctx.drawImage(image, px, py, t, t);
    }
  };

  // The floor first, under everything.
  const floorIds = l.floorTypes.map((f) => f.spriteId);
  for (let y = y0; y <= y1; y++) {
    const row = l.floor[y];
    if (!row) continue;
    for (let x = x0; x <= x1; x++) {
      const c = row[x];
      if (c === NO_FLOOR) continue;
      const id = floorIds[FLOOR_KEYS.indexOf(c)];
      const image = id ? art.sprites.get(id) : undefined;
      if (image) draw(image, art.average.get(id), x, y);
    }
  }
  for (let y = y0; y <= y1; y++) {
    const row = l.tiles[y];
    for (let x = x0; x <= x1; x++) if (row[x] === TILE.solid) draw(art.solid, art.average.get(art.solidId), x, y);
  }
  const passThrough = new Set(l.passThroughSpriteIds);
  const enemies = new Set(l.enemies.map((e) => e.spriteId));
  for (const obj of l.objects) {
    if (obj.x < x0 || obj.x > x1 || obj.y < y0 || obj.y > y1) continue;
    if (obj.kind === 'treasure') {
      draw(art.collectible, '#facc15', obj.x, obj.y);
      continue;
    }
    if (obj.kind === 'goal') {
      draw(art.goal, '#ffffff', obj.x, obj.y);
      continue;
    }
    const image = art.sprites.get(obj.spriteId!);
    if (image) draw(image, art.average.get(obj.spriteId!), obj.x, obj.y);
    // Enemies get a red corner badge.
    if (o.grid && !o.blocks && enemies.has(obj.spriteId!)) {
      const s = Math.max(5, t * 0.3);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(ox + (obj.x + 1) * t - s, oy + obj.y * t);
      ctx.lineTo(ox + (obj.x + 1) * t, oy + obj.y * t);
      ctx.lineTo(ox + (obj.x + 1) * t, oy + obj.y * t + s);
      ctx.closePath();
      ctx.fill();
    }
    // In the editor, walk-through sprites get a dashed outline so they can be told apart.
    if (o.grid && !o.blocks && passThrough.has(obj.spriteId!)) {
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeRect(ox + obj.x * t + 1, oy + obj.y * t + 1, t - 2, t - 2);
      ctx.restore();
    }
  }
  draw(art.player, '#f43f5e', l.playerStart.x, l.playerStart.y);

  if (o.grid && t >= 8) {
    ctx.strokeStyle = 'rgba(15,23,42,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x <= x1 + 1; x++) {
      const px = Math.round(ox + x * t) + 0.5;
      ctx.moveTo(px, Math.max(0, oy));
      ctx.lineTo(px, Math.min(viewH, oy + l.height * t));
    }
    for (let y = y0; y <= y1 + 1; y++) {
      const py = Math.round(oy + y * t) + 0.5;
      ctx.moveTo(Math.max(0, ox), py);
      ctx.lineTo(Math.min(viewW, ox + l.width * t), py);
    }
    ctx.stroke();
  }
}

/** Sizes a canvas's backing store for crisp drawing and returns its 2D context. */
export function prepareCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(cssW * dpr));
  const h = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
