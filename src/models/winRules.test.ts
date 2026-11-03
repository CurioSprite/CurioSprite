import { describe, expect, it } from 'vitest';
import { winProblem } from './winRules';

describe('winProblem', () => {
  const coinsOnly = { treasure: 2, goals: 0, enemies: 0 };
  const goalOnly = { treasure: 0, goals: 1, enemies: 0 };
  const both = { treasure: 1, goals: 1, enemies: 0 };
  const neither = { treasure: 0, goals: 0, enemies: 0 };

  it('needs treasure for "coins", a goal for "goal", both for "coinsThenGoal", and enemies for "enemies"', () => {
    expect(winProblem('coins', coinsOnly)).toBeNull();
    expect(winProblem('coins', goalOnly)).toMatch(/treasure/);
    expect(winProblem('goal', goalOnly)).toBeNull();
    expect(winProblem('goal', coinsOnly)).toMatch(/goal/);
    expect(winProblem('coinsThenGoal', both)).toBeNull();
    expect(winProblem('coinsThenGoal', coinsOnly)).toMatch(/goal/);
    expect(winProblem('coinsThenGoal', neither)).toMatch(/treasure and a goal/);
    expect(winProblem('enemies', neither)).toMatch(/enemies/);
    expect(winProblem('enemies', { ...neither, enemies: 1 })).toBeNull();
  });
});
