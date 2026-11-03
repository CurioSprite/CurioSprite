import { frameCount, frameOf, pickView, viewOf } from '../editor/spriteOps';
import { createSpriteCanvas } from '../graphics/spriteCanvas';
import { FACINGS, FLOOR_KEYS, NO_FLOOR, SCREEN_TILES, type Facing, type GameMode, type LevelProject, type Sprite } from '../models/project';
import { attackBox, goalOpen, throttle, worldHeight, worldWidth, type GameState } from './game';

/** Visible world area in world pixels: one screen of 25 × 15 tiles. */
export const VIEW_W = SCREEN_TILES.width * 16;
export const VIEW_H = SCREEN_TILES.height * 16;
/** Backing-store pixels per world pixel (800×480 output, crisp for 16 and 32 px sprites). */
export const RENDER_SCALE = 2;
/** Animation speeds: walking things, and things that animate all the time (torches, spinning treasure). */
const WALK_FPS = 8;
const IDLE_FPS = 4;
/** Attacks are quick, so their frames go faster. */
const ATTACK_FPS = 14;

/** One canvas per animation frame. */
type Frames = HTMLCanvasElement[];
/** A sprite's frames from each side it has been drawn from (the front always). */
type Views = { front: Frames } & Partial<Record<Facing, Frames>>;

const frame = (frames: Frames, index: number): HTMLCanvasElement => frames[index % frames.length];
/** Frame to show at `time` for something that animates all the time. */
const looping = (frames: Frames, time: number): HTMLCanvasElement => frame(frames, Math.floor(time * IDLE_FPS));
/** Frame for something that walks: the first while still, the rest in turn while moving. */
const walking = (frames: Frames, time: number, moving: boolean): HTMLCanvasElement => (moving && frames.length > 1 ? frame(frames, Math.floor(time * WALK_FPS)) : frames[0]);

/** Draws a GameState to a canvas. Knows nothing about the editor or React. */
export class GameRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly player: Views;
  private readonly mode: GameMode;
  /** The attack's picture (pointing right); none in games without one. */
  private readonly attack: Frames | null;
  private readonly solid: HTMLCanvasElement;
  private readonly collectible: Frames;
  private readonly goal: Frames | null;
  private readonly background: string;
  private readonly images = new Map<string, Frames>();
  /** The floor, square by square (row after row): each square's frames, or null when bare. */
  private readonly floor: Array<Frames | null> = [];
  /** Things that walk about (enemies) can face different ways. */
  private readonly walkers = new Map<string, Views>();

  constructor(private readonly canvas: HTMLCanvasElement, project: LevelProject) {
    canvas.width = VIEW_W * RENDER_SCALE;
    canvas.height = VIEW_H * RENDER_SCALE;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not supported');
    this.ctx = ctx;
    const sprite = (id: string) => project.sprites.find((s) => s.id === id) ?? project.sprites[0];
    const frames = (sp: Sprite): Frames => Array.from({ length: frameCount(sp) }, (_, i) => createSpriteCanvas(frameOf(sp, i), project.palette));
    const views = (sp: Sprite): Views => {
      const all: Views = { front: frames(sp) };
      for (const f of FACINGS) {
        const view = f === 'front' ? null : viewOf(sp, f);
        if (view) all[f] = Array.from({ length: frameCount(view) }, (_, i) => createSpriteCanvas(frameOf(view, i), project.palette));
      }
      return all;
    };
    this.mode = project.settings.mode;
    this.player = views(sprite(project.player.spriteId));
    const attack = project.player.attack && project.sprites.find((sp) => sp.id === project.player.attack!.spriteId);
    this.attack = attack ? frames(attack) : null;
    // Blocks are ground: always their first frame.
    this.solid = createSpriteCanvas(sprite(project.level.solidSpriteId), project.palette);
    this.collectible = frames(sprite(project.level.collectibleSpriteId));
    // Goal tiles only matter (and are only drawn) when the rule uses them.
    this.goal = project.settings.winRule === 'coins' ? null : frames(sprite(project.level.goalSpriteId));
    this.background = project.level.background;
    // Placed sprites (scenery, blocks and enemies), drawn once each.
    for (const o of project.level.objects) {
      if (o.spriteId && !this.images.has(o.spriteId)) this.images.set(o.spriteId, frames(sprite(o.spriteId)));
    }
    for (const e of project.level.enemies) if (!this.walkers.has(e.spriteId)) this.walkers.set(e.spriteId, views(sprite(e.spriteId)));
    const floorFrames = project.level.floorTypes.map((f) => frames(sprite(f.spriteId)));
    for (const row of project.level.floor) {
      for (const c of row) this.floor.push(c === NO_FLOOR ? null : (floorFrames[FLOOR_KEYS.indexOf(c)] ?? null));
    }
  }

  render(s: GameState): void {
    const { ctx } = this;
    const ts = s.tileSize;
    const p = s.player;

    // Camera follows the player; small levels are centred.
    const ww = worldWidth(s);
    const wh = worldHeight(s);
    const camX = ww <= VIEW_W ? (ww - VIEW_W) / 2 : s.mode === 'shooter' ? s.flight.camX : clamp(p.x + p.w / 2 - VIEW_W / 2, 0, ww - VIEW_W);
    // Levels shorter than the screen sit on the bottom edge, with extra sky above. A shooter's screen flies with the ship.
    const camY = wh <= VIEW_H ? wh - VIEW_H : s.mode === 'shooter' ? s.flight.camY : clamp(p.y + p.h / 2 - VIEW_H / 2, 0, wh - VIEW_H);

    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = this.background;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.translate(-Math.round(camX), -Math.round(camY));

    const x0 = Math.max(0, Math.floor(camX / ts));
    const x1 = Math.min(s.cols - 1, Math.floor((camX + VIEW_W) / ts));
    const y0 = Math.max(0, Math.floor(camY / ts));
    const y1 = Math.min(s.rows - 1, Math.floor((camY + VIEW_H) / ts));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const floor = this.floor[ty * s.cols + tx];
        if (floor) ctx.drawImage(looping(floor, s.time), tx * ts, ty * ts, ts, ts);
      }
    }
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (s.ground[ty * s.cols + tx]) ctx.drawImage(this.solid, tx * ts, ty * ts, ts, ts);
      }
    }

    for (const d of s.props) {
      const image = this.images.get(d.spriteId);
      if (!image || d.hidden || d.x < x0 - 1 || d.x > x1 + 1) continue;
      ctx.drawImage(looping(image, s.time), d.x * ts, d.y * ts, ts, ts);
    }

    if (this.goal) {
      // A locked goal is faded until every coin is collected.
      ctx.globalAlpha = goalOpen(s) ? 1 : 0.4;
      for (const g of s.goals) {
        if (g.hidden) continue;
        if (g.tx < x0 - 1 || g.tx > x1 + 1) continue;
        ctx.drawImage(looping(this.goal, s.time), g.tx * ts, g.ty * ts, ts, ts);
      }
      ctx.globalAlpha = 1;
    }

    const bob = Math.sin(s.time * 4) * 1.5;
    for (const c of s.collectibles) {
      if (c.collected || c.hidden || c.tx < x0 - 1 || c.tx > x1 + 1) continue;
      ctx.drawImage(looping(this.collectible, s.time), c.tx * ts, Math.round(c.ty * ts + bob), ts, ts);
    }

    // Enemies flash white-ish while hurt; they face the way they walk.
    for (const e of s.enemies) {
      if (!e.alive || e.hidden) continue;
      const views = this.walkers.get(e.spriteId) ?? (this.images.has(e.spriteId) ? { front: this.images.get(e.spriteId)! } : null);
      if (!views) continue;
      const moving = Math.abs(e.vx) > 1 || Math.abs(e.vy) > 1;
      const { frames, mirror } = this.facing(views, moving ? { x: e.vx, y: e.vy } : e.dir);
      if (e.hurt > 0 && Math.floor(e.hurt * 20) % 2 === 0) ctx.globalAlpha = 0.35;
      this.drawBody(walking(frames, s.time, moving), e, ts, mirror);
      ctx.globalAlpha = 1;
    }

    // The player blinks while safe after being hurt.
    if (!(p.safe > 0 && s.battleStyle === 'action' && Math.floor(p.safe * 12) % 2 === 0)) {
      if (s.mode === 'shooter') {
        // The ship is drawn pointing up (seen from behind), turned the way it points.
        const { frames } = this.facing(this.player, { x: 0, y: -1 });
        this.drawRotated(this.heroFrame(s, frames), p.x + p.w / 2, p.y + p.h / 2, ts, s.flight.heading);
      } else {
        const { frames, mirror } = this.facing(this.player, s.mode === 'platformer' ? { x: p.facing, y: 0 } : p.face);
        this.drawBody(this.heroFrame(s, frames), p, ts, mirror);
      }
    }

    // The shield: a faint bubble while it is up, glowing when it stops a hit.
    if (s.maxShield && (s.shield >= 1 || s.shieldHit > 0)) {
      const glow = s.shieldHit / 0.4;
      ctx.strokeStyle = `rgba(56, 189, 248, ${0.3 + 0.6 * glow})`;
      ctx.fillStyle = `rgba(56, 189, 248, ${0.08 + 0.25 * glow})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x + p.w / 2, p.y + p.h / 2, ts * 0.7 + glow * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // The attack: its picture where the swing lands, or flying; a plain swipe without one.
    const box = attackBox(s);
    const dir = s.mode === 'platformer' ? { x: p.facing, y: 0 } : p.face;
    const attackFrame = this.attack && frame(this.attack, Math.floor(s.time * ATTACK_FPS));
    if (box) {
      if (attackFrame) {
        this.drawTurned(attackFrame, box.x + box.w / 2, box.y + box.h / 2, ts, dir);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath();
        ctx.roundRect(box.x, box.y, box.w, box.h, 5);
        ctx.fill();
      }
    }
    // Shooter enemy fire: little flickering balls.
    for (const b of s.bombs) {
      const flip = Math.floor(s.time * 12 + b.x) % 2;
      ctx.fillStyle = flip ? '#fde047' : '#f97316';
      ctx.beginPath();
      ctx.arc(b.x + b.w / 2, b.y + b.h / 2, b.w / 2 + 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(Math.round(b.x + b.w / 2) - 1, Math.round(b.y + b.h / 2) - 1, 2, 2);
    }
    for (const shot of s.shots) {
      const cx = shot.x + shot.w / 2;
      const cy = shot.y + shot.h / 2;
      if (attackFrame && s.mode === 'shooter') {
        // Pictures point right; shooter shots can fly any way.
        this.drawRotated(attackFrame, cx, cy, ts, Math.atan2(shot.dir.y, shot.dir.x));
      } else if (attackFrame) {
        this.drawTurned(attackFrame, cx, cy, ts, shot.dir);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(cx, cy, shot.w / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (s.mode === 'shooter') this.drawSpeed(s);
  }

  /** A shooter's speed: a bar at the right edge of the screen that fills as the ship goes faster. */
  private drawSpeed(s: GameState): void {
    const { ctx } = this;
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    const h = 64;
    const x = VIEW_W - 10;
    const y = VIEW_H - h - 8;
    ctx.fillStyle = 'rgba(15,23,42,0.6)';
    ctx.fillRect(x - 1, y - 1, 6, h + 2);
    const full = Math.round(h * Math.max(0.04, throttle(s)));
    ctx.fillStyle = throttle(s) > 0.75 ? '#f97316' : '#facc15';
    ctx.fillRect(x, y + h - full, 4, full);
  }

  /** Draws a picture that points right, turned to point along `dir` (mirrored for left, so it stays upright). */
  private drawTurned(image: HTMLCanvasElement, cx: number, cy: number, size: number, dir: { x: number; y: number }): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));
    if (dir.y > 0) ctx.rotate(Math.PI / 2);
    else if (dir.y < 0) ctx.rotate(-Math.PI / 2);
    else if (dir.x < 0) ctx.scale(-1, 1);
    ctx.drawImage(image, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  /** Draws a picture centred on a point, turned by an angle (radians, clockwise). */
  private drawRotated(image: HTMLCanvasElement, cx: number, cy: number, size: number, angle: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));
    ctx.rotate(angle);
    ctx.drawImage(image, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  /** The frames for the way something is heading (front, back or side, by the game's view). */
  private facing(views: Views, dir: { x: number; y: number }): { frames: Frames; mirror: boolean } {
    const { facing, mirror } = pickView({ back: !!views.back, side: !!views.side }, this.mode, dir);
    return { frames: views[facing] ?? views.front, mirror };
  }

  /** The hero walks while moving; in side view a step frame shows while in the air. */
  private heroFrame(s: GameState, frames: Frames): HTMLCanvasElement {
    const p = s.player;
    if (s.mode === 'platformer' && !p.onGround && frames.length > 1) return frames[1];
    // A ship's engine flickers while it thrusts.
    if (s.mode === 'shooter') return walking(frames, s.time * 2, s.flight.thrusting);
    return walking(frames, s.time, Math.abs(p.vx) > 1 || (s.mode !== 'platformer' && Math.abs(p.vy) > 1));
  }

  /** Sprites are a full tile; the hitbox is slightly smaller and bottom-aligned. */
  private drawBody(image: HTMLCanvasElement, b: { x: number; y: number; w: number; h: number }, ts: number, mirror: boolean): void {
    const { ctx } = this;
    const drawX = Math.round(b.x + b.w / 2 - ts / 2);
    const drawY = Math.round(b.y + b.h - ts);
    if (mirror) {
      ctx.save();
      ctx.translate(drawX + ts, drawY);
      ctx.scale(-1, 1);
      ctx.drawImage(image, 0, 0, ts, ts);
      ctx.restore();
    } else {
      ctx.drawImage(image, drawX, drawY, ts, ts);
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
