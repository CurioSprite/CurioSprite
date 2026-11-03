/** Test helpers. */
import { createProject } from './models/defaults';
import { levelView } from './models/levels';
import type { GameMode, LevelProject } from './models/project';

/** A new game's first level, the way the game and the level editor see it (its level and settings can be changed directly). */
export function createLevelProject(name: string, now: Date = new Date(), view: GameMode = 'platformer', climb = false): LevelProject {
  return levelView(createProject(name, now, view, climb), 0);
}
