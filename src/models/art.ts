/**
 * Letters used to sketch the starter sprites. Each maps to a 1-based index
 * into DEFAULT_PALETTE ('.' is transparent).
 */
const ART_KEY: Record<string, number> = {
  '.': 0, k: 1, w: 2, g: 3, s: 4, r: 5, o: 6, y: 7, p: 8,
  l: 9, G: 10, t: 11, b: 12, B: 13, u: 14, P: 15, n: 16,
};

export function fromArt(rows: string[]): number[] {
  if (rows.length !== 16 || rows.some((r) => r.length !== 16)) {
    throw new Error('Starter art must be 16×16');
  }
  return rows.flatMap((row) => Array.from(row, (ch) => ART_KEY[ch] ?? 0));
}

