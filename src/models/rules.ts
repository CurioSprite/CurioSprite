/** Kid-facing wording for rules ("When … then …"), and how rules are grouped. */
import type { LevelObject, LevelProject, Rule, RuleAction, RuleTrigger, Sprite } from './project';

const spriteName = (project: LevelProject, id: string): string => project.sprites.find((s) => s.id === id)?.name ?? 'a sprite';

/** What an object is called before it gets its own name: its sprite's name, or Treasure / Goal. */
function baseName(project: LevelProject, o: LevelObject): string {
  if (o.kind === 'treasure') return 'Treasure';
  if (o.kind === 'goal') return 'Goal';
  return spriteName(project, o.spriteId!);
}

/** An object's name: its own, or e.g. "Slime 2" (its number never changes). */
export function objectName(project: LevelProject, objectId: string): string {
  const objects = project.level.objects;
  const o = objects.find((x) => x.id === objectId);
  if (!o) return 'a removed object';
  if (o.name) return o.name;
  const n = o.n ?? objects.filter((x) => x.kind === o.kind && x.spriteId === o.spriteId).indexOf(o) + 1;
  return `${baseName(project, o)} ${n}`;
}

/** "Key" for a whole sprite, "Key 2" for one object. */
function target(project: LevelProject, t: { spriteId?: string; objectId?: string }, every = false): string {
  if (t.objectId) return objectName(project, t.objectId);
  return every ? `every ${spriteName(project, t.spriteId!)}` : spriteName(project, t.spriteId!);
}

export function describeTrigger(t: RuleTrigger, project: LevelProject): string {
  switch (t.on) {
    case 'start':
      return 'the game starts';
    case 'collect':
      if (t.objectId) return `${objectName(project, t.objectId)} is collected`;
      if (t.count === 'each') return 'a treasure is collected';
      if (t.count === 'all') return 'all the treasure is collected';
      return `${t.count} treasure${t.count === 1 ? ' is' : 's are'} collected`;
    case 'goalOpen':
      return 'the goal opens';
    case 'beat':
      if (t.objectId) return `${objectName(project, t.objectId)} is beaten`;
      if (t.spriteId) return t.count === 'each' ? `a ${spriteName(project, t.spriteId)} is beaten` : `every ${spriteName(project, t.spriteId)} is beaten`;
      return t.count === 'each' ? 'any enemy is beaten' : 'all the enemies are beaten';
    case 'touch':
      return `the player touches ${t.objectId ? objectName(project, t.objectId) : `a ${spriteName(project, t.spriteId!)}`}`;
    case 'hit':
      return `the player attacks ${t.objectId ? objectName(project, t.objectId) : `a ${spriteName(project, t.spriteId!)}`}`;
    case 'talk':
      return `the player talks to ${t.objectId ? objectName(project, t.objectId) : `a ${spriteName(project, t.spriteId!)}`}`;
    case 'hurt':
      return 'the player loses a heart';
  }
}

export function describeAction(a: RuleAction, project: LevelProject): string {
  switch (a.do) {
    case 'message':
      return `show “${a.text}”`;
    case 'openGoal':
      return 'open the goal';
    case 'hide':
      return `${target(project, a, true)} disappears`;
    case 'show':
      return `${target(project, a, true)} appears`;
    case 'heal':
      return 'give back a heart';
    case 'win':
      return 'win the game';
    case 'goLevel':
      return `go to ${project.levelNames.find((l) => l.id === a.levelId)?.name ?? 'a level that was deleted'}`;
  }
}

/** Sprites and objects that wait, hidden, until a rule shows them. */
export function startsHidden(project: Pick<LevelProject, 'rules'>): { sprites: Set<string>; objects: Set<string> } {
  const sprites = new Set<string>();
  const objects = new Set<string>();
  for (const r of project.rules) {
    if (r.then.do !== 'show') continue;
    if (r.then.objectId) objects.add(r.then.objectId);
    else if (r.then.spriteId) sprites.add(r.then.spriteId);
  }
  return { sprites, objects };
}

/** True when some rule opens the goal, so it starts locked. */
export const goalWaitsForRule = (project: Pick<LevelProject, 'rules'>): boolean => project.rules.some((r) => r.then.do === 'openGoal');

/**
 * What a rule is about, for grouping: the whole game, all the treasure, every
 * copy of one sprite, or one placed object.
 */
export type RuleSubject = { kind: 'game' } | { kind: 'treasure' } | { kind: 'sprite'; spriteId: string } | { kind: 'object'; objectId: string };

export function ruleSubject(r: Rule): RuleSubject {
  const w = r.when;
  if ((w.on === 'collect' || w.on === 'beat' || w.on === 'touch' || w.on === 'hit' || w.on === 'talk') && w.objectId) return { kind: 'object', objectId: w.objectId };
  if (w.on === 'collect') return { kind: 'treasure' };
  if ((w.on === 'touch' || w.on === 'hit' || w.on === 'talk' || w.on === 'beat') && w.spriteId) return { kind: 'sprite', spriteId: w.spriteId };
  return { kind: 'game' };
}

export function sameSubject(a: RuleSubject, b: RuleSubject): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'sprite') return a.spriteId === (b as { spriteId: string }).spriteId;
  if (a.kind === 'object') return a.objectId === (b as { objectId: string }).objectId;
  return true;
}

/** Rules that belong to one object. */
export const objectRules = (project: LevelProject, objectId: string): Rule[] =>
  project.rules.filter((r) => sameSubject(ruleSubject(r), { kind: 'object', objectId }));

/** Sprites that can have their own rules: everything except the Hero, Block, Treasure, Goal and Attack. */
export function ruleSprites(project: LevelProject): Sprite[] {
  const roles = new Set([project.player.spriteId, project.level.solidSpriteId, project.level.collectibleSpriteId, project.level.goalSpriteId, project.player.attack?.spriteId]);
  return project.sprites.filter((s) => !roles.has(s.id));
}

export const isEnemySprite = (project: LevelProject, spriteId: string): boolean => project.level.enemies.some((e) => e.spriteId === spriteId);

/** Is this object an enemy (its sprite is one)? */
export const isEnemyObject = (project: LevelProject, o: LevelObject): boolean => o.kind === 'sprite' && isEnemySprite(project, o.spriteId!);
