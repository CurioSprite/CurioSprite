/** Default 16-colour palette, picked to be bright and readable for kids. */
export const DEFAULT_PALETTE: readonly string[] = [
  '#1a1c2c', // ink
  '#f4f4f4', // white
  '#94a3b8', // grey
  '#475569', // slate
  '#ef4444', // red
  '#f97316', // orange
  '#facc15', // yellow
  '#fdba74', // peach
  '#84cc16', // lime
  '#16a34a', // green
  '#14b8a6', // teal
  '#38bdf8', // sky
  '#2563eb', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#92400e', // brown
];

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Background colours offered in the game settings. */
export const BACKGROUND_CHOICES: readonly string[] = ['#7dd3fc', '#1e3a8a', '#fde68a', '#bbf7d0', '#fbcfe8', '#1f2937', '#0f172a', '#2563eb'];

/** Returns the CSS colour for a pixel value, or null when transparent. */
export function pixelColor(palette: readonly string[], value: number): string | null {
  if (value <= 0) return null;
  return palette[value - 1] ?? null;
}
