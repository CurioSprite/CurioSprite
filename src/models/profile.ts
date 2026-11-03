/**
 * Player profiles: who is playing on this device, and their hero. No
 * passwords or accounts; just a name and a hero that every new game starts
 * with. Pure functions, independent of storage and React.
 */
import { buildHeroViews, readLook, viewsToImage, type HeroLook } from './heroMaker';
import { createId } from './ids';
import { HEX_COLOR } from './palette';
import { LIMITS, SPRITE_SIZES, type AnimatedImage, type Project, type Sprite, type SpriteSize } from './project';

/** A hero picture as colours (null = see-through), so it fits into any game's palette. */
export interface HeroPicture {
  size: SpriteSize;
  colours: Array<string | null>;
  /** More animation frames (walking), same size as `colours`. */
  frames?: Array<Array<string | null>>;
  /** The hero from behind and from the side, each a list of frames. */
  back?: Array<Array<string | null>>;
  side?: Array<Array<string | null>>;
}

/** A made hero's picture: walking from the front, the back and the side. */
function walkPicture(look: HeroLook): HeroPicture {
  const { front: [colours, ...frames], back, side } = buildHeroViews(look);
  return { size: 16, colours, frames, back, side };
}

export interface Profile {
  id: string;
  name: string;
  /** The hero maker choices, if the hero was made (or last remade) with it. */
  look?: HeroLook;
  hero: HeroPicture;
  createdAt: string;
  updatedAt: string;
}

export function createProfile(name: string, look: HeroLook, now: Date = new Date()): Profile {
  const ts = now.toISOString();
  return { id: createId(), name: cleanName(name), look, hero: walkPicture(look), createdAt: ts, updatedAt: ts };
}

const cleanName = (name: string) => name.trim().slice(0, LIMITS.nameMaxLength) || 'Player';

export function renameProfile(p: Profile, name: string, now: Date = new Date()): Profile {
  return { ...p, name: cleanName(name), updatedAt: now.toISOString() };
}

/** A new hero from the hero maker. */
export function setProfileLook(p: Profile, look: HeroLook, now: Date = new Date()): Profile {
  return { ...p, look, hero: walkPicture(look), updatedAt: now.toISOString() };
}

/** Keeps a hero exactly as drawn in a game (including details drawn on top of a made hero). */
export function setProfileHeroFromSprite(p: Profile, sprite: AnimatedImage, palette: readonly string[], look?: HeroLook, now: Date = new Date()): Profile {
  const toColours = (pixels: number[]) => pixels.map((v) => (v === 0 ? null : (palette[v - 1] ?? null)));
  const hero: HeroPicture = { size: sprite.width, colours: toColours(sprite.pixels) };
  if (sprite.frames?.length) hero.frames = sprite.frames.map(toColours);
  if (sprite.back?.length) hero.back = sprite.back.map(toColours);
  if (sprite.side?.length) hero.side = sprite.side.map(toColours);
  return { ...p, look, hero, updatedAt: now.toISOString() };
}

/** The profile's hero as a sprite picture in a game's palette (which may gain colours). */
export function heroImage(p: Profile, palette: readonly string[]): { image: AnimatedImage; palette: string[] } {
  const { colours, frames, back, side, size } = p.hero;
  return viewsToImage({ front: [colours, ...(frames ?? [])], back, side }, size, palette);
}

/**
 * Puts the profile's hero into a game: the Player sprite gets its picture and
 * the profile's name (its id, rules and placements stay).
 */
export function applyProfileHero(project: Project, p: Profile): Project {
  const { image, palette } = heroImage(p, project.palette);
  const sprites: Sprite[] = project.sprites.map((s) => {
    if (s.id !== project.player.spriteId) return s;
    return { id: s.id, ...image, name: p.name };
  });
  return { ...project, palette, sprites, player: { ...project.player, ...(p.look ? { look: p.look } : {}) } };
}

/** Reads a stored profile; anything damaged is ignored rather than crashing the app. */
export function readProfile(raw: unknown): Profile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const hero = r.hero as Record<string, unknown> | undefined;
  if (typeof r.id !== 'string' || !r.id || typeof r.name !== 'string' || !r.name.trim()) return null;
  if (!hero || !SPRITE_SIZES.includes(hero.size as SpriteSize) || !Array.isArray(hero.colours)) return null;
  const size = hero.size as SpriteSize;
  const colours = hero.colours as unknown[];
  const goodPicture = (c: unknown): c is Array<string | null> =>
    Array.isArray(c) && c.length === size * size && c.every((v) => v === null || (typeof v === 'string' && HEX_COLOR.test(v)));
  if (!goodPicture(colours)) return null;
  // Frames came later; damaged ones are dropped (the hero just stops walking).
  const list = (v: unknown, max: number) => (Array.isArray(v) && v.length > 0 && v.length <= max && v.every(goodPicture) ? (v as Array<Array<string | null>>) : undefined);
  const frames = list(hero.frames, LIMITS.framesMax - 1);
  const back = list(hero.back, LIMITS.framesMax);
  const side = list(hero.side, LIMITS.framesMax);
  const date = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : new Date(0).toISOString());
  const look = readLook(r.look);
  return {
    id: r.id,
    name: r.name.trim().slice(0, LIMITS.nameMaxLength),
    ...(look ? { look } : {}),
    hero: { size, colours: colours as Array<string | null>, ...(frames ? { frames } : {}), ...(back ? { back } : {}), ...(side ? { side } : {}) },
    createdAt: date(r.createdAt),
    updatedAt: date(r.updatedAt),
  };
}
