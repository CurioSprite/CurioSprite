import { Download, Map as MapIcon, MoreHorizontal, Pencil, Play, Plus, Repeat, Swords, UserRound, Zap } from 'lucide-react';
import { useState } from 'react';
import { HeroMaker } from '../components/HeroMaker';
import { ProfilePortrait } from '../components/ProfilePicker';
import { ATTACK_LABELS, ATTACK_STARTERS, type AttackStarter } from '../models/attacks';
import type { HeroLook } from '../models/heroMaker';
import { applyProfileHero, type Profile } from '../models/profile';
import { RulesEditor } from '../components/RulesEditor';
import { chooseSpriteSize } from '../components/chooseSpriteSize';
import { useDialogs } from '../components/Dialogs';
import { gameKindChoices, heroOf } from '../components/GameKindDemo';
import { LevelPreview } from '../components/LevelPreview';
import { SaveButton } from '../components/SaveButton';
import { SpriteThumb } from '../components/SpriteThumb';
import { TopBar } from '../components/TopBar';
import { BACKGROUND_CHOICES } from '../models/palette';
import { LIMITS, SCREEN_TILES, WIN_RULES, type AttackKind, type BattleStyle, type LevelDirection, type LevelProject, type Movement, type GameMode, type HealthStyle, type Project, type Sprite, type SpriteImage, type WinRule } from '../models/project';
import {
  ROLE_LABELS,
  SPRITE_ROLES,
  addSprite,
  applyHero,
  assignRole,
  deleteSprite,
  duplicateSprite,
  nextSpriteName,
  renameSprite,
  rolesOf,
  setAttackKind,
  setAttackStarter,
  type EditResult,
} from '../models/projectEdits';
import { serializeProject } from '../models/serialization';
import { addLevel, duplicateLevel, levelView, moveLevel, removeLevel, renameLevel, setLevel, setLevelPlay, setLevelRules, type LevelKind } from '../models/levels';
import { levelKindLabel } from '../components/LevelSelect';
import { layoutLoses, layoutOf, reshapeLayout } from '../editor/levelOps';
import { WIN_RULE_LABELS, projectWinProblem } from '../models/winRules';

interface Props {
  project: Project;
  dirty: boolean;
  onChange(project: Project): void;
  onSave(): void;
  onBack(): void;
  onEditSprite(spriteId: string): void;
  onEditLevel(index: number): void;
  /** Open "Make your hero" straight away (for a brand-new game). */
  makeHeroNow?: boolean;
  /** The level to show first (the one just edited). */
  initialLevel?: number;
  /** Who is playing, for "use my hero" / "save to my profile". */
  player?: Profile | null;
  onSaveHeroToPlayer?(sprite: SpriteImage, palette: readonly string[], look?: HeroLook): void;
  onPlay(): void;
}

interface Choice<T> {
  label: string;
  value: T;
}

const MODES: Choice<GameMode>[] = [
  { label: 'Side view', value: 'platformer' },
  { label: 'Top-down', value: 'topdown' },
  { label: 'Shooter', value: 'shooter' },
];
const MOVEMENT_CHOICES: Choice<Movement>[] = [
  { label: 'Smooth', value: 'free' },
  { label: 'Square by square', value: 'grid' },
];
const DIRECTIONS: Choice<LevelDirection>[] = [
  { label: 'Across →', value: 'across' },
  { label: 'Up ↑', value: 'up' },
];
const ATTACK_KIND_CHOICES: Choice<AttackKind>[] = [
  { label: 'Swing', value: 'swing' },
  { label: 'Throw', value: 'throw' },
];
const BATTLES: Choice<BattleStyle>[] = [
  { label: 'Action', value: 'action' },
  { label: 'Turn-based', value: 'turns' },
];
const HEALTH: Choice<HealthStyle>[] = [
  { label: 'Hearts', value: 'hearts' },
  { label: 'Health bar', value: 'bar' },
];
const SHIELD: Choice<boolean>[] = [
  { label: 'None', value: false },
  { label: 'Shield', value: true },
];
const HEARTS: Choice<number>[] = [
  { label: '3', value: 3 },
  { label: '5', value: 5 },
  { label: '9', value: 9 },
];
const WIN_CHOICES: Choice<WinRule>[] = WIN_RULES.map((value) => ({ label: WIN_RULE_LABELS[value], value }));
const SPEEDS: Choice<number>[] = [
  { label: 'Slow', value: 60 },
  { label: 'Normal', value: 90 },
  { label: 'Fast', value: 130 },
];
const JUMPS: Choice<number>[] = [
  { label: 'Low', value: 250 },
  { label: 'Normal', value: 320 },
  { label: 'High', value: 400 },
];

function Segmented<T>({ label, choices, value, onChange }: { label: string; choices: Choice<T>[]; value: T; onChange(v: T): void }) {
  return (
    <div className="setting">
      <span className="settingLabel">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {choices.map((c) => (
          <button
            key={c.label}
            type="button"
            role="radio"
            aria-checked={c.value === value}
            className={c.value === value ? 'on' : ''}
            onClick={() => onChange(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** "2 screens long", "3 screens tall" (a climb), or both. */
function levelSize(project: LevelProject): string {
  const screens = (n: number) => `${n} ${n === 1 ? 'screen' : 'screens'}`;
  const long = Math.ceil(project.level.width / SCREEN_TILES.width);
  const tall = Math.ceil(project.level.height / SCREEN_TILES.height);
  if (tall === 1) return `${screens(long)} long`;
  return long === 1 ? `${screens(tall)} tall` : `${screens(long)} long · ${tall} tall`;
}

function download(project: Project): void {
  const blob = new Blob([serializeProject(project)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.meta.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game'}.curio.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ProjectScreen({ project, dirty, onChange, onSave, onBack, onEditSprite, onEditLevel, onPlay, makeHeroNow, initialLevel, player, onSaveHeroToPlayer }: Props) {
  const dialogs = useDialogs();
  // The level whose settings, rules and preview are shown.
  const [selected, setSelected] = useState(initialLevel ?? 0);
  const levelIndex = Math.min(selected, project.levels.length - 1);
  const view = levelView(project, levelIndex);
  const winProblem = projectWinProblem(view);
  const modes = new Set(project.levels.map((l) => l.mode));
  const [showRules, setShowRules] = useState(false);
  const [makingHero, setMakingHero] = useState(Boolean(makeHeroNow));
  const hero = project.sprites.find((s) => s.id === project.player.spriteId);
  const attack = project.player.attack && project.sprites.find((s) => s.id === project.player.attack!.spriteId);
  /** Side view: turn the level from a run into a climb or back, keeping its first screen. */
  const changeDirection = async (direction: LevelDirection) => {
    if (direction === view.settings.direction) return;
    const before = layoutOf(view.level);
    const after = reshapeLayout(before, direction);
    if (layoutLoses(before, after)) {
      const ok = await dialogs.confirm({
        title: direction === 'up' ? 'Make the level go up?' : 'Make the level go across?',
        message: 'Only the first screen is kept; the rest of the level is cleared to make room.',
        confirmLabel: direction === 'up' ? 'Go up' : 'Go across',
      });
      if (!ok) return;
    }
    onChange(setLevelPlay(setLevel(project, levelIndex, { ...view.level, ...after }), levelIndex, { direction }));
  };
  const newLevel = async () => {
    const kind = await dialogs.choose<LevelKind>({
      title: 'What kind of level?',
      message: 'It starts as a little level you can change. Your sprites and hero are shared by every level.',
      options: gameKindChoices(() => heroOf(project)),
    });
    if (!kind) return;
    const made = addLevel(project, kind);
    if (!made.ok) {
      dialogs.toast(made.error, 'bad');
      return;
    }
    onChange(made.project);
    setSelected(made.index!);
    dialogs.toast(`${made.project.levels[made.index!].name} added`);
  };
  const levelMenu = async () => {
    const last = project.levels.length - 1;
    const choice = await dialogs.choose({
      title: view.level.name,
      message: `Level ${levelIndex + 1} of ${project.levels.length}.`,
      options: [
        { value: 'rename', label: 'Rename', tone: 'plain' as const },
        { value: 'copy', label: 'Make a copy', tone: 'plain' as const },
        ...(levelIndex > 0 ? [{ value: 'earlier', label: 'Move earlier', tone: 'plain' as const }] : []),
        ...(levelIndex < last ? [{ value: 'later', label: 'Move later', tone: 'plain' as const }] : []),
        ...(last > 0 ? [{ value: 'delete', label: 'Delete level', tone: 'danger' as const }] : []),
      ],
    });
    if (choice === 'rename') {
      const name = await dialogs.prompt({ title: 'Rename level', initialValue: view.level.name, confirmLabel: 'Rename', maxLength: LIMITS.nameMaxLength });
      if (name !== null) apply(renameLevel(project, levelIndex, name));
    } else if (choice === 'copy') {
      const copy = duplicateLevel(project, levelIndex);
      if (apply(copy) && copy.ok) setSelected(copy.index!);
    } else if (choice === 'earlier' || choice === 'later') {
      const to = levelIndex + (choice === 'earlier' ? -1 : 1);
      onChange(moveLevel(project, levelIndex, to));
      setSelected(to);
    } else if (choice === 'delete') {
      const ok = await dialogs.confirm({
        title: `Delete ${view.level.name}?`,
        message: 'Everything placed in it and its own rules go too. Sprites stay.',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (ok && apply(removeLevel(project, levelIndex))) setSelected(Math.max(0, levelIndex - 1));
    }
  };
  const pickAttack = (starter: AttackStarter) => {
    if (apply(setAttackStarter(project, starter))) dialogs.toast(`Your attack is a ${ATTACK_LABELS[starter].toLowerCase()}`);
  };
  const pickHero = async () => {
    const others = project.sprites.filter((s) => s.id !== project.player.spriteId);
    if (others.length === 0) {
      dialogs.toast('Draw another sprite first, or use Make your hero.', 'bad');
      return;
    }
    const id = await dialogs.choose({
      title: 'Which sprite is your hero?',
      options: others.map((s) => ({ value: s.id, label: s.name, tone: 'plain' as const })),
    });
    if (id) apply(assignRole(project, 'player', id));
  };
  /** Applies an edit, or explains why it can't be done. */
  const apply = (result: EditResult): boolean => {
    if (result.ok) onChange(result.project);
    else dialogs.toast(result.error, 'bad');
    return result.ok;
  };

  const newSprite = async () => {
    const name = await dialogs.prompt({
      title: 'Name your new sprite',
      initialValue: nextSpriteName(project.sprites),
      confirmLabel: 'Create',
      maxLength: LIMITS.nameMaxLength,
    });
    if (!name) return;
    const size = await chooseSpriteSize(dialogs);
    if (!size) return;
    const result = addSprite(project, name, size);
    if (apply(result) && result.spriteId) onEditSprite(result.spriteId);
  };

  const spriteMenu = async (sprite: Sprite) => {
    const current = rolesOf(project, sprite.id);
    const choice = await dialogs.choose({
      title: sprite.name,
      message: current.length ? `Used as the ${current.map((r) => ROLE_LABELS[r]).join(' and ')}.` : 'Not used in the game yet.',
      cancelLabel: 'Close',
      options: [
        ...SPRITE_ROLES.filter((r) => !current.includes(r)).map((r) => ({ value: r, label: `Use as ${ROLE_LABELS[r]}`, tone: 'primary' as const })),
        { value: 'rename', label: 'Rename', tone: 'plain' as const },
        { value: 'duplicate', label: 'Duplicate', tone: 'plain' as const },
        { value: 'delete', label: 'Delete', tone: 'danger' as const },
      ],
    });
    if (!choice) return;
    if (choice === 'rename') {
      const name = await dialogs.prompt({ title: 'Rename sprite', initialValue: sprite.name, confirmLabel: 'Rename', maxLength: LIMITS.nameMaxLength });
      if (name) apply(renameSprite(project, sprite.id, name));
    } else if (choice === 'duplicate') {
      apply(duplicateSprite(project, sprite.id));
    } else if (choice === 'delete') {
      const blocked = deleteSprite(project, sprite.id);
      if (!blocked.ok) return apply(blocked);
      const ok = await dialogs.confirm({ title: `Delete “${sprite.name}”?`, message: 'You can get it back by not saving.', confirmLabel: 'Delete', danger: true });
      if (ok) apply(blocked);
    } else {
      apply(assignRole(project, choice, sprite.id));
    }
  };

  const rename = async () => {
    const name = await dialogs.prompt({
      title: 'Rename game',
      initialValue: project.meta.name,
      confirmLabel: 'Rename',
      maxLength: LIMITS.nameMaxLength,
    });
    if (name) onChange({ ...project, meta: { ...project.meta, name } });
  };

  return (
    <main className="screen">
      <TopBar
        tone="create"
        backLabel="Games"
        onBack={onBack}
        title={
          <button type="button" className="titleButton" onClick={() => void rename()} aria-label={`Rename ${project.meta.name}`}>
            <span>{project.meta.name}</span>
            <Pencil size={16} aria-hidden="true" />
          </button>
        }
      >
        <button type="button" className="iconBtn" aria-label="Export game file" title="Export game file" onClick={() => download(project)}>
          <Download size={20} />
        </button>
        <button type="button" className="btn play" onClick={onPlay}>
          <Play size={18} aria-hidden="true" /> Test
        </button>
        <SaveButton dirty={dirty} onSave={onSave} />
      </TopBar>

      <div className="screenBody projectBody">
        <div className="projectColumn">
          <section className="card heroCard">
            <button type="button" className="heroPortrait" aria-label={`Draw ${hero?.name ?? 'your hero'}`} onClick={() => hero && onEditSprite(hero.id)}>
              {hero && <SpriteThumb sprite={hero} palette={project.palette} size={72} />}
            </button>
            <div className="heroInfo">
              <h2>Your hero</h2>
              <strong>{hero?.name ?? 'Hero'}</strong>
              <div className="heroActions">
                <button type="button" className="btn primary small" onClick={() => setMakingHero(true)}>
                  <UserRound size={16} aria-hidden="true" /> Make your hero
                </button>
                <button type="button" className="btn small" onClick={() => hero && onEditSprite(hero.id)}>
                  <Pencil size={16} aria-hidden="true" /> Draw
                </button>
                <button type="button" className="btn small" onClick={() => void pickHero()}>
                  <Repeat size={16} aria-hidden="true" /> Pick another
                </button>
              </div>
              {player && (
                <div className="heroProfile">
                  <ProfilePortrait profile={player} size={28} />
                  <span>{player.name}’s hero</span>
                  <button
                    type="button"
                    className="linkBtn"
                    onClick={() => {
                      onChange(applyProfileHero(project, player));
                      dialogs.toast(`${player.name}’s hero is in this game`);
                    }}
                  >
                    Use it here
                  </button>
                  <button type="button" className="linkBtn" onClick={() => hero && onSaveHeroToPlayer?.(hero, project.palette, project.player.look)}>
                    Save this one to {player.name}
                  </button>
                </div>
              )}
            </div>
          </section>

          <section className="card heroCard attackCard">
            <button type="button" className="heroPortrait" aria-label={attack ? `Draw ${attack.name}` : 'Attack'} disabled={!attack} onClick={() => attack && onEditSprite(attack.id)}>
              {attack ? <SpriteThumb sprite={attack} palette={project.palette} size={72} /> : <Swords size={36} aria-hidden="true" />}
            </button>
            <div className="heroInfo">
              <h2>Attack</h2>
              <div className="chipGroup" role="radiogroup" aria-label="Attack picture">
                {ATTACK_STARTERS.map((a) => (
                  <button key={a} type="button" role="radio" aria-checked={attack?.name === ATTACK_LABELS[a]} className={attack?.name === ATTACK_LABELS[a] ? 'on' : ''} onClick={() => pickAttack(a)}>
                    {ATTACK_LABELS[a]}
                  </button>
                ))}
              </div>
              {attack && (
                <div className="heroActions">
                  <div className="chipGroup" role="radiogroup" aria-label="How it attacks">
                    {ATTACK_KIND_CHOICES.map((c) => (
                      <button key={c.value} type="button" role="radio" aria-checked={project.player.attack!.kind === c.value} className={project.player.attack!.kind === c.value ? 'on' : ''} onClick={() => onChange(setAttackKind(project, c.value))}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="btn small" onClick={() => onEditSprite(attack.id)}>
                    <Pencil size={16} aria-hidden="true" /> Draw
                  </button>
                </div>
              )}
              <small className="attackHelp">
                {project.settings.battle === 'turns'
                  ? 'Shown in Action battles. This game uses turn-based battles.'
                  : project.player.attack?.kind === 'throw'
                    ? 'Thrown: it flies until it hits something. Draw it pointing right.'
                    : 'Swung: it hits right in front of the hero. Draw it pointing right.'}
              </small>
            </div>
          </section>

          <section className="card levelsCard">
            <div className="cardHead">
              <h2>{project.levels.length > 1 ? 'Levels' : 'Level'}</h2>
              <span className="muted small">{levelSize(view)}</span>
            </div>
            <div className="levelTabs" role="tablist" aria-label="Levels">
              {project.levels.map((l, i) => (
                <button key={l.id} type="button" role="tab" aria-selected={i === levelIndex} className={i === levelIndex ? 'on' : ''} onClick={() => setSelected(i)}>
                  <span className="levelNumber">{i + 1}</span>
                  <span className="levelTabName">{l.name}</span>
                  <small>{levelKindLabel(l)}</small>
                </button>
              ))}
              <button type="button" className="addLevel" onClick={() => void newLevel()} disabled={project.levels.length >= LIMITS.levelsMax}>
                <Plus size={18} aria-hidden="true" /> Add level
              </button>
            </div>
            <button type="button" className="levelCardButton" onClick={() => onEditLevel(levelIndex)} aria-label={`Edit ${view.level.name}`}>
              <LevelPreview project={view} maxHeight={150} />
            </button>
            <div className="levelActions">
              <button type="button" className="btn primary" onClick={() => onEditLevel(levelIndex)}>
                <MapIcon size={18} aria-hidden="true" /> Edit {project.levels.length > 1 ? view.level.name : 'level'}
              </button>
              <button type="button" className="btn rulesBtn" onClick={() => setShowRules(true)}>
                <Zap size={18} aria-hidden="true" /> Rules{view.rules.length > 0 && <span className="countBadge">{view.rules.length}</span>}
              </button>
              <button type="button" className="iconBtn" aria-label={`More for ${view.level.name}`} onClick={() => void levelMenu()}>
                <MoreHorizontal size={20} />
              </button>
            </div>
          </section>

          <section className="card">
            <h2>Sprites</h2>
            <p className="muted">Tap a sprite to draw it. Use ⋯ to choose what it is in the game.</p>
            <div className="spriteCards">
              {project.sprites.map((sp) => {
                const roles = rolesOf(project, sp.id);
                return (
                  <div key={sp.id} className="spriteCardWrap">
                    <button type="button" className="spriteCard" onClick={() => onEditSprite(sp.id)}>
                      <SpriteThumb sprite={sp} palette={project.palette} size={56} />
                      <strong>{sp.name}</strong>
                      <small>{roles.length ? roles.map((r) => ROLE_LABELS[r]).join(' · ') : `${sp.width}×${sp.height}`}</small>
                    </button>
                    <button type="button" className="spriteMenuBtn" aria-label={`More for ${sp.name}`} onClick={() => void spriteMenu(sp)}>
                      <MoreHorizontal size={18} />
                    </button>
                  </div>
                );
              })}
              <button type="button" className="spriteCard addSprite" onClick={() => void newSprite()}>
                <Plus size={32} aria-hidden="true" />
                <strong>New sprite</strong>
              </button>
            </div>
          </section>
        </div>

        <section className="card settingsCard">
          <h2>{project.levels.length > 1 ? `${levelIndex + 1}. ${view.level.name}` : 'How it plays'}</h2>
          <Segmented
            label="View"
            choices={MODES}
            value={view.settings.mode}
            onChange={(mode) => {
              // A tall, one-screen-wide level is a climb in side view.
              const { width, height } = view.level;
              const direction = mode === 'platformer' && height > SCREEN_TILES.height && width <= SCREEN_TILES.width ? 'up' : view.settings.direction;
              onChange(setLevelPlay(project, levelIndex, { mode, direction }));
            }}
          />
          {view.settings.mode === 'topdown' && (
            <>
              <Segmented label="Moves" choices={MOVEMENT_CHOICES} value={view.settings.movement} onChange={(movement) => onChange(setLevelPlay(project, levelIndex, { movement }))} />
              <p className="settingNote">
                {view.settings.movement === 'grid'
                  ? 'One square at a time, like classic adventure games. Hold B to run.'
                  : 'Glide any way, like an action game.'}
              </p>
            </>
          )}
          {view.settings.mode === 'shooter' && (
            <p className="settingNote">The hero is a ship: point the arrows or joystick the way to fly, and it swings round and thrusts that way. B brakes, and it drifts when you let go. Bumping into anything solid too fast hurts. Enemies on screen fire back. Always played in real time.</p>
          )}
          {view.settings.mode === 'platformer' && (
            <>
              <Segmented label="Level goes" choices={DIRECTIONS} value={view.settings.direction} onChange={(d) => void changeDirection(d)} />
              <p className="settingNote">{view.settings.direction === 'up' ? 'A climb: screens stack on top of each other.' : 'A run: screens join on to the side.'}</p>
            </>
          )}
          <Segmented
            label="How to win"
            choices={WIN_CHOICES}
            value={view.settings.winRule}
            onChange={(winRule) => onChange(setLevelPlay(project, levelIndex, { winRule }))}
          />
          {winProblem && (
            <p className="settingWarn">
              {winProblem}{' '}
              <button type="button" className="linkBtn" onClick={() => onEditLevel(levelIndex)}>
                Edit level
              </button>
            </p>
          )}
          <div className="setting">
            <span className="settingLabel">Sky</span>
            <div className="colorChoices" role="radiogroup" aria-label="Sky colour">
              {BACKGROUND_CHOICES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={view.level.background === c}
                  aria-label={`Sky colour ${c}`}
                  className={view.level.background === c ? 'on' : ''}
                  style={{ background: c }}
                  onClick={() => onChange(setLevel(project, levelIndex, { ...view.level, background: c }))}
                />
              ))}
            </div>
          </div>

          <h2 className="settingsSub">{project.levels.length > 1 ? 'Every level' : 'Hero and battles'}</h2>
          <Segmented
            label="Battles"
            choices={BATTLES}
            value={project.settings.battle}
            onChange={(battle) => onChange({ ...project, settings: { ...project.settings, battle } })}
          />
          <p className="settingNote">
            {project.settings.battle === 'action'
              ? view.settings.mode === 'platformer'
                ? 'Press B (X) to attack enemies. A jumps.'
                : view.settings.mode === 'shooter'
                ? 'Press A (Z / Space) to fire.'
                : 'Press A (Z / Space) to attack enemies. B dashes.'
              : 'Bumping into an enemy starts a battle: pick Attack, Defend or Run.'}{' '}
            Make a sprite an enemy in the level editor.
          </p>
          <Segmented
            label="Health"
            choices={HEALTH}
            value={project.player.health ?? 'hearts'}
            onChange={(health) => onChange({ ...project, player: { ...project.player, health } })}
          />
          <Segmented
            label={project.player.health === 'bar' ? 'Bar size' : 'Hearts'}
            choices={HEARTS}
            value={project.player.hearts}
            onChange={(hearts) => onChange({ ...project, player: { ...project.player, hearts } })}
          />
          <Segmented
            label="Shield"
            choices={SHIELD}
            value={project.player.shield ?? false}
            onChange={(shield) => onChange({ ...project, player: { ...project.player, shield } })}
          />
          <p className="settingNote">
            {project.player.health === 'bar'
              ? `A bar worth ${project.player.hearts} hearts: touching an enemy takes a big bite, small hits like shots and bumps take less.`
              : 'Each hit takes one heart.'}{' '}
            {project.player.shield ? 'The shield takes hits first, and fills back up after a few seconds without being hit.' : ''}
          </p>
          <Segmented
            label="Speed"
            choices={SPEEDS}
            value={project.player.speed}
            onChange={(speed) => onChange({ ...project, player: { ...project.player, speed } })}
          />
          {modes.has('platformer') && (
            <Segmented
              label="Jump"
              choices={JUMPS}
              value={project.player.jumpStrength}
              onChange={(jumpStrength) => onChange({ ...project, player: { ...project.player, jumpStrength } })}
            />
          )}
        </section>
      </div>
      {showRules && <RulesEditor project={view} onChange={(rules) => onChange(setLevelRules(project, levelIndex, rules))} onClose={() => setShowRules(false)} />}
      {makingHero && (
        <HeroMaker
          initialLook={project.player.look}
          palette={project.palette}
          heroName={hero?.name ?? 'Hero'}
          // The hero walks the ways the game's levels need: side to side, every way, or both.
          mode={modes.size === 1 ? [...modes][0] : undefined}
          canKeepOld
          useMessage="Your hero gets this new look. Its rules stay the same."
          onClose={() => setMakingHero(false)}
          onUse={(look, mode, name) => {
            const made = applyHero(project, look, mode, name);
            if (!made.ok) {
              dialogs.toast(made.error, 'bad');
              return;
            }
            const named = renameSprite(made.project, made.spriteId!, name);
            onChange(named.ok ? named.project : made.project);
            setMakingHero(false);
            dialogs.toast(`Say hi to ${name}!`);
          }}
        />
      )}
    </main>
  );
}
