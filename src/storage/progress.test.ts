import { describe, expect, it } from 'vitest';
import { GUEST, unlockLevels, unlockedLevels } from './progress';

describe('level progress', () => {
  it('starts with the first level open, opens more, and never closes any', () => {
    expect(unlockedLevels('maya', 'game-1')).toBe(1);
    unlockLevels('maya', 'game-1', 3);
    expect(unlockedLevels('maya', 'game-1')).toBe(3);
    unlockLevels('maya', 'game-1', 2);
    expect(unlockedLevels('maya', 'game-1')).toBe(3);
  });

  it('is kept per player and per game', () => {
    unlockLevels('sam', 'game-2', 2);
    expect(unlockedLevels('sam', 'game-1')).toBe(1);
    expect(unlockedLevels(GUEST, 'game-2')).toBe(1);
  });
});
