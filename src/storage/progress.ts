/**
 * Which levels each player has unlocked in each game. Kept in this browser's
 * local storage (it's only progress: losing it just locks the levels again).
 */
const KEY = 'curiosprite-progress';
/** Progress for nobody in particular, when no player is chosen. */
export const GUEST = 'guest';

type Progress = Record<string, Record<string, number>>;

/** Loaded once; if storage is unavailable (private mode) progress lasts until the page closes. */
let cache: Progress | null = null;

function read(): Progress {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown;
    cache = typeof raw === 'object' && raw !== null ? (raw as Progress) : {};
  } catch {
    cache = {};
  }
  return cache;
}

/** How many levels are open to play (the first always is). */
export function unlockedLevels(playerId: string, gameId: string): number {
  const n = read()[playerId]?.[gameId];
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : 1;
}

/** Opens levels up to `count` (never closes any). */
export function unlockLevels(playerId: string, gameId: string, count: number): void {
  const all = read();
  const mine = (all[playerId] ??= {});
  if ((mine[gameId] ?? 1) >= count) return;
  mine[gameId] = count;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Kept in memory only.
  }
}
