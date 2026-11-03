/**
 * CurioSprite logo mark: a pixel-built "C" in a rainbow gradient with pixels
 * breaking away from its top-right corner, following the project's concept art.
 *
 * Kept dependency-free so the same data renders in React and generates the
 * static favicon (public/favicon.svg).
 */

/** 'X' = gradient pixel; '.' = empty. */
export const LOGO_C_ROWS = [
  '...XXXXXX.',
  '.XXXXXXXXX',
  '.XXX....XX',
  'XXX.......',
  'XXX.......',
  'XXX.......',
  'XXX.......',
  'XXX.......',
  '.XXX....XX',
  '.XXXXXXXXX',
  '...XXXXXX.',
];

/** Pixels "flying off" the C, as [x, y, colour, scale]. */
export const LOGO_SPARKS: ReadonlyArray<readonly [number, number, string, number]> = [
  [10.6, 0.2, '#f59e0b', 0.8],
  [12.2, -1.2, '#f97316', 0.9],
  [11.6, 1.8, '#facc15', 0.6],
  [13.4, 0.6, '#f43f5e', 0.7],
  [12.8, -2.6, '#fb923c', 0.45],
];

/** Gradient stops, left to right. */
export const LOGO_GRADIENT = ['#7c3aed', '#2563eb', '#0ea5e9', '#14b8a6', '#22c55e', '#a3e635', '#facc15'];

/** Brand colours for the letters of "Sprite" and the five tagline words. */
export const BRAND = {
  sprite: ['#0ea5e9', '#7c3aed', '#f97316', '#22c55e', '#0ea5e9', '#f43f5e'],
  tagline: [
    { word: 'Question.', color: '#8b5cf6' },
    { word: 'Understand.', color: '#0ea5e9' },
    { word: 'Explore.', color: '#22c55e' },
    { word: 'Share.', color: '#f97316' },
    { word: 'Test.', color: '#f43f5e' },
  ],
} as const;

const VIEW = { x: -0.5, y: -3.5, w: 15.5, h: 15.5 };

export interface LogoPixel {
  x: number;
  y: number;
  size: number;
  fill: string | null;
}

/** Every square in the mark; `fill: null` means "use the gradient". */
export function logoPixels(): LogoPixel[] {
  const pixels: LogoPixel[] = [];
  LOGO_C_ROWS.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === 'X') pixels.push({ x, y, size: 0.9, fill: null });
  });
  for (const [x, y, fill, scale] of LOGO_SPARKS) pixels.push({ x, y, size: scale, fill });
  return pixels;
}

export const LOGO_VIEWBOX = `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`;
export const LOGO_GRADIENT_SPAN = { x1: 0, y1: 2, x2: 10, y2: 8 };

/** Standalone SVG markup (used for the favicon). */
export function logoMarkSvg(background?: string): string {
  const stops = LOGO_GRADIENT.map((c, i) => `<stop offset="${(i / (LOGO_GRADIENT.length - 1)).toFixed(3)}" stop-color="${c}"/>`).join('');
  const g = LOGO_GRADIENT_SPAN;
  const bg = background
    ? `<rect x="${VIEW.x}" y="${VIEW.y}" width="${VIEW.w}" height="${VIEW.h}" rx="3" fill="${background}"/>`
    : '';
  const rects = logoPixels()
    .map((p) => `<rect x="${p.x}" y="${p.y}" width="${p.size}" height="${p.size}" rx="0.12" fill="${p.fill ?? 'url(#cs)'}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX}"><defs><linearGradient id="cs" gradientUnits="userSpaceOnUse" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}">${stops}</linearGradient></defs>${bg}${rects}</svg>\n`;
}
