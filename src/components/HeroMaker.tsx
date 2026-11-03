import { Dices, Glasses, UserPlus, UserRound, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_LOOK,
  GEAR_COLOURS,
  HAIR_STYLES,
  HAIR_STYLE_LABELS,
  HEAD_SHAPES,
  HEAD_SHAPE_LABELS,
  HERO_COLOURS,
  buildHeroViews,
  framesToPalette,
  randomLook,
  type ColourPart,
  type HeroLook,
} from '../models/heroMaker';
import type { Facing, GameMode } from '../models/project';
import { useDialogs } from './Dialogs';
import { SpriteThumb } from './SpriteThumb';

interface Props {
  /** Choices to start from (the last ones used, if any). */
  initialLook?: HeroLook;
  /** Colours the preview is drawn with (new colours are added as needed). */
  palette: readonly string[];
  /** Suggested hero name. */
  heroName: string;
  /** The game's view: side-view heroes are seen walking left and right; top-down ones every way. Unset (a player's hero) shows every way. */
  mode?: GameMode;
  /** In a game: also offer to keep the old hero as an ordinary sprite. */
  canKeepOld?: boolean;
  /** Shown under the name question. */
  useMessage?: string;
  /** `replace` redraws the current hero; `new` keeps it and adds this one as the hero. */
  onUse(look: HeroLook, mode: 'replace' | 'new', name: string): void;
  onClose(): void;
}

/** The ways the preview can show the hero walking. */
type Direction = 'down' | 'up' | 'left' | 'right';
const DIRECTIONS: Record<Direction, { label: string; facing: Facing; mirror: boolean }> = {
  down: { label: 'Front', facing: 'front', mirror: false },
  up: { label: 'Back', facing: 'back', mirror: false },
  left: { label: 'Left', facing: 'side', mirror: true },
  right: { label: 'Right', facing: 'side', mirror: false },
};

const PART_LABELS: Record<ColourPart, string> = {
  skin: 'Skin',
  hair: 'Hair',
  eyes: 'Eyes',
  helmet: 'Helmet',
  shirt: 'Top',
  vest: 'Vest',
  legs: 'Legs',
};

/** "Make your hero": pick a head, hair and clothes, colour them from one set of colours, and watch the hero walk. */
export function HeroMaker({ initialLook, palette, heroName, mode, canKeepOld = false, useMessage, onUse, onClose }: Props) {
  const dialogs = useDialogs();
  const [look, setLook] = useState<HeroLook>(initialLook ?? DEFAULT_LOOK);
  const set = (change: Partial<HeroLook>) => setLook((l) => ({ ...l, ...change }));
  // Which part the colours on the side paint.
  const [part, setPart] = useState<ColourPart>('skin');

  // The hero walks the ways it will walk in the game.
  const directions: Direction[] = mode === 'platformer' ? ['left', 'right'] : ['down', 'up', 'left', 'right'];
  const [direction, setDirection] = useState<Direction>(mode === 'platformer' ? 'right' : 'down');
  const preview = useMemo(() => {
    const views = buildHeroViews(look);
    const { frames, palette: next } = framesToPalette([...views.front, ...views.back, ...views.side], palette);
    const n = views.front.length;
    return { palette: next, front: frames.slice(0, n), back: frames.slice(n, 2 * n), side: frames.slice(2 * n) };
  }, [look, palette]);
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setStep((n) => n + 1), 1000 / 6);
    return () => window.clearInterval(id);
  }, []);
  const walking = (d: Direction) => {
    const frames = preview[DIRECTIONS[d].facing];
    return { width: 16 as const, height: 16 as const, pixels: frames[step % frames.length] };
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.dialogBackdrop')) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const use = async (mode: 'replace' | 'new') => {
    const name = await dialogs.prompt({
      title: 'What is your hero called?',
      message: mode === 'replace' ? useMessage : `Your old hero (${heroName}) stays as one of your sprites.`,
      initialValue: mode === 'replace' ? heroName : 'Me',
      confirmLabel: 'Use it!',
      maxLength: 40,
    });
    if (name === null) return;
    onUse(look, mode, name.trim() || 'Hero');
  };

  /** Picking a colour for a helmet or vest you aren't wearing puts it on. */
  const paint = (colour: string) => set({ [part]: colour });
  const partLabel = (p: ColourPart) => (p === 'hair' && look.hairStyle === 'cap' ? 'Cap' : PART_LABELS[p]);
  const current = look[part];

  /** One row of choices, with the colour of its part to tap. */
  const row = (label: string, colourPart: ColourPart | null, children?: ReactNode) => {
    const colour = colourPart ? look[colourPart] : undefined;
    return (
      <div className={`makerRow ${colourPart && part === colourPart ? 'picking' : ''}`}>
        <span className="makerLabel">{label}</span>
        {colourPart && (
          <button
            type="button"
            className={`partColour ${part === colourPart ? 'on' : ''} ${colour ? '' : 'none'}`}
            style={colour ? { background: colour } : undefined}
            aria-label={`${partLabel(colourPart)} colour`}
            aria-pressed={part === colourPart}
            onClick={() => setPart(colourPart)}
          />
        )}
        {children}
      </div>
    );
  };

  const choice = <T,>(label: string, values: readonly T[], value: T, name: (v: T) => ReactNode, onPick: (v: T) => void) => (
    <div className="chipGroup" role="radiogroup" aria-label={label}>
      {values.map((v) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onPick(v)}>
          {name(v)}
        </button>
      ))}
    </div>
  );

  /** Something you wear or not; putting it on picks its colour next. */
  const wear = (gear: 'helmet' | 'vest', label: string) =>
    choice(label, [false, true], look[gear] !== undefined, (on) => (on ? label : 'None'), (on) => {
      set({ [gear]: on ? (look[gear] ?? GEAR_COLOURS[gear]) : undefined });
      if (on) setPart(gear);
      else if (part === gear) setPart('shirt');
    });

  return (
    <div className="rulesSheet heroMaker" role="dialog" aria-modal="true" aria-labelledby="maker-title">
      <header className="rulesHeader">
        <UserRound size={22} aria-hidden="true" />
        <div>
          <h2 id="maker-title">Make your hero</h2>
          <p>{mode === 'platformer' ? 'Seen from the side, the way it runs in your game.' : 'Seen from every side, the way it walks around your game.'} You can draw extra details afterwards.</p>
        </div>
        <button type="button" className="iconBtn" aria-label="Close" onClick={onClose}>
          <X size={20} />
        </button>
      </header>

      <div className="makerBody">
        <div className="makerPreview">
          <div className="makerStage">
            <SpriteThumb sprite={walking(direction)} palette={preview.palette} size={120} className={DIRECTIONS[direction].mirror ? 'mirrored' : ''} />
          </div>
          <div className="makerTurns" role="radiogroup" aria-label="Walking">
            {directions.map((d) => (
              <button key={d} type="button" role="radio" aria-checked={direction === d} className={direction === d ? 'on' : ''} onClick={() => setDirection(d)}>
                <SpriteThumb sprite={walking(d)} palette={preview.palette} size={30} className={DIRECTIONS[d].mirror ? 'mirrored' : ''} />
                <small>{DIRECTIONS[d].label}</small>
              </button>
            ))}
          </div>
          <button type="button" className="btn" onClick={() => setLook(randomLook())}>
            <Dices size={18} aria-hidden="true" /> Surprise me
          </button>
          <button type="button" className="btn primary big" onClick={() => void use('replace')}>
            <UserRound size={20} aria-hidden="true" /> Use as my hero
          </button>
          {canKeepOld && (
            <button type="button" className="btn small" onClick={() => void use('new')}>
              <UserPlus size={16} aria-hidden="true" /> Keep the old hero too
            </button>
          )}
        </div>

        <div className="makerOptions">
          {row('Head', 'skin', choice('Head shape', HEAD_SHAPES, look.head, (h) => HEAD_SHAPE_LABELS[h], (head) => set({ head })))}
          {row('Hair', 'hair', choice('Hair style', HAIR_STYLES, look.hairStyle, (h) => HAIR_STYLE_LABELS[h], (hairStyle) => set({ hairStyle })))}
          {row('Eyes', 'eyes', choice('Glasses', [false, true], look.glasses, (on) => (on ? <><Glasses size={16} aria-hidden="true" /> Glasses</> : 'No glasses'), (glasses) => set({ glasses })))}
          {row('Helmet', look.helmet !== undefined ? 'helmet' : null, wear('helmet', 'Helmet'))}
          {row('Top', 'shirt')}
          {row('Vest', look.vest !== undefined ? 'vest' : null, wear('vest', 'Vest'))}
          {row('Legs', 'legs')}
        </div>

        <div className="makerColours">
          <span className="makerLabel">{partLabel(part)} colour</span>
          <div className="makerSwatches" role="radiogroup" aria-label="Colours">
            {HERO_COLOURS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={current === c}
                aria-label={`Colour ${c}`}
                className={current === c ? 'on' : ''}
                style={{ background: c }}
                onClick={() => paint(c)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
