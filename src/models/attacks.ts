/**
 * Starter attack pictures. Each points right (the game turns it to face the
 * way the hero attacks) and has a couple of frames, so it moves.
 */
import { fromArt } from './art';
import { createId } from './ids';
import { DEFAULT_PALETTE } from './palette';
import type { AttackKind, Sprite } from './project';

export const ATTACK_STARTERS = ['sword', 'punch', 'magic', 'fireball', 'laser'] as const;
export type AttackStarter = (typeof ATTACK_STARTERS)[number];

const STARTERS: Record<AttackStarter, { label: string; kind: AttackKind; frames: string[][] }> = {
  sword: {
    label: 'Sword',
    kind: 'swing',
    frames: [
      [
        '................',
        '.......kkk......',
        '.........wkk....',
        '..........wwk...',
        '...........wwk..',
        '...........gwwk.',
        '............gwk.',
        '............gwk.',
        '............gwk.',
        '............gwk.',
        '...........gwwk.',
        '...........wwk..',
        '..........wwk...',
        '.........wkk....',
        '.......kkk......',
        '................',
      ],
      [
        '................',
        '................',
        '........kkk.....',
        '..........bkk...',
        '...........bbk..',
        '...........gbbk.',
        '............gbk.',
        '............gbk.',
        '............gbk.',
        '............gbk.',
        '...........gbbk.',
        '...........bbk..',
        '..........bkk...',
        '........kkk.....',
        '................',
        '................',
      ],
    ],
  },
  punch: {
    label: 'Punch',
    kind: 'swing',
    // A boxing glove: pulled back, then punching out with speed lines.
    frames: [
      [
        '................',
        '................',
        '.........kkkk...',
        '.......kkrrrrk..',
        '......krrrrrwrk.',
        '.....krrrrrrrwk.',
        'kkkkkrrkkkkrrrk.',
        'kwwwkrrrrrkrrrk.',
        'kgggkrrrrrrkrrk.',
        'kwwwkrrrrrrrrrk.',
        'kgggkrrrrrrrrrk.',
        'kkkkkrrrrrrrrk..',
        '.....krrrrrrk...',
        '......kkkkkk....',
        '................',
        '................',
      ],
      [
        '................',
        '................',
        '..........kkkk..',
        '........kkrrrrk.',
        'www....krrrrrwrk',
        '......krrrrrrrwk',
        '.kkkkkrrkkkkrrrk',
        '.kwwwkrrrrrkrrrk',
        '.kgggkrrrrrrkrrk',
        '.kwwwkrrrrrrrrrk',
        '.kgggkrrrrrrrrrk',
        '.kkkkkrrrrrrrrk.',
        '......krrrrrrk..',
        'wwww...kkkkkk...',
        '................',
        '................',
      ],
    ],
  },
  magic: {
    label: 'Magic',
    kind: 'throw',
    frames: [
      [
        '................',
        '................',
        '................',
        '.......k........',
        '......kPk.......',
        '......kPk.......',
        '...kkkPwPkkk....',
        '..kPPPwwwPPPk...',
        '...kkkPwPkkk....',
        '......kPk.......',
        '......kPk.......',
        '.......k........',
        '................',
        '................',
        '................',
        '................',
      ],
      [
        '................',
        '................',
        '.......k........',
        '..k...kuk...k...',
        '.kuk..kuk..kuk..',
        '..k.kkuwukk.k...',
        '...kuuwwwuuk....',
        '..kuuwwwwwuuk...',
        '...kuuwwwuuk....',
        '..k.kkuwukk.k...',
        '.kuk..kuk..kuk..',
        '..k...kuk...k...',
        '.......k........',
        '................',
        '................',
        '................',
      ],
    ],
  },
  fireball: {
    label: 'Fireball',
    kind: 'throw',
    frames: [
      [
        '................',
        '................',
        '................',
        '................',
        '.........kkkk...',
        '..r....kkoooyk..',
        '...rr.koooyyyyk.',
        '.oorrrooyywwyyk.',
        '..rooooyywwwyyk.',
        '...rr.kooyyyyyk.',
        '..r....kkooyyk..',
        '.........kkkk...',
        '................',
        '................',
        '................',
        '................',
      ],
      [
        '................',
        '................',
        '................',
        '................',
        '.........kkkk...',
        '.r.....kkoooyk..',
        '..rrr.koooyyyyk.',
        'oorrrooyyywwyyk.',
        '.rrooooyywwwyyk.',
        '..rrr.kooyyyyyk.',
        '.r.....kkooyyk..',
        '.........kkkk...',
        '................',
        '................',
        '................',
        '................',
      ],
    ],
  },
  laser: {
    label: 'Laser',
    kind: 'throw',
    // A bright bolt, for shooters.
    frames: [
      [
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '....bb..bbbbb...',
        '..ttbbbbwwwwww..',
        '..ttbbbbwwwwww..',
        '....bb..bbbbb...',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
      [
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '.tt.bbbbwwwwwww.',
        '.tt.bbbbwwwwwww.',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
      ],
    ],
  },
};

export const ATTACK_LABELS: Record<AttackStarter, string> = Object.fromEntries(ATTACK_STARTERS.map((a) => [a, STARTERS[a].label])) as Record<AttackStarter, string>;
/** Sword and punch swing; magic, fireballs and lasers fly. */
export const starterKind = (a: AttackStarter): AttackKind => STARTERS[a].kind;

/** A starter's frames as colours (null = see-through), so they fit any game's palette. */
export function attackColours(a: AttackStarter): Array<Array<string | null>> {
  return STARTERS[a].frames.map((rows) => fromArt(rows).map((v) => (v === 0 ? null : DEFAULT_PALETTE[v - 1])));
}

/** A starter attack as a new sprite in the default palette (for new games). */
export function createAttackSprite(a: AttackStarter): Sprite {
  const [pixels, ...frames] = STARTERS[a].frames.map(fromArt);
  return { id: createId(), name: STARTERS[a].label, width: 16, height: 16, pixels, frames };
}
