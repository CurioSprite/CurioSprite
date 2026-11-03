/**
 * "Make your hero": builds a 16 × 16 pixel hero from a few choices (head,
 * hair, clothes and their colours), so kids can put themselves in their games.
 * The hero is drawn from the front, the back and the side, each walking. Pure
 * functions; the result is an ordinary sprite they can keep drawing on.
 */
import { LIMITS, type AnimatedImage, type Facing } from './project';

/** One set of colours for everything: skin, hair, eyes and clothes all pick from it. */
export const HERO_COLOURS = [
  '#fde3c8', '#f5c08a', '#d9965b', '#a8693a', '#7a4a26', '#4a2c17',
  '#1a1c2c', '#475569', '#94a3b8', '#f4f4f4',
  '#5b3a1e', '#92400e', '#e8b74a', '#facc15',
  '#c2410c', '#f97316', '#ef4444', '#ec4899',
  '#84cc16', '#16a34a', '#14b8a6', '#38bdf8', '#2563eb', '#7c3aed',
] as const;

export const HAIR_STYLES = ['short', 'long', 'spiky', 'bun', 'curly', 'cap'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export const HAIR_STYLE_LABELS: Record<HairStyle, string> = {
  short: 'Short',
  long: 'Long',
  spiky: 'Spiky',
  bun: 'Bun',
  curly: 'Curly',
  cap: 'Cap',
};

/** The parts that have a colour. */
export const COLOUR_PARTS = ['skin', 'hair', 'eyes', 'helmet', 'shirt', 'vest', 'legs'] as const;
export type ColourPart = (typeof COLOUR_PARTS)[number];

/** The choices, kept with the game so the maker can carry on where it left off. Colours are hex. */
export interface HeroLook {
  head: HeadShape;
  skin: string;
  hairStyle: HairStyle;
  hair: string;
  eyes: string;
  shirt: string;
  legs: string;
  glasses: boolean;
  /** Helmet colour, or none. */
  helmet?: string;
  /** Vest colour (worn over the top), or none. */
  vest?: string;
}

export const DEFAULT_LOOK: HeroLook = { head: 'round', skin: '#f5c08a', hairStyle: 'short', hair: '#5b3a1e', eyes: '#1a1c2c', shirt: '#2563eb', legs: '#475569', glasses: false };

/** Colours a helmet or vest gets when first put on. */
export const GEAR_COLOURS = { helmet: '#94a3b8', vest: '#92400e' } as const;

const OUTLINE = '#1a1c2c';
const MOUTH = '#ef4444';
const SIZE = 16;

/** Head shapes, as the half-width of the face on each row (the face is centred between columns 7 and 8). */
export const HEAD_SHAPES = ['round', 'square', 'wide', 'long', 'pointy'] as const;
export type HeadShape = (typeof HEAD_SHAPES)[number];
export const HEAD_SHAPE_LABELS: Record<HeadShape, string> = {
  round: 'Round',
  square: 'Square',
  wide: 'Wide',
  long: 'Long',
  pointy: 'Pointy',
};
const HEADS: Record<HeadShape, { top: number; halfWidths: number[] }> = {
  round: { top: 2, halfWidths: [3, 4, 4, 4, 4, 4, 3] },
  square: { top: 2, halfWidths: [4, 4, 4, 4, 4, 4, 4] },
  wide: { top: 2, halfWidths: [4, 5, 5, 5, 5, 5, 4] },
  long: { top: 1, halfWidths: [3, 3, 3, 3, 3, 3, 3, 3] },
  pointy: { top: 2, halfWidths: [3, 4, 4, 4, 4, 3, 2] },
};

/** How the hero stands in each frame of the walk. */
export type Pose = 'stand' | 'stepA' | 'stepB';
/** The walk: stand, one foot forward, stand, the other foot forward. */
export const WALK: readonly Pose[] = ['stand', 'stepA', 'stand', 'stepB'];

type Part = 'H' | 'S' | 'E' | 'M' | 'T' | 'L' | 'A' | 'V' | 'k';

/**
 * The hero as colours, row by row (null = see-through), seen from the
 * `facing` side (the side view looks right). Parts are drawn as filled shapes
 * (head, hair, face, clothes), then outlined automatically, so any head shape
 * works with any hair style.
 */
export function buildHero(look: HeroLook, pose: Pose = 'stand', facing: Facing = 'front'): Array<string | null> {
  const grid: Array<Array<Part | null>> = Array.from({ length: SIZE }, () => Array<Part | null>(SIZE).fill(null));
  const put = (x: number, y: number, part: Part) => {
    if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) grid[y][x] = part;
  };
  const head = HEADS[look.head] ?? HEADS.round;
  const span = (i: number) => ({ left: 8 - head.halfWidths[i], right: 7 + head.halfWidths[i] });
  const top = head.top;
  const rows = head.halfWidths.length;
  const helmet = look.helmet !== undefined;
  // Under a helmet, only long hair still shows.
  const style: HairStyle = helmet && look.hairStyle !== 'long' ? 'short' : look.hairStyle;
  const first = span(0);

  // Face, with the hair over the top two rows.
  head.halfWidths.forEach((_, i) => {
    const { left, right } = span(i);
    for (let x = left; x <= right; x++) put(x, top + i, i < 2 ? 'H' : 'S');
  });

  if (facing === 'front') {
    switch (style) {
      case 'long':
        for (let i = 2; i < rows + 1; i++) {
          const { left, right } = span(Math.min(i, rows - 1));
          put(left - 1, top + i, 'H');
          put(right + 1, top + i, 'H');
        }
        break;
      case 'spiky':
        for (let x = first.left; x <= first.right; x += 2) put(x, top - 1, 'H');
        break;
      case 'bun':
        for (let x = 6; x <= 9; x++) put(x, top - 1, 'H');
        put(7, top - 2, 'H');
        put(8, top - 2, 'H');
        break;
      case 'curly':
        for (let x = first.left; x <= first.right; x++) put(x, top - 1, 'H');
        for (let i = 0; i < 4; i++) {
          const { left, right } = span(i);
          put(left - 1, top + i, 'H');
          put(right + 1, top + i, 'H');
        }
        break;
      case 'cap': {
        const brim = span(1);
        put(brim.right + 1, top + 1, 'H');
        put(brim.right + 2, top + 1, 'H');
        break;
      }
      case 'short':
        break;
    }
  } else if (facing === 'back') {
    // From behind the hair covers the head, down to the neck (a cap is just the top).
    if (style !== 'cap') {
      for (let i = 2; i < rows - 1; i++) {
        const { left, right } = span(i);
        for (let x = left; x <= right; x++) put(x, top + i, 'H');
      }
    }
    switch (style) {
      case 'long':
        for (let i = 2; i < rows + 2; i++) {
          const { left, right } = span(Math.min(i, rows - 1));
          for (let x = left - 1; x <= right + 1; x++) put(x, top + i, 'H');
        }
        break;
      case 'spiky':
        for (let x = first.left; x <= first.right; x += 2) put(x, top - 1, 'H');
        break;
      case 'bun':
        for (let x = 6; x <= 9; x++) put(x, top - 1, 'H');
        put(7, top - 2, 'H');
        put(8, top - 2, 'H');
        break;
      case 'curly':
        for (let x = first.left; x <= first.right; x++) put(x, top - 1, 'H');
        for (let i = 0; i < 4; i++) {
          const { left, right } = span(i);
          put(left - 1, top + i, 'H');
          put(right + 1, top + i, 'H');
        }
        break;
      case 'cap':
      case 'short':
        break;
    }
  } else {
    // Side view, looking right: hair over the back of the head, the face at the front.
    const back = (i: number) => span(i).left;
    if (style !== 'cap') {
      for (let i = 2; i < rows - 2; i++) for (let x = back(i); x <= back(i) + 2; x++) put(x, top + i, 'H');
    }
    switch (style) {
      case 'long':
        for (let i = 2; i < rows + 2; i++) {
          const left = back(Math.min(i, rows - 1));
          for (let x = left - 1; x <= left + 1; x++) put(x, top + i, 'H');
        }
        break;
      case 'spiky':
        for (let x = first.left; x <= first.right; x += 2) put(x, top - 1, 'H');
        break;
      case 'bun':
        put(back(0) - 1, top, 'H');
        put(back(0) - 2, top, 'H');
        put(back(0) - 1, top + 1, 'H');
        put(back(0) - 2, top + 1, 'H');
        break;
      case 'curly':
        for (let x = first.left; x <= first.right; x++) put(x, top - 1, 'H');
        for (let i = 0; i < 5; i++) put(back(Math.min(i, rows - 1)) - 1, top + i, 'H');
        break;
      case 'cap': {
        const brim = span(1);
        put(brim.right + 1, top + 1, 'H');
        put(brim.right + 2, top + 1, 'H');
        break;
      }
      case 'short':
        break;
    }
  }

  // Helmet: over the top of the head, a little wider, with cheek guards.
  if (helmet) {
    for (let x = first.left; x <= first.right; x++) put(x, top - 1, 'A');
    for (let i = 0; i < 2; i++) {
      const { left, right } = span(i);
      for (let x = left - 1; x <= right + 1; x++) put(x, top + i, 'A');
    }
    const cheek = span(2);
    if (facing !== 'side') put(cheek.right + 1, top + 2, 'A');
    put(cheek.left - 1, top + 2, 'A');
  }

  // The face: eyes (closer together on a narrow face), glasses and mouth.
  const narrow = Math.min(...head.halfWidths.slice(3, 5)) <= 3;
  const eyeRow = Math.max(top + 3, 5);
  if (facing === 'front') {
    const eyeL = narrow ? 6 : 5;
    const eyeR = narrow ? 9 : 10;
    for (const y of [eyeRow, eyeRow + 1]) {
      put(eyeL, y, 'E');
      put(eyeR, y, 'E');
    }
    if (look.glasses) {
      const { left, right } = span(eyeRow - top);
      for (let x = left; x <= right; x++) if (x !== eyeL && x !== eyeR) put(x, eyeRow, 'k');
    }
    put(7, top + rows - 1, 'M');
    put(8, top + rows - 1, 'M');
  } else if (facing === 'side') {
    const front = span(eyeRow - top).right;
    put(front - 1, eyeRow, 'E');
    put(front - 1, eyeRow + 1, 'E');
    // A nose sticks out a little.
    put(front + 1, eyeRow + 1, 'S');
    if (look.glasses) for (let x = 8; x <= front; x++) if (x !== front - 1) put(x, eyeRow, 'k');
    put(span(rows - 1).right, top + rows - 1, 'M');
  }

  // Body: shirt with arms, then legs, posed for walking.
  if (facing === 'side') {
    for (const y of [10, 11, 12]) for (let x = 6; x <= 9; x++) put(x, y, 'T');
    // An open vest: shirt at the front.
    if (look.vest !== undefined) for (const y of [10, 11, 12]) for (const x of [6, 7]) put(x, y, 'V');
    // The near arm swings forward and back.
    const arm: Record<Pose, Array<[number, number]>> = {
      stand: [[8, 11], [8, 12]],
      stepA: [[9, 11], [10, 12]],
      stepB: [[7, 11], [6, 12]],
    };
    for (const [x, y] of arm[pose]) put(x, y, 'S');
    // Legs together when passing, apart in a stride.
    if (pose === 'stand') {
      for (const y of [13, 14]) for (const x of [7, 8]) put(x, y, 'L');
    } else {
      for (let x = 6; x <= 9; x++) put(x, 13, 'L');
      for (const x of [5, 6, 9, 10]) put(x, 14, 'L');
    }
  } else {
    for (const y of [10, 11, 12]) {
      for (let x = 5; x <= 10; x++) put(x, y, 'T');
    }
    // From the front the vest is open (the shirt shows down the middle); from behind it covers the back.
    if (look.vest !== undefined) {
      const cols = facing === 'back' ? [5, 6, 7, 8, 9, 10] : [5, 6, 9, 10];
      for (const y of [10, 11, 12]) for (const x of cols) put(x, y, 'V');
    }
    // Arms swing opposite to the legs.
    const armL = pose === 'stepB' ? 11 : 12;
    const armR = pose === 'stepA' ? 11 : 12;
    put(4, 11, 'S');
    put(4, armL, 'S');
    put(11, 11, 'S');
    put(11, armR, 'S');
    const legs: Record<Pose, Array<[number, number]>> = {
      // [column of the leg's left edge, how many rows long]
      stand: [[5, 2], [9, 2]],
      stepA: [[4, 2], [9, 1]],
      stepB: [[5, 1], [10, 2]],
    };
    for (const [x, length] of legs[pose]) {
      for (let y = 13; y < 13 + length; y++) {
        put(x, y, 'L');
        put(x + 1, y, 'L');
      }
    }
  }

  // Outline every empty square next to the figure.
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && grid[y][x] !== null;
  const outline: Array<[number, number]> = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (grid[y][x] === null && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) outline.push([x, y]);
    }
  }
  for (const [x, y] of outline) grid[y][x] = 'k';

  const colour: Record<Part, string> = {
    k: OUTLINE,
    H: look.hair,
    S: look.skin,
    E: look.eyes,
    M: MOUTH,
    T: look.shirt,
    L: look.legs,
    A: look.helmet ?? GEAR_COLOURS.helmet,
    V: look.vest ?? GEAR_COLOURS.vest,
  };
  return grid.flatMap((row) => row.map((part) => (part ? colour[part] : null)));
}

/** The walking frames from one side, in order (the first is the hero standing still). */
export const buildHeroWalk = (look: HeroLook, facing: Facing = 'front'): Array<Array<string | null>> => WALK.map((pose) => buildHero(look, pose, facing));

/** The hero walking from every side. */
export type HeroViews = Record<Facing, Array<Array<string | null>>>;
export const buildHeroViews = (look: HeroLook): HeroViews => ({ front: buildHeroWalk(look, 'front'), back: buildHeroWalk(look, 'back'), side: buildHeroWalk(look, 'side') });

/**
 * Turns colours into palette numbers (0 = see-through), adding any colour the
 * palette doesn't have yet. If the palette is full, the nearest colour is used.
 */
export function toPalettePixels(colours: Array<string | null>, palette: readonly string[]): { pixels: number[]; palette: string[] } {
  const next = [...palette];
  const index = (hex: string): number => {
    const found = next.findIndex((c) => c.toLowerCase() === hex.toLowerCase());
    if (found >= 0) return found + 1;
    if (next.length < LIMITS.paletteMax) {
      next.push(hex);
      return next.length;
    }
    return nearest(hex, next) + 1;
  };
  return { pixels: colours.map((c) => (c ? index(c) : 0)), palette: next };
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function nearest(hex: string, palette: readonly string[]): number {
  const [r, g, b] = rgb(hex);
  let best = 0;
  let bestDistance = Infinity;
  palette.forEach((c, i) => {
    const [r2, g2, b2] = rgb(c);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  });
  return best;
}

/** A surprise look. `random` returns 0–1 (Math.random by default). */
export function randomLook(random: () => number = Math.random): HeroLook {
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(random() * list.length)];
  return {
    head: pick(HEAD_SHAPES),
    skin: pick(HERO_COLOURS.slice(0, 6)),
    hairStyle: pick(HAIR_STYLES),
    hair: pick(HERO_COLOURS),
    eyes: pick(['#1a1c2c', '#5b3a1e', '#2563eb', '#16a34a']),
    shirt: pick(HERO_COLOURS.slice(6)),
    legs: pick(HERO_COLOURS.slice(6)),
    glasses: random() < 0.25,
    ...(random() < 0.2 ? { helmet: pick(HERO_COLOURS.slice(6)) } : {}),
    ...(random() < 0.3 ? { vest: pick(HERO_COLOURS.slice(6)) } : {}),
  };
}

/**
 * Before the shared colours, each part had its own list and looks stored a
 * position in it. Those are read back as the colour they meant.
 */
const OLD_COLOURS: Record<ColourPart, readonly string[]> = {
  skin: ['#fde3c8', '#f5c08a', '#d9965b', '#a8693a', '#7a4a26', '#4a2c17'],
  hair: ['#1a1c2c', '#5b3a1e', '#e8b74a', '#c2410c', '#e5e7eb', '#2563eb', '#ec4899', '#16a34a', '#7c3aed'],
  eyes: ['#1a1c2c', '#5b3a1e', '#2563eb', '#16a34a'],
  shirt: ['#ef4444', '#f97316', '#facc15', '#84cc16', '#14b8a6', '#38bdf8', '#2563eb', '#8b5cf6', '#ec4899', '#f4f4f4'],
  legs: ['#2563eb', '#475569', '#92400e', '#1a1c2c', '#16a34a', '#ef4444'],
  helmet: ['#94a3b8', '#facc15', '#ef4444', '#2563eb', '#16a34a', '#1a1c2c'],
  vest: ['#92400e', '#1a1c2c', '#16a34a', '#ef4444', '#2563eb', '#f97316', '#facc15'],
};
const HEX = /^#[0-9a-f]{6}$/i;

/** Reads a saved look, ignoring anything that isn't valid (it's only a convenience). */
export function readLook(raw: unknown): HeroLook | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const colour = (part: ColourPart): string | undefined => {
    const v = r[part];
    if (typeof v === 'string' && HEX.test(v)) return v.toLowerCase();
    return Number.isInteger(v) ? OLD_COLOURS[part][v as number] : undefined;
  };
  // Looks saved before head shapes have none: they had round heads.
  const head = (r.head ?? 'round') as HeadShape;
  const [skin, hair, eyes, shirt, legs] = (['skin', 'hair', 'eyes', 'shirt', 'legs'] as const).map(colour);
  const helmet = r.helmet === undefined ? undefined : colour('helmet');
  const vest = r.vest === undefined ? undefined : colour('vest');
  if (
    !HEAD_SHAPES.includes(head) ||
    !HAIR_STYLES.includes(r.hairStyle as HairStyle) ||
    !skin || !hair || !eyes || !shirt || !legs ||
    typeof r.glasses !== 'boolean' ||
    (r.helmet !== undefined && !helmet) ||
    (r.vest !== undefined && !vest)
  ) {
    return undefined;
  }
  return { head, skin, hairStyle: r.hairStyle as HairStyle, hair, eyes, shirt, legs, glasses: r.glasses, ...(helmet ? { helmet } : {}), ...(vest ? { vest } : {}) };
}

/** Several pictures (animation frames) into palette numbers together, sharing any added colours. */
export function framesToPalette(frames: Array<Array<string | null>>, palette: readonly string[]): { frames: number[][]; palette: string[] } {
  const { pixels, palette: next } = toPalettePixels(frames.flat(), palette);
  const size = frames[0]?.length ?? 0;
  return { frames: frames.map((_, i) => pixels.slice(i * size, (i + 1) * size)), palette: next };
}

/**
 * Pictures of every view (as colours) into one sprite picture in a game's
 * palette: the front with its frames, plus any back and side.
 */
export function viewsToImage(views: { front: Array<Array<string | null>>; back?: Array<Array<string | null>>; side?: Array<Array<string | null>> }, size: number, palette: readonly string[]): { image: AnimatedImage; palette: string[] } {
  const back = views.back ?? [];
  const side = views.side ?? [];
  const { frames: all, palette: next } = framesToPalette([...views.front, ...back, ...side], palette);
  const front = all.slice(0, views.front.length);
  const image: AnimatedImage = { width: size as AnimatedImage['width'], height: size as AnimatedImage['height'], pixels: front[0] };
  if (front.length > 1) image.frames = front.slice(1);
  if (back.length) image.back = all.slice(front.length, front.length + back.length);
  if (side.length) image.side = all.slice(front.length + back.length);
  return { image, palette: next };
}
