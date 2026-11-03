/**
 * A game's levels: seeing one level of a game the way the editors and the
 * game itself use it, putting edits back, and adding, copying, removing and
 * reordering levels. Pure functions.
 */
import { adventureLevel } from './adventure';
import { shooterLevel } from './shooter';
import { createDefaultLevel } from './defaults';
import { createId } from './ids';
import { LIMITS, numberObjects, type GameMode, type Level, type LevelConfig, type LevelPlay, type LevelProject, type Project, type Rule, type RuleAction, type RuleTrigger } from './project';
import type { EditResult } from './projectEdits';

/** The kinds of level a new one can start as. */
export const LEVEL_KINDS = ['platformer', 'climb', 'topdown', 'adventure', 'shooter'] as const;
export type LevelKind = (typeof LEVEL_KINDS)[number];
export const LEVEL_KIND_TEXT: Record<LevelKind, { label: string; hint: string }> = {
  platformer: { label: 'Side view', hint: 'Run and jump' },
  climb: { label: 'Climb', hint: 'Jump up a tall tower' },
  topdown: { label: 'Top-down', hint: 'Look down from above' },
  adventure: { label: 'Adventure', hint: 'Explore, talk, meet wild creatures' },
  shooter: { label: 'Shooter', hint: 'Turn and thrust along a canal' },
};

/** Does the rule apply in this level (its own, or one for every level)? */
export const ruleInLevel = (r: Rule, levelId: string): boolean => !r.levelId || r.levelId === levelId;

/** One level of the game, with the settings and rules that apply in it. */
export function levelView(project: Project, index = 0): LevelProject {
  const levelIndex = Math.max(0, Math.min(project.levels.length - 1, index));
  const { levels, settings, rules, ...game } = project;
  const { mode, movement, direction, winRule, ...level } = levels[levelIndex];
  return {
    ...game,
    level,
    settings: { ...settings, mode, movement, direction, winRule },
    rules: rules.filter((r) => ruleInLevel(r, level.id)),
    levelIndex,
    levelCount: levels.length,
    levelNames: levels.map((l) => ({ id: l.id, name: l.name })),
  };
}

/** Puts a level view's edits back: its level, play settings and rules, and the game's sprites, player and settings. */
export function fromLevelView(project: Project, view: LevelProject): Project {
  const { level, settings, rules, levelIndex, levelCount: _count, levelNames: _names, ...game } = view;
  const { mode, movement, direction, winRule, gravity, battle } = settings;
  const withLevel = setLevel(project, levelIndex, level);
  return {
    ...withLevel,
    ...game,
    settings: { gravity, battle },
    levels: withLevel.levels.map((l, i) => (i === levelIndex ? { ...l, mode, movement, direction, winRule } : l)),
    rules: mergeRules(project, levelIndex, rules),
  };
}

export function setLevel(project: Project, index: number, level: LevelConfig): Project {
  return { ...project, levels: project.levels.map((l, i) => (i === index ? { ...l, ...level } : l)) };
}

export function setLevelPlay(project: Project, index: number, play: Partial<LevelPlay>): Project {
  return { ...project, levels: project.levels.map((l, i) => (i === index ? { ...l, ...play } : l)) };
}

/** Replaces the rules that apply in one level (its own and the whole game's), keeping other levels' rules. */
export function setLevelRules(project: Project, index: number, rules: Rule[]): Project {
  return { ...project, rules: mergeRules(project, index, rules) };
}

function mergeRules(project: Project, index: number, rules: Rule[]): Rule[] {
  const id = project.levels[index].id;
  return [...project.rules.filter((r) => !ruleInLevel(r, id)), ...rules];
}

/**
 * A new level at the end, started from the matching starter level. It uses the
 * game's Block, Treasure and Goal sprites, and its sprites act as they do in
 * the last level (walk-through, enemies).
 */
export function addLevel(project: Project, kind: LevelKind): EditResult & { index?: number } {
  if (project.levels.length >= LIMITS.levelsMax) return { ok: false, error: `A game can have up to ${LIMITS.levelsMax} levels.` };
  if (kind === 'adventure') {
    const made = adventureLevel(project, nextLevelName(project.levels));
    return 'error' in made ? { ok: false, error: made.error } : { ok: true, project: made.project, index: project.levels.length };
  }
  if (kind === 'shooter') {
    const made = shooterLevel(project, nextLevelName(project.levels));
    return 'error' in made ? { ok: false, error: made.error } : { ok: true, project: made.project, index: project.levels.length };
  }
  const last = project.levels[project.levels.length - 1];
  const mode: GameMode = kind === 'topdown' ? 'topdown' : 'platformer';
  const starter = createDefaultLevel(last.solidSpriteId, last.collectibleSpriteId, last.goalSpriteId, mode, last.enemies[0], kind === 'climb');
  const level: Level = {
    ...starter,
    name: nextLevelName(project.levels),
    background: kind === 'topdown' ? starter.background : last.mode === 'platformer' ? last.background : starter.background,
    passThroughSpriteIds: [...last.passThroughSpriteIds],
    enemies: last.enemies.map((e) => ({ ...e })),
    mode,
    movement: 'free',
    direction: kind === 'climb' ? 'up' : 'across',
    winRule: 'goal',
  };
  return { ok: true, project: { ...project, levels: [...project.levels, level] }, index: project.levels.length };
}

function nextLevelName(levels: ReadonlyArray<Pick<Level, 'name'>>): string {
  const names = new Set(levels.map((l) => l.name));
  for (let n = levels.length + 1; ; n++) if (!names.has(`Level ${n}`)) return `Level ${n}`;
}

/** A copy right after the original: its objects get new ids, and its own rules come too (pointing at the copies). */
export function duplicateLevel(project: Project, index: number): EditResult & { index?: number } {
  if (project.levels.length >= LIMITS.levelsMax) return { ok: false, error: `A game can have up to ${LIMITS.levelsMax} levels.` };
  const source = project.levels[index];
  const ids = new Map(source.objects.map((o) => [o.id, createId()]));
  const copy: Level = {
    ...source,
    id: createId(),
    name: `${source.name} copy`.slice(0, LIMITS.nameMaxLength),
    objects: numberObjects(source.objects.map((o) => ({ ...o, id: ids.get(o.id)! }))),
  };
  const own = project.rules.filter((r) => r.levelId === source.id);
  if (project.rules.length + own.length > LIMITS.rulesMax) return { ok: false, error: `A game can have up to ${LIMITS.rulesMax} rules.` };
  const remap = <T extends RuleTrigger | RuleAction>(x: T): T => ('objectId' in x && x.objectId && ids.has(x.objectId) ? { ...x, objectId: ids.get(x.objectId) } : x);
  const copiedRules: Rule[] = own.map((r) => ({ ...r, id: createId(), levelId: copy.id, when: remap(r.when), then: remap(r.then) }));
  const levels = [...project.levels];
  levels.splice(index + 1, 0, copy);
  return { ok: true, project: { ...project, levels, rules: [...project.rules, ...copiedRules] }, index: index + 1 };
}

/** Removes a level and its own rules (a game always keeps at least one). */
export function removeLevel(project: Project, index: number): EditResult {
  if (project.levels.length <= 1) return { ok: false, error: 'A game needs at least one level.' };
  const gone = project.levels[index].id;
  // Its own rules go, and so do rules elsewhere that lead to it.
  const keep = (r: Rule) => r.levelId !== gone && !(r.then.do === 'goLevel' && r.then.levelId === gone);
  return {
    ok: true,
    project: { ...project, levels: project.levels.filter((_, i) => i !== index), rules: project.rules.filter(keep) },
  };
}

/** Moves a level to another place in the order. */
export function moveLevel(project: Project, from: number, to: number): Project {
  if (to < 0 || to >= project.levels.length || from === to) return project;
  const levels = [...project.levels];
  const [moved] = levels.splice(from, 1);
  levels.splice(to, 0, moved);
  return { ...project, levels };
}

export function renameLevel(project: Project, index: number, name: string): EditResult {
  const clean = name.trim().slice(0, LIMITS.nameMaxLength);
  if (!clean) return { ok: false, error: 'Levels need a name.' };
  return { ok: true, project: { ...project, levels: project.levels.map((l, i) => (i === index ? { ...l, name: clean } : l)) } };
}
