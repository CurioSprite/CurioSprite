/**
 * Pure edits to a project's sprite list and sprite roles. Each returns a new
 * project; invalid requests return an error message instead.
 */
import { attackColours, starterKind, ATTACK_LABELS, type AttackStarter } from './attacks';
import { createSprite } from './defaults';
import { createId } from './ids';
import { buildHeroViews, viewsToImage, type HeroLook } from './heroMaker';
import { LIMITS, type AttackKind, type Project, type Rule, type Sprite, type SpriteSize } from './project';

/** The jobs a sprite can do in the default game. */
export const SPRITE_ROLES = ['player', 'collectible', 'solid', 'goal', 'attack'] as const;
export type SpriteRole = (typeof SPRITE_ROLES)[number];

export const ROLE_LABELS: Record<SpriteRole, string> = {
  player: 'Player',
  collectible: 'Treasure',
  solid: 'Block',
  goal: 'Goal',
  attack: 'Attack',
};

const LEVEL_ROLE_KEYS = {
  collectible: 'collectibleSpriteId',
  solid: 'solidSpriteId',
  goal: 'goalSpriteId',
} as const;

export type EditResult = { ok: true; project: Project } | { ok: false; error: string };

/** The sprites filling a role: one for the player and attack; Block, Treasure and Goal can differ from level to level. */
function roleSpriteIds(project: Project, role: SpriteRole): Array<string | undefined> {
  if (role === 'player') return [project.player.spriteId];
  if (role === 'attack') return [project.player.attack?.spriteId];
  return project.levels.map((l) => l[LEVEL_ROLE_KEYS[role]]);
}

/** Roles the sprite currently fills, in any level (a sprite may fill several). */
export function rolesOf(project: Project, spriteId: string): SpriteRole[] {
  return SPRITE_ROLES.filter((r) => roleSpriteIds(project, r).includes(spriteId));
}

/** A name like "Sprite 4" that isn't already used. */
export function nextSpriteName(sprites: ReadonlyArray<Pick<Sprite, 'name'>>, base = 'Sprite'): string {
  const names = new Set(sprites.map((s) => s.name));
  for (let n = sprites.length + 1; ; n++) if (!names.has(`${base} ${n}`)) return `${base} ${n}`;
}

function cleanName(name: string): string {
  return name.trim().slice(0, LIMITS.nameMaxLength);
}

export function addSprite(project: Project, name: string, size: SpriteSize = 16): EditResult & { spriteId?: string } {
  if (project.sprites.length >= LIMITS.spritesMax) return { ok: false, error: `A game can have up to ${LIMITS.spritesMax} sprites.` };
  const sprite = createSprite(cleanName(name) || nextSpriteName(project.sprites), size);
  return { ok: true, project: { ...project, sprites: [...project.sprites, sprite] }, spriteId: sprite.id };
}

export function duplicateSprite(project: Project, spriteId: string): EditResult & { spriteId?: string } {
  const index = project.sprites.findIndex((s) => s.id === spriteId);
  if (index < 0) return { ok: false, error: 'That sprite no longer exists.' };
  if (project.sprites.length >= LIMITS.spritesMax) return { ok: false, error: `A game can have up to ${LIMITS.spritesMax} sprites.` };
  const source = project.sprites[index];
  const copy: Sprite = {
    ...source,
    id: createId(),
    name: cleanName(`${source.name} copy`),
    pixels: [...source.pixels],
  };
  const sprites = [...project.sprites];
  sprites.splice(index + 1, 0, copy);
  return { ok: true, project: { ...project, sprites }, spriteId: copy.id };
}

export function renameSprite(project: Project, spriteId: string, name: string): EditResult {
  const clean = cleanName(name);
  if (!clean) return { ok: false, error: 'Sprites need a name.' };
  if (!project.sprites.some((s) => s.id === spriteId)) return { ok: false, error: 'That sprite no longer exists.' };
  return { ok: true, project: { ...project, sprites: project.sprites.map((s) => (s.id === spriteId ? { ...s, name: clean } : s)) } };
}

export function deleteSprite(project: Project, spriteId: string): EditResult {
  const roles = rolesOf(project, spriteId);
  if (roles.length) {
    return { ok: false, error: `This sprite is the game’s ${roles.map((r) => ROLE_LABELS[r]).join(' and ')}. Pick a different sprite for that first.` };
  }
  if (!project.sprites.some((s) => s.id === spriteId)) return { ok: false, error: 'That sprite no longer exists.' };
  const gone = new Set(project.levels.flatMap((l) => l.objects.filter((o) => o.spriteId === spriteId).map((o) => o.id)));
  return {
    ok: true,
    project: {
      ...project,
      sprites: project.sprites.filter((s) => s.id !== spriteId),
      // Everything placed with this sprite, in every level, goes with it.
      levels: project.levels.map((level) => ({
        ...level,
        objects: level.objects.filter((o) => o.spriteId !== spriteId),
        passThroughSpriteIds: level.passThroughSpriteIds.filter((id) => id !== spriteId),
        enemies: level.enemies.filter((e) => e.spriteId !== spriteId),
      })),
      // Rules about this sprite no longer make sense.
      rules: project.rules.filter((r) => !ruleUsesSprite(r, spriteId, gone)),
    },
  };
}

/** Does the rule mention the sprite, or one of the objects placed with it? */
function ruleUsesSprite(r: Rule, spriteId: string, objectIds: Set<string>): boolean {
  const w = r.when;
  const t = r.then;
  const mentions = (x: { spriteId?: string; objectId?: string }) => x.spriteId === spriteId || (x.objectId !== undefined && objectIds.has(x.objectId));
  return ((w.on === 'touch' || w.on === 'hit' || w.on === 'talk' || w.on === 'beat' || w.on === 'collect') && mentions(w)) || ((t.do === 'hide' || t.do === 'show') && mentions(t));
}

export function assignRole(project: Project, role: SpriteRole, spriteId: string): EditResult {
  if (!project.sprites.some((s) => s.id === spriteId)) return { ok: false, error: 'That sprite no longer exists.' };
  if (role === 'player') return { ok: true, project: { ...project, player: { ...project.player, spriteId } } };
  if (role === 'attack') return { ok: true, project: { ...project, player: { ...project.player, attack: { kind: project.player.attack?.kind ?? 'swing', spriteId } } } };
  // From the game screen a role is for the whole game: every level.
  return { ok: true, project: { ...project, levels: project.levels.map((l) => ({ ...l, [LEVEL_ROLE_KEYS[role]]: spriteId })) } };
}

/** How many times a sprite is placed, in all the levels. */
export function placedCount(project: Project, spriteId: string): number {
  return project.levels.reduce((n, l) => n + l.objects.filter((o) => o.spriteId === spriteId).length, 0);
}

/**
 * Puts a made hero into the game. `replace` redraws the current hero (its
 * rules and placements stay); `new` adds it as a new sprite and makes it the
 * Player, keeping the old hero as an ordinary sprite.
 */
export function applyHero(project: Project, look: HeroLook, mode: 'replace' | 'new', name = 'My Hero'): EditResult & { spriteId?: string } {
  // The hero comes walking from the front, the back and the side.
  const { image, palette } = viewsToImage(buildHeroViews(look), 16, project.palette);
  const player = { ...project.player, look };
  if (mode === 'replace') {
    const id = project.player.spriteId;
    if (!project.sprites.some((s) => s.id === id)) return { ok: false, error: 'The hero sprite is missing.' };
    return {
      ok: true,
      spriteId: id,
      project: { ...project, palette, player, sprites: project.sprites.map((s) => (s.id === id ? { id: s.id, name: s.name, ...image } : s)) },
    };
  }
  if (project.sprites.length >= LIMITS.spritesMax) return { ok: false, error: `A game can have up to ${LIMITS.spritesMax} sprites.` };
  const taken = new Set(project.sprites.map((s) => s.name));
  let unique = cleanName(name) || 'My Hero';
  for (let n = 2; taken.has(unique); n++) unique = `${cleanName(name) || 'My Hero'} ${n}`;
  const sprite = { ...createSprite(unique, 16, image.pixels), ...image };
  return { ok: true, spriteId: sprite.id, project: { ...project, palette, player: { ...player, spriteId: sprite.id }, sprites: [...project.sprites, sprite] } };
}

/**
 * Gives the attack a starter picture (sword, punch, magic, fireball) and the
 * way that starter works: the attack sprite is redrawn (its id stays), or made
 * if the game has none yet.
 */
export function setAttackStarter(project: Project, starter: AttackStarter): EditResult {
  const { image, palette } = viewsToImage({ front: attackColours(starter) }, 16, project.palette);
  const attack = project.player.attack;
  const current = attack && project.sprites.find((s) => s.id === attack.spriteId);
  const taken = new Set(project.sprites.filter((s) => s !== current).map((s) => s.name));
  let name = ATTACK_LABELS[starter];
  for (let n = 2; taken.has(name); n++) name = `${ATTACK_LABELS[starter]} ${n}`;
  const kind = starterKind(starter);
  if (current) {
    const sprites = project.sprites.map((s) => (s === current ? { id: s.id, name, ...image } : s));
    return { ok: true, project: { ...project, palette, sprites, player: { ...project.player, attack: { spriteId: current.id, kind } } } };
  }
  if (project.sprites.length >= LIMITS.spritesMax) return { ok: false, error: `A game can have up to ${LIMITS.spritesMax} sprites.` };
  const sprite: Sprite = { ...createSprite(name, 16), ...image };
  return { ok: true, project: { ...project, palette, sprites: [...project.sprites, sprite], player: { ...project.player, attack: { spriteId: sprite.id, kind } } } };
}

export function setAttackKind(project: Project, kind: AttackKind): Project {
  const attack = project.player.attack;
  return attack ? { ...project, player: { ...project.player, attack: { ...attack, kind } } } : project;
}
