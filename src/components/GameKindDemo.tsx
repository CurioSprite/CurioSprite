import { useEffect, useRef } from 'react';
import type { ChoiceOption } from './Dialogs';
import { frameCount, frameOf, pickView, viewOf } from '../editor/spriteOps';
import { createSpriteCanvas } from '../graphics/spriteCanvas';
import { createAdventureProject } from '../models/adventure';
import { createProject } from '../models/defaults';
import { createRacingProject } from '../models/racing';
import { createShooterProject } from '../models/shooter';
import { LEVEL_KINDS, LEVEL_KIND_TEXT, type LevelKind } from '../models/levels';
import type { AnimatedImage, Facing, GameMode, Project } from '../models/project';

/** The hero to show walking about (a player's own, or the starter one). */
export interface DemoHero {
  sprite: AnimatedImage;
  palette: readonly string[];
}

/** The little scene is 6 × 4 squares of 16 pixels, drawn twice as big. */
const W = 96;
const H = 64;
const SCALE = 2;

type Pictures = Record<Facing, HTMLCanvasElement[] | null>;

function picturesOf(img: AnimatedImage, palette: readonly string[]): Pictures {
  const view = (f: Facing) => {
    const v = viewOf(img, f);
    return v ? Array.from({ length: frameCount(v) }, (_, i) => createSpriteCanvas(frameOf(v, i), palette)) : null;
  };
  return { front: view('front'), back: view('back'), side: view('side') };
}

/** The starter games' sprites, by name, made once. */
let kit: Map<string, Pictures> | null = null;
function starterArt(): Map<string, Pictures> {
  if (kit) return kit;
  kit = new Map();
  const when = new Date(0);
  for (const p of [createProject('demo', when, 'platformer'), createAdventureProject('demo', when), createShooterProject('demo', when), createRacingProject('demo', when)]) {
    for (const s of p.sprites) if (!kit.has(s.name)) kit.set(s.name, picturesOf(s, p.palette));
  }
  return kit;
}

/** A game's own hero, to star in the pictures. */
export function heroOf(project: Project): DemoHero | undefined {
  const sprite = project.sprites.find((s) => s.id === project.player.spriteId);
  return sprite && { sprite, palette: project.palette };
}

const heroArt = new WeakMap<AnimatedImage, Pictures>();
function heroPictures(hero: DemoHero | undefined, kind: LevelKind): Pictures {
  // Without a hero of their own, a shooter flies the starter ship and a race drives the starter car.
  if (!hero) return starterArt().get(kind === 'shooter' ? 'Ship' : kind === 'racing' ? 'Race car' : 'Hero')!;
  let p = heroArt.get(hero.sprite);
  if (!p) heroArt.set(hero.sprite, (p = picturesOf(hero.sprite, hero.palette)));
  return p;
}

interface Scene {
  ctx: CanvasRenderingContext2D;
  hero: Pictures;
  t: number;
}

function put(ctx: CanvasRenderingContext2D, pics: Pictures | undefined, x: number, y: number, o: { facing?: Facing; frame?: number; mirror?: boolean; size?: number } = {}) {
  const list = (o.facing && pics?.[o.facing]) || pics?.front;
  if (!list) return;
  const img = list[Math.max(0, Math.floor(o.frame ?? 0)) % list.length];
  const size = o.size ?? 16;
  x = Math.round(x);
  y = Math.round(y);
  if (o.mirror) {
    ctx.save();
    ctx.translate(x + size, y);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, size, size);
    ctx.restore();
  } else ctx.drawImage(img, x, y, size, size);
}

/** Which way the hero looks, using its views the way the game does. */
function heroView(hero: Pictures, mode: GameMode, dir: { x: number; y: number }) {
  return pickView({ back: !!hero.back, side: !!hero.side }, mode, dir);
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, age: number) {
  if (age < 0 || age > 0.35) return;
  const r = 3 + age * 20;
  ctx.fillStyle = '#fde047';
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + 0.6;
    ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 2, 2);
  }
}

const easeArc = (p: number, height: number) => -height * Math.sin(Math.PI * Math.min(1, Math.max(0, p)));

/** Running right, hopping over blocks and slimes and grabbing the coins above them. */
function runScene({ ctx, hero, t }: Scene) {
  const art = starterArt();
  const SPEED = 40;
  const GAP = 64;
  const heroX = 20;
  const worldX = t * SPEED;
  const cam = worldX - heroX;
  ctx.fillStyle = '#7dd3fc';
  ctx.fillRect(0, 0, W, H);
  // A cloud drifting slower than the ground.
  ctx.fillStyle = '#f0f9ff';
  const cloud = (((-cam / 3) % 140) + 140) % 140 - 30;
  ctx.fillRect(Math.round(cloud), 8, 22, 6);
  ctx.fillRect(Math.round(cloud) + 5, 4, 12, 6);
  for (let x = -(((cam % 16) + 16) % 16); x < W; x += 16) put(ctx, art.get('Block'), x, 48);
  let jump = 0;
  const first = Math.floor(cam / GAP);
  for (let k = first; k <= first + 3; k++) {
    if (k < 1) continue;
    const ox = k * GAP;
    const sx = ox - cam;
    if (k % 2 === 0) put(ctx, art.get('Block'), sx, 32);
    else put(ctx, art.get('Slime'), sx + Math.sin(t * 6 + k) * 3, 32, { frame: t * 4 });
    const past = worldX - ox;
    if (past < 0) put(ctx, art.get('Coin'), sx, 6, { frame: t * 6 });
    else sparkle(ctx, sx + 8, 14, past / SPEED);
    const d = worldX - ox;
    if (d > -28 && d < 24) jump = easeArc((d + 28) / 52, 30);
  }
  const v = heroView(hero, 'platformer', { x: 1, y: 0 });
  put(ctx, hero, heroX, 32 + jump, { facing: v.facing, mirror: v.mirror, frame: jump ? 0 : t * 8 });
}

/** Hopping from ledge to ledge up a tower, the view rising along, to the flag. */
function climbScene({ ctx, hero, t }: Scene) {
  const art = starterArt();
  const HOPS = 5;
  const HOP = 0.8;
  const RISE = 22;
  const time = t % (HOPS * HOP + 1.2);
  const ledgeX = (i: number) => (i === 0 ? 8 : i % 2 ? 56 : 8);
  const ledgeTop = (i: number) => 48 - i * RISE;
  const hop = Math.min(HOPS, Math.floor(time / HOP));
  const p = hop >= HOPS ? 0 : Math.max(0, (time - hop * HOP - 0.2) / (HOP - 0.2));
  const from = hop;
  const to = Math.min(HOPS, hop + 1);
  const hx = ledgeX(from) + 8 + (ledgeX(to) - ledgeX(from)) * p;
  const hy = ledgeTop(from) - 16 + (ledgeTop(to) - ledgeTop(from)) * p + easeArc(p, 14);
  const camY = Math.min(0, hy - 30);
  ctx.fillStyle = '#7dd3fc';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(0, -Math.round(camY));
  for (let x = 0; x < W; x += 16) put(ctx, art.get('Block'), x, 48);
  for (let i = 1; i <= HOPS; i++) {
    put(ctx, art.get('Block'), ledgeX(i), ledgeTop(i));
    put(ctx, art.get('Block'), ledgeX(i) + 16, ledgeTop(i));
    // A coin above each jump, gone once the hero has passed it.
    const cx = (ledgeX(i - 1) + ledgeX(i)) / 2 + 8;
    const cy = ledgeTop(i) - 30;
    const passed = hop > i - 1 || (hop === i - 1 && p > 0.55);
    if (!passed) put(ctx, art.get('Coin'), cx, cy, { frame: t * 6 });
    else if (hop === i - 1) sparkle(ctx, cx + 8, cy + 8, ((p - 0.55) * (HOP - 0.2)));
  }
  put(ctx, art.get('Flag'), ledgeX(HOPS) + 22, ledgeTop(HOPS) - 16);
  const dir = { x: ledgeX(to) >= ledgeX(from) ? 1 : -1, y: 0 };
  const v = heroView(hero, 'platformer', dir);
  put(ctx, hero, hx, hy, { facing: v.facing, mirror: v.mirror });
  if (hop >= HOPS) sparkle(ctx, ledgeX(HOPS) + 24, ledgeTop(HOPS) - 8, ((time - HOPS * HOP) % 0.4));
  ctx.restore();
}

/** Square by square along a path into tall grass, where a wild creature jumps out. */
function adventureScene({ ctx, hero, t }: Scene) {
  const art = starterArt();
  const STEP = 0.45;
  const STEPS = 4;
  const WALK = STEPS * STEP;
  const SHOCK = 0.6;
  const FLASH = 0.3;
  const BATTLE = 2.6;
  const LOOP = WALK + SHOCK + FLASH + BATTLE;
  const round = Math.floor(t / LOOP);
  const time = t % LOOP;
  const wild = round % 2 ? 'Pebble Crab' : 'Leaf Beetle';

  if (time < WALK + SHOCK + FLASH) {
    for (let y = 16; y < H; y += 16)
      for (let x = 0; x < W; x += 16) {
        const path = y === 32 && x < 64;
        put(ctx, art.get(path ? 'Path' : x >= 48 ? 'Tall grass' : 'Grass'), x, y);
      }
    for (let x = 0; x < W; x += 16) put(ctx, art.get('Tree'), x, 0);
    put(ctx, art.get('Flowers'), 16, 48);
    const step = Math.min(STEPS, Math.floor(time / STEP));
    const p = step >= STEPS ? 0 : Math.min(1, (time - step * STEP) / (STEP * 0.6));
    const hx = (step + p) * 16;
    const v = heroView(hero, 'topdown', { x: 1, y: 0 });
    put(ctx, hero, hx, 32, { facing: v.facing, mirror: v.mirror, frame: p > 0 && p < 1 ? 1 : 0 });
    if (time >= WALK) {
      // "!" over the hero's head.
      ctx.fillStyle = '#fff';
      ctx.fillRect(hx + 5, 15, 6, 12);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(hx + 7, 17, 2, 5);
      ctx.fillRect(hx + 7, 23, 2, 2);
    }
    if (time >= WALK + SHOCK) {
      const f = (time - WALK - SHOCK) / FLASH;
      ctx.fillStyle = `rgba(255,255,255,${Math.floor(f * 6) % 2 ? 0.9 : 0.3})`;
      ctx.fillRect(0, 0, W, H);
    }
    return;
  }

  // The battle screen: the creature on the right, the hero from behind, a text box below.
  const b = time - WALK - SHOCK - FLASH;
  ctx.fillStyle = '#ecfccb';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#a3d977';
  ctx.beginPath();
  ctx.ellipse(70, 30, 18, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(24, 46, 20, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  const slideIn = Math.min(1, b / 0.4);
  const hit = b > 1.3 && b < 1.6;
  if (!hit || Math.floor(b * 20) % 2) put(ctx, art.get(wild), 62 + (1 - slideIn) * 40, 12, { frame: b * 4 });
  const lunge = b > 1.1 && b < 1.4 ? Math.sin(((b - 1.1) / 0.3) * Math.PI) * 6 : 0;
  const v = pickView({ back: !!hero.back, side: !!hero.side }, 'topdown', { x: 0, y: -1 });
  put(ctx, hero, 12 - (1 - slideIn) * 40 + lunge, 18 - lunge / 2, { facing: v.facing, size: 26 });
  // The creature's health bar.
  const hp = b < 1.4 ? 1 : Math.max(0.5, 1 - (b - 1.4) * 1.5);
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(4, 4, 34, 6);
  ctx.fillStyle = hp > 0.5 ? '#22c55e' : '#facc15';
  ctx.fillRect(5, 5, Math.round(32 * hp), 4);
  // Text box.
  ctx.fillStyle = '#fff';
  ctx.fillRect(2, 50, W - 4, 12);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.strokeRect(2.5, 50.5, W - 5, 11);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 6px ui-rounded, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(b < 1.1 ? `A wild ${wild}!` : 'You attack!', 6, 56.5);
}

/** The first time in [from, to] that `test` holds (it holds from then on). */
function firstTime(from: number, to: number, test: (t: number) => boolean): number {
  if (!test(to)) return Infinity;
  for (let i = 0; i < 20; i++) {
    const mid = (from + to) / 2;
    if (test(mid)) to = mid;
    else from = mid;
  }
  return to;
}

/** Flying along a winding canal, turning with it, speeding up and slowing down, shooting the boats ahead; a gun tower on the bank fires back. */
function shooterScene({ ctx, hero, t }: Scene) {
  const art = starterArt();
  const LOOP = 7;
  const SHIP_Y = 44;
  const LASER = 140;
  const time = t % LOOP;
  // How far the ship has flown: its speed rises and falls (the thrust).
  const speedAt = (at: number) => 26 + 14 * Math.sin(at * 0.9);
  const flown = (at: number) => 26 * at + (14 / 0.9) * (1 - Math.cos(at * 0.9));
  const pos = flown(time);
  /** Where a place that far along is on screen, and the canal's middle there. */
  const screenY = (d: number) => SHIP_Y - (d - pos);
  const middle = (d: number) => 48 + 14 * Math.sin(d / 40) + 4 * Math.sin(d / 13);
  const HALF = 24;
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 2) {
    const m = middle(pos + SHIP_Y - y);
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(0, y, Math.round(m - HALF), 2);
    ctx.fillRect(Math.round(m + HALF), y, W, 2);
    ctx.fillStyle = '#1a1c2c';
    ctx.fillRect(Math.round(m - HALF), y, 1, 2);
    ctx.fillRect(Math.round(m + HALF) - 1, y, 1, 2);
  }
  // Waves and trees go by.
  ctx.fillStyle = '#7dd3fc';
  for (let d = Math.floor((pos - 30) / 17) * 17; d < pos + 60; d += 17) {
    const y = screenY(d);
    ctx.fillRect(Math.round(middle(d) + ((d * 7) % 30) - 15), Math.round(y), 3, 1);
  }
  for (let d = Math.floor((pos - 30) / 37) * 37; d < pos + 60; d += 37) {
    const side = (d / 37) % 2 ? -1 : 1;
    put(ctx, art.get('Bush'), middle(d) + side * (HALF + 10) - 6, screenY(d) - 6, { size: 12 });
  }
  // The tower on the bank, firing once at the ship.
  const TOWER = 150;
  const towerX = middle(TOWER) - HALF - 14;
  put(ctx, art.get('Gun tower'), towerX, screenY(TOWER) - 12, { frame: time * 2, size: 12 });
  const fireAt = firstTime(0, LOOP, (at) => SHIP_Y - (TOWER - flown(at)) - 12 > 10);
  if (time > fireAt && time < fireAt + 0.9) {
    const k = time - fireAt;
    ctx.fillStyle = Math.floor(t * 12) % 2 ? '#fde047' : '#f97316';
    ctx.fillRect(Math.round(towerX + 6 + k * 30), Math.round(screenY(TOWER) + k * 46), 3, 3);
  }
  // Boats ahead; the ship lines up under each one and fires.
  const BOATS = [60, 115, 185];
  const boatX = (k: number, at: number) => middle(BOATS[k]) - 7 + 4 * Math.sin(at * 2 + k);
  const shotAt = BOATS.map((d) => firstTime(0, LOOP, (at) => d - flown(at) < 40));
  const boatY = (k: number, at: number) => SHIP_Y - (BOATS[k] - flown(at));
  const shotY = (k: number, at: number) => SHIP_Y - 4 - (at - shotAt[k]) * LASER;
  let shipX = middle(pos + 18) - 7;
  BOATS.forEach((_, k) => {
    const hit = firstTime(shotAt[k], LOOP, (at) => at >= shotAt[k] && shotY(k, at) <= boatY(k, at) + 8);
    if (time < hit) put(ctx, art.get('Patrol boat'), boatX(k, time), boatY(k, time) - 4, { frame: time * 4, size: 14 });
    else sparkle(ctx, boatX(k, hit) + 7, boatY(k, hit) + 3, time - hit);
    // Steer under it just before firing.
    const lead = shotAt[k] - time;
    if (lead > 0 && lead < 0.6) shipX += (boatX(k, shotAt[k]) - shipX) * (1 - lead / 0.6);
    // …and drift back to the middle after.
    const after = time - shotAt[k];
    if (after >= 0 && after < 0.5) shipX = boatX(k, shotAt[k]) + (shipX - boatX(k, shotAt[k])) * (after / 0.5);
    if (time >= shotAt[k] && time < hit) {
      ctx.fillStyle = '#67e8f9';
      ctx.fillRect(Math.round(boatX(k, shotAt[k]) + 6), Math.round(shotY(k, time)), 2, 6);
    }
  });
  // The ship turns to point along the canal (and at the boat it is lining up on).
  const v = heroView(hero, 'shooter', { x: 0, y: -1 });
  const ahead = middle(pos + 24) - 7 - shipX;
  const pics = (v.facing && hero[v.facing]) || hero.front;
  if (pics) {
    ctx.save();
    ctx.translate(Math.round(shipX) + 7, SHIP_Y + 7);
    ctx.rotate(Math.max(-0.7, Math.min(0.7, Math.atan2(ahead, 24))));
    ctx.drawImage(pics[Math.floor(t * 8) % pics.length], -7, -7, 14, 14);
    ctx.restore();
  }
  // The speed bar.
  const share = (speedAt(time) - 12) / 28;
  ctx.fillStyle = 'rgba(15,23,42,0.6)';
  ctx.fillRect(W - 6, 30, 4, 30);
  ctx.fillStyle = share > 0.75 ? '#f97316' : '#facc15';
  ctx.fillRect(W - 5, 31 + Math.round(28 * (1 - share)), 2, Math.round(28 * share));
}

/** From the driver's seat: the road winds away to the hills, kerbs flash by, and the hero's car catches a rival and gets past. */
function racingScene({ ctx, t }: Scene) {
  const art = starterArt();
  const HORIZON = 26;
  const LOOP = 6;
  const time = t % LOOP;
  // Sky, and hills that slide across as the road bends.
  const bend = Math.sin(time * 1.1) * 0.9;
  ctx.fillStyle = '#7dd3fc';
  ctx.fillRect(0, 0, W, HORIZON);
  ctx.fillStyle = '#65a30d';
  for (let x = 0; x < W; x++) {
    const hill = 4 + 3 * Math.sin((x + bend * 40) / 9) + 2 * Math.sin((x + bend * 40) / 4 + 1);
    ctx.fillRect(x, HORIZON - Math.round(hill), 1, Math.round(hill));
  }
  // The road, row by row: wider and further round the bend the nearer it is.
  const travelled = time * 9;
  for (let y = HORIZON; y < H; y++) {
    const near = (y - HORIZON + 1) / (H - HORIZON);
    const ahead = 1 / near;
    const middle = W / 2 + bend * 30 * (1 - near) * (1 - near);
    const half = 4 + near * 52;
    const stripe = Math.floor(travelled + ahead * 1.5) % 2 === 0;
    ctx.fillStyle = stripe ? '#84cc16' : '#65a30d';
    ctx.fillRect(0, y, W, 1);
    ctx.fillStyle = stripe ? '#ef4444' : '#f4f4f4';
    ctx.fillRect(Math.round(middle - half - near * 6), y, Math.round(half * 2 + near * 12), 1);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(Math.round(middle - half), y, Math.round(half * 2), 1);
    if (stripe && near > 0.15) {
      ctx.fillStyle = '#f4f4f4';
      ctx.fillRect(Math.round(middle - near * 1.5), y, Math.max(1, Math.round(near * 3)), 1);
    }
  }
  // A rival ahead: nearer and bigger as the hero catches it, then off to the side as it passes.
  const pics = art.get('Blue racer');
  const rear = pics?.back?.[0] ?? pics?.front?.[0];
  if (rear) {
    const catchUp = Math.min(1, time / (LOOP * 0.8));
    const near = 0.15 + catchUp * 0.85;
    const size = 8 + near * 30;
    const y = HORIZON + near * (H - HORIZON) - size;
    const middle = W / 2 + bend * 30 * (1 - near) * (1 - near) + catchUp * catchUp * 34;
    ctx.drawImage(rear, Math.round(middle - size / 2), Math.round(y), Math.round(size), Math.round(size));
  }
  // The bonnet of the hero's car.
  ctx.fillStyle = '#1a1c2c';
  ctx.beginPath();
  ctx.moveTo(10, H);
  ctx.lineTo(24, H - 9);
  ctx.lineTo(72, H - 9);
  ctx.lineTo(86, H);
  ctx.fill();
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.moveTo(12, H);
  ctx.lineTo(25, H - 8);
  ctx.lineTo(71, H - 8);
  ctx.lineTo(84, H);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(46, H - 8, 4, 8);
}

const SCENES: Record<LevelKind, (s: Scene) => void> = {
  platformer: runScene,
  climb: climbScene,
  adventure: adventureScene,
  shooter: shooterScene,
  racing: racingScene,
};

/** A few seconds of pretend play, looping, to show what a kind of game is like. */
export function GameKindDemo({ kind, hero }: { kind: LevelKind; hero?: DemoHero }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const pics = heroPictures(hero, kind);
    const draw = (t: number) => SCENES[kind]({ ctx, hero: pics, t });
    // Without motion, one telling moment stands still.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      draw(kind === 'adventure' ? 4.2 : kind === 'shooter' ? 2.3 : 1.4);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      // The first frame's time can be from just before the start.
      draw(Math.max(0, now - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [kind, hero]);

  return <canvas ref={ref} className="kindDemo" aria-hidden="true" />;
}

/** The kinds of game or level as picture cards for a choose dialog, each starring the hero that kind would use. */
export function gameKindChoices(heroFor: (kind: LevelKind) => DemoHero | undefined = () => undefined): ChoiceOption<LevelKind>[] {
  return LEVEL_KINDS.map((k) => ({ value: k, ...LEVEL_KIND_TEXT[k], art: <GameKindDemo kind={k} hero={heroFor(k)} /> }));
}
