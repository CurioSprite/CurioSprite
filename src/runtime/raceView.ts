/**
 * The driver's view of a race: the level, built from above like any other,
 * seen from the seat of the player's car. Blocks stand up as walls (cast ray
 * by ray), the floor stretches away to the hills, and rival cars, placed
 * sprites and treasure stand up on the track (each sprite's back view, if it
 * has one, is how it looks standing up). The car's bonnet is at the bottom,
 * and a little map shows the whole track.
 */
import { frameOf, viewOf } from '../editor/spriteOps';
import { FLOOR_KEYS, NO_FLOOR, SCREEN_TILES, type AnimatedImage, type LevelProject, type SpriteImage } from '../models/project';
import type { GameState } from './game';

const W = SCREEN_TILES.width * 16;
const H = SCREEN_TILES.height * 16;
/** How wide the view is, and how far up the screen the horizon sits. */
const FOV = (70 * Math.PI) / 180;
const FOCAL = W / 2 / Math.tan(FOV / 2);
const HORIZON = Math.round(H * 0.42);
/** Heights in squares: the driver's eyes, and the walls. */
const EYE = 0.38;
const WALL = 1.1;
/** Things further than this (squares) fade into the haze, and nothing is drawn past the last. */
const FOG_FROM = 12;
const FAR = 40;
/** Sizes standing up, in squares: rival cars, solid things, scenery (taller: trees), treasure. */
const CAR = 0.9;
const THING = 1;
const SCENERY = 2;
const TREASURE = 0.55;
/** The little map's biggest size, in screen pixels. */
const MAP_MAX = 80;

type Tex = { w: number; h: number; px: Uint32Array };

/** A colour as the 32 bits an ImageData pixel takes (little-endian: red first). */
function pack(hex: string, alpha = 255): number {
  const n = parseInt(hex.slice(1), 16);
  return ((alpha << 24) | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0;
}

/** A blend of two packed colours: `t` of the way from `a` to `b`. */
function mix(a: number, b: number, t: number): number {
  const u = 1 - t;
  const r = (a & 255) * u + (b & 255) * t;
  const g = ((a >> 8) & 255) * u + ((b >> 8) & 255) * t;
  const bl = ((a >> 16) & 255) * u + ((b >> 16) & 255) * t;
  return ((255 << 24) | (bl << 16) | (g << 8) | r) >>> 0;
}

const darker = (c: number, k: number): number => mix(c, pack('#000000'), k);

/** A picture as packed colours (0 where it is see-through). */
function texture(img: SpriteImage, colors: number[]): Tex {
  return { w: img.width, h: img.height, px: Uint32Array.from(img.pixels, (v) => (v > 0 ? (colors[v - 1] ?? 0) : 0)) };
}

/** How a sprite looks standing up: its back view if it has one, else its picture. */
const standingOf = (img: AnimatedImage): SpriteImage => {
  const back = viewOf(img, 'back');
  return back ? frameOf(back, 0) : frameOf(img, 0);
};

/** The colour used most in a picture, leaving out black and white: the car's paint, for its bonnet. */
function mainColour(img: SpriteImage, palette: readonly string[]): string {
  const counts = new Map<number, number>();
  for (const v of img.pixels) if (v > 2) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = 5;
  let most = 0;
  for (const [v, n] of counts) if (n > most) [best, most] = [v, n];
  return palette[best - 1] ?? '#ef4444';
}

export class RaceView {
  private readonly buffer: HTMLCanvasElement;
  private readonly bctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly px: Uint32Array;
  private readonly wall: Tex;
  private readonly wallShade: Tex;
  /** For each square: its floor picture (null: bare ground). */
  private readonly floorOf: Array<Tex | null> = [];
  private readonly goal: Tex;
  private readonly coin: Tex;
  private readonly standing = new Map<string, Tex>();
  private readonly ground: number;
  private readonly haze: number;
  private readonly sky: number[] = [];
  private readonly hills: number;
  private readonly hood: string;
  private readonly map: HTMLCanvasElement;
  private readonly mapScale: number;
  /** Per column: how far away the wall is, and the top of it on screen. */
  private readonly depth = new Float32Array(W);
  private readonly wallTop = new Int16Array(W);
  private readonly passThrough: Set<string>;

  constructor(project: LevelProject) {
    const colors = project.palette.map((c) => pack(c));
    const sprite = (id: string) => project.sprites.find((s) => s.id === id) ?? project.sprites[0];
    const level = project.level;
    this.buffer = document.createElement('canvas');
    this.buffer.width = W;
    this.buffer.height = H;
    this.bctx = this.buffer.getContext('2d')!;
    this.image = this.bctx.createImageData(W, H);
    this.px = new Uint32Array(this.image.data.buffer);
    this.wall = texture(standingOf(sprite(level.solidSpriteId)), colors);
    this.wallShade = { ...this.wall, px: this.wall.px.map((c) => (c ? darker(c, 0.25) : 0)) };
    this.goal = texture(frameOf(sprite(level.goalSpriteId), 0), colors);
    this.coin = texture(frameOf(sprite(level.collectibleSpriteId), 0), colors);
    const floors = level.floorTypes.map((f) => texture(frameOf(sprite(f.spriteId), 0), colors));
    for (const row of level.floor) for (const c of row) this.floorOf.push(c === NO_FLOOR ? null : (floors[FLOOR_KEYS.indexOf(c)] ?? null));
    for (const o of level.objects) if (o.spriteId && !this.standing.has(o.spriteId)) this.standing.set(o.spriteId, texture(standingOf(sprite(o.spriteId)), colors));
    this.passThrough = new Set(level.passThroughSpriteIds);
    this.ground = pack(level.background);
    this.haze = pack('#dbeafe');
    for (let y = 0; y < HORIZON; y++) this.sky.push(mix(pack('#38bdf8'), this.haze, y / HORIZON));
    this.hills = mix(pack('#16a34a'), this.haze, 0.45);
    this.hood = mainColour(frameOf(sprite(project.player.spriteId), 0), project.palette);
    this.map = this.makeMap(project);
    this.mapScale = Math.min(1, MAP_MAX / Math.max(level.width, level.height));
  }

  /** The whole track from above, one pixel a square or less. */
  private makeMap(project: LevelProject): HTMLCanvasElement {
    const { width, height, floor, floorTypes } = project.level;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(width, height);
    const px = new Uint32Array(img.data.buffer);
    const goals = new Set(project.level.objects.filter((o) => o.kind === 'goal').map((o) => `${o.x},${o.y}`));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const c = floor[y]?.[x] ?? NO_FLOOR;
        const kind = c === NO_FLOOR ? null : floorTypes[FLOOR_KEYS.indexOf(c)]?.kind;
        const solid = project.level.tiles[y]?.[x] === '#';
        px[y * width + x] = goals.has(`${x},${y}`)
          ? pack('#f4f4f4')
          : solid
            ? pack('#0f172a', 150)
            : kind === 'grass'
              ? pack('#84cc16', 220)
              : kind
                ? pack('#cbd5e1', 235)
                : pack('#0f172a', 150);
      }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  render(ctx: CanvasRenderingContext2D, s: GameState, scale: number): void {
    const ts = s.tileSize;
    const p = s.player;
    const camX = (p.x + p.w / 2) / ts;
    const camY = (p.y + p.h / 2) / ts;
    const h = s.flight.heading;
    const dx = Math.sin(h);
    const dy = -Math.cos(h);
    // Right of the way it looks.
    const rx = Math.cos(h);
    const ry = Math.sin(h);
    this.drawSkyAndFloor(s, camX, camY, h, dx, dy, rx, ry);
    this.drawWalls(s, camX, camY, dx, dy, rx, ry);
    this.drawThings(s, camX, camY, dx, dy, rx, ry);
    this.bctx.putImageData(this.image, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buffer, 0, 0, W, H);
    this.drawHood(ctx, s);
    this.drawMap(ctx, s);
    if (s.race && s.race.wrongWay > 1) this.banner(ctx, 'Wrong way!', '#f87171', Math.round(H * 0.32));
  }

  /** Sky fading to haze, hills on the horizon (turning with the car), and the floor stretching away. */
  private drawSkyAndFloor(s: GameState, camX: number, camY: number, h: number, dx: number, dy: number, rx: number, ry: number): void {
    const { px } = this;
    for (let x = 0; x < W; x++) {
      const angle = h + Math.atan((x + 0.5 - W / 2) / FOCAL);
      const hill = Math.round(9 + 5 * Math.sin(angle * 3) + 3 * Math.sin(angle * 7 + 1) + 2 * Math.sin(angle * 13 + 2));
      for (let y = 0; y < HORIZON; y++) px[y * W + x] = y >= HORIZON - hill ? this.hills : this.sky[y];
    }
    for (let y = HORIZON; y < H; y++) {
      // How far ahead this row of the screen meets the ground.
      const ahead = (EYE * FOCAL) / (y + 0.5 - HORIZON);
      const fog = ahead > FAR ? 1 : Math.max(0, Math.min(1, (ahead - FOG_FROM) / (FAR - FOG_FROM)));
      const step = ahead / FOCAL;
      let fx = camX + dx * ahead + rx * step * (0.5 - W / 2);
      let fy = camY + dy * ahead + ry * step * (0.5 - W / 2);
      const sx = rx * step;
      const sy = ry * step;
      const row = y * W;
      for (let x = 0; x < W; x++, fx += sx, fy += sy) {
        let c = this.ground;
        const tx = Math.floor(fx);
        const ty = Math.floor(fy);
        if (tx >= 0 && ty >= 0 && tx < s.cols && ty < s.rows) {
          const i = ty * s.cols + tx;
          const tex = s.race?.line[i] ? this.goal : (this.floorOf[i] ?? (s.ground[i] ? this.wall : null));
          if (tex) {
            const t = tex.px[Math.floor((fy - ty) * tex.h) * tex.w + Math.floor((fx - tx) * tex.w)];
            if (t) c = t;
          }
        }
        px[row + x] = fog > 0 ? mix(c, this.haze, fog) : c;
      }
    }
  }

  /** Blocks stand up as walls: one ray per column of the screen, to the first block it meets. */
  private drawWalls(s: GameState, camX: number, camY: number, dx: number, dy: number, rx: number, ry: number): void {
    const { px } = this;
    for (let x = 0; x < W; x++) {
      const k = (x + 0.5 - W / 2) / FOCAL;
      const rdx = dx + rx * k;
      const rdy = dy + ry * k;
      let mx = Math.floor(camX);
      let my = Math.floor(camY);
      const ddx = Math.abs(1 / rdx);
      const ddy = Math.abs(1 / rdy);
      const stepX = rdx < 0 ? -1 : 1;
      const stepY = rdy < 0 ? -1 : 1;
      let sideX = rdx < 0 ? (camX - mx) * ddx : (mx + 1 - camX) * ddx;
      let sideY = rdy < 0 ? (camY - my) * ddy : (my + 1 - camY) * ddy;
      let side = 0;
      let dist = FAR + 1;
      for (let n = 0; n < FAR * 2; n++) {
        if (sideX < sideY) {
          sideX += ddx;
          mx += stepX;
          side = 0;
        } else {
          sideY += ddy;
          my += stepY;
          side = 1;
        }
        // Past the edge of the level counts as a wall too.
        const outside = mx < 0 || my < 0 || mx >= s.cols || my >= s.rows;
        if (outside || s.ground[my * s.cols + mx]) {
          dist = side === 0 ? sideX - ddx : sideY - ddy;
          break;
        }
      }
      this.depth[x] = dist;
      if (dist > FAR) {
        this.wallTop[x] = HORIZON;
        continue;
      }
      const top = HORIZON + ((EYE - WALL) * FOCAL) / dist;
      const bottom = HORIZON + (EYE * FOCAL) / dist;
      this.wallTop[x] = Math.max(0, Math.floor(top));
      let u = side === 0 ? camY + dist * rdy : camX + dist * rdx;
      u -= Math.floor(u);
      const tex = side === 0 ? this.wall : this.wallShade;
      const tu = Math.min(tex.w - 1, Math.floor(u * tex.w));
      const fog = Math.max(0, Math.min(1, (dist - FOG_FROM) / (FAR - FOG_FROM)));
      const y0 = Math.max(0, Math.floor(top));
      const y1 = Math.min(H, Math.ceil(bottom));
      for (let y = y0; y < y1; y++) {
        const tv = Math.min(tex.h - 1, Math.floor(((y + 0.5 - top) / (bottom - top)) * tex.h));
        const c = tex.px[tv * tex.w + tu];
        if (c) px[y * W + x] = fog > 0 ? mix(c, this.haze, fog) : c;
      }
    }
  }

  /** Rival cars, placed sprites and treasure, standing up; the furthest first, hidden behind walls (taller ones peek over). */
  private drawThings(s: GameState, camX: number, camY: number, dx: number, dy: number, rx: number, ry: number): void {
    const ts = s.tileSize;
    type Thing = { x: number; y: number; tex: Tex; size: number; lift: number };
    const things: Thing[] = [];
    for (const c of s.race?.rivals ?? []) {
      const tex = this.standing.get(c.spriteId);
      if (tex) things.push({ x: (c.x + c.w / 2) / ts, y: (c.y + c.h / 2) / ts, tex, size: CAR, lift: 0 });
    }
    for (const d of s.props) {
      const tex = this.standing.get(d.spriteId);
      if (tex && !d.hidden) things.push({ x: d.x + 0.5, y: d.y + 0.5, tex, size: this.passThrough.has(d.spriteId) ? SCENERY : THING, lift: 0 });
    }
    const bob = Math.sin(s.time * 4) * 0.05;
    for (const c of s.collectibles) if (!c.collected && !c.hidden) things.push({ x: c.tx + 0.5, y: c.ty + 0.5, tex: this.coin, size: TREASURE, lift: 0.2 + bob });
    const near = things
      .map((t) => ({ ...t, ahead: (t.x - camX) * dx + (t.y - camY) * dy, across: (t.x - camX) * rx + (t.y - camY) * ry }))
      .filter((t) => t.ahead > 0.25 && t.ahead < FAR)
      .sort((a, b) => b.ahead - a.ahead);
    const { px } = this;
    for (const t of near) {
      const size = (t.size * FOCAL) / t.ahead;
      const middle = W / 2 + (t.across / t.ahead) * FOCAL;
      const bottom = HORIZON + ((EYE - t.lift) * FOCAL) / t.ahead;
      const top = bottom - size;
      const left = middle - size / 2;
      const x0 = Math.max(0, Math.floor(left));
      const x1 = Math.min(W, Math.ceil(left + size));
      const y0 = Math.max(0, Math.floor(top));
      const y1 = Math.min(H, Math.ceil(bottom));
      const fog = Math.max(0, Math.min(1, (t.ahead - FOG_FROM) / (FAR - FOG_FROM)));
      for (let x = x0; x < x1; x++) {
        const behindWall = t.ahead > this.depth[x];
        const tu = Math.min(t.tex.w - 1, Math.floor(((x + 0.5 - left) / size) * t.tex.w));
        // Behind a wall only the part above its top shows.
        const yEnd = behindWall ? Math.min(y1, this.wallTop[x]) : y1;
        for (let y = y0; y < yEnd; y++) {
          const tv = Math.min(t.tex.h - 1, Math.floor(((y + 0.5 - top) / size) * t.tex.h));
          const c = t.tex.px[tv * t.tex.w + tu];
          if (c) px[y * W + x] = fog > 0 ? mix(c, this.haze, fog) : c;
        }
      }
    }
  }

  /** The front of the player's car, in its paint, leaning a little into turns. */
  private drawHood(ctx: CanvasRenderingContext2D, s: GameState): void {
    const lean = Math.max(-1, Math.min(1, (s.player.vx * Math.cos(s.flight.heading) + s.player.vy * Math.sin(s.flight.heading)) / 30)) * 4;
    ctx.save();
    ctx.translate(W / 2, H);
    ctx.fillStyle = '#1a1c2c';
    ctx.beginPath();
    ctx.moveTo(-150, 0);
    ctx.lineTo(-104 + lean, -30);
    ctx.lineTo(104 + lean, -30);
    ctx.lineTo(150, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = this.hood;
    ctx.beginPath();
    ctx.moveTo(-144, 0);
    ctx.lineTo(-100 + lean, -27);
    ctx.lineTo(100 + lean, -27);
    ctx.lineTo(144, 0);
    ctx.closePath();
    ctx.fill();
    // A shine along the middle of the bonnet.
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(-8 + lean, -27);
    ctx.lineTo(8 + lean, -27);
    ctx.lineTo(14, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** The little map, top right under the race counters: the track, and a dot for each car (the player's is white). */
  private drawMap(ctx: CanvasRenderingContext2D, s: GameState): void {
    const scale = this.mapScale;
    const mw = this.map.width * scale;
    const mh = this.map.height * scale;
    const x = W - mw - 6;
    const y = 28;
    ctx.fillStyle = 'rgba(15,23,42,0.45)';
    ctx.fillRect(x - 2, y - 2, mw + 4, mh + 4);
    ctx.drawImage(this.map, x, y, mw, mh);
    const ts = s.tileSize;
    const dot = (b: { x: number; y: number; w: number; h: number }, colour: string, r: number) => {
      ctx.fillStyle = '#1a1c2c';
      ctx.fillRect(Math.round(x + ((b.x + b.w / 2) / ts) * scale - r - 0.5), Math.round(y + ((b.y + b.h / 2) / ts) * scale - r - 0.5), r * 2 + 1, r * 2 + 1);
      ctx.fillStyle = colour;
      ctx.fillRect(Math.round(x + ((b.x + b.w / 2) / ts) * scale - r), Math.round(y + ((b.y + b.h / 2) / ts) * scale - r), r * 2, r * 2);
    };
    for (const c of s.race?.rivals ?? []) dot(c, '#facc15', 1);
    dot(s.player, '#ffffff', 1.5);
  }

  /** Big words across the middle of the screen. */
  banner(ctx: CanvasRenderingContext2D, text: string, colour: string, y: number, size = 40): void {
    ctx.font = `900 ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#1a1c2c';
    ctx.strokeText(text, W / 2, y);
    ctx.fillStyle = colour;
    ctx.fillText(text, W / 2, y);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
}
