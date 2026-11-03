/** Kid-facing wording for win rules, and checks that a game can actually be won. */
import type { LevelProject, WinRule } from './project';

export const WIN_RULE_LABELS: Record<WinRule, string> = {
  coins: 'Get all treasure',
  goal: 'Reach the goal',
  coinsThenGoal: 'Treasure, then goal',
  enemies: 'Beat all enemies',
};

/** One-line explanations, for choosing a rule. */
export const WIN_RULE_HELP: Record<WinRule, string> = {
  coins: 'collect every treasure',
  goal: 'touch a goal flag',
  coinsThenGoal: 'the flag opens once all the treasure is collected',
  enemies: 'beat every enemy',
};

export const WIN_MESSAGES: Record<WinRule, string> = {
  coins: 'You found all the treasure!',
  goal: 'You reached the goal!',
  coinsThenGoal: 'All the treasure and the goal!',
  enemies: 'You beat every enemy!',
};

export const needsCoins = (rule: WinRule): boolean => rule === 'coins' || rule === 'coinsThenGoal';
export const needsGoal = (rule: WinRule): boolean => rule === 'goal' || rule === 'coinsThenGoal';

/** What a level has that win rules care about. */
export interface LevelCounts {
  treasure: number;
  goals: number;
  enemies: number;
}

export function levelCounts(level: Pick<LevelProject['level'], 'objects' | 'enemies'>): LevelCounts {
  const enemyIds = new Set(level.enemies.map((e) => e.spriteId));
  let treasure = 0;
  let goals = 0;
  let enemies = 0;
  for (const o of level.objects) {
    if (o.kind === 'treasure') treasure++;
    else if (o.kind === 'goal') goals++;
    else if (o.spriteId && enemyIds.has(o.spriteId)) enemies++;
  }
  return { treasure, goals, enemies };
}

/** Why the game can't be won yet, or null when it can. */
export function winProblem(rule: WinRule, counts: LevelCounts): string | null {
  if (rule === 'enemies') return counts.enemies === 0 ? 'No enemies yet: place a sprite set to Enemy so the game can be won!' : null;
  const missingCoins = needsCoins(rule) && counts.treasure === 0;
  const missingGoal = needsGoal(rule) && counts.goals === 0;
  if (missingCoins && missingGoal) return 'Add some treasure and a goal flag to make the game winnable!';
  if (missingCoins) return 'No treasure yet: add some to make the game winnable!';
  if (missingGoal) return 'No goal yet: put a goal flag in the level so the game can be won!';
  return null;
}

export const projectWinProblem = (p: LevelProject): string | null => winProblem(p.settings.winRule, levelCounts(p.level));
