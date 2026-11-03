import { ArrowRight, Check, ChevronDown, Globe, Plus, Trash2, Zap } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { createId } from '../models/ids';
import { LIMITS, type LevelObject, type LevelProject, type Rule, type RuleAction, type RuleTrigger } from '../models/project';
import {
  describeAction,
  describeTrigger,
  isEnemyObject,
  isEnemySprite,
  objectName,
  objectRules,
  ruleSprites,
  ruleSubject,
  sameSubject,
  type RuleSubject,
} from '../models/rules';
import { useDialogs, type DialogApi } from './Dialogs';
import { SpriteThumb } from './SpriteThumb';

const spriteName = (project: LevelProject, id: string) => project.sprites.find((s) => s.id === id)?.name ?? 'sprite';
const findObject = (project: LevelProject, id: string) => project.level.objects.find((o) => o.id === id);

/** The sprite an object is drawn with (treasure and goals use the Treasure / Goal sprite). */
export function objectSpriteId(project: LevelProject, o: LevelObject): string {
  if (o.kind === 'treasure') return project.level.collectibleSpriteId;
  if (o.kind === 'goal') return project.level.goalSpriteId;
  return o.spriteId!;
}

/** Objects a rule can be about or point at: placed sprites (not Blocks), treasure and goals. */
const pickableObjects = (project: LevelProject) => project.level.objects;

/** "Which one?": one object from a list, named like "Slime 2". */
async function pickObject(dialogs: DialogApi, project: LevelProject, title: string, objects: LevelObject[]): Promise<string | null> {
  if (objects.length === 0) {
    dialogs.toast('There are none in the level yet. Place one first.', 'bad');
    return null;
  }
  return dialogs.choose({ title, options: objects.map((o) => ({ value: o.id, label: objectName(project, o.id), tone: 'plain' as const })) });
}

/** What a "disappear / appear" action points at: every copy of a sprite, or one object. */
async function pickTarget(dialogs: DialogApi, project: LevelProject, title: string): Promise<{ spriteId?: string; objectId?: string } | null> {
  const sprites = ruleSprites(project);
  const objects = pickableObjects(project);
  if (sprites.length === 0 && objects.length === 0) {
    dialogs.toast('Draw a sprite first (New sprite on the game screen), then place it in the level.', 'bad');
    return null;
  }
  const choice = await dialogs.choose({
    title,
    options: [
      ...sprites.map((s) => ({ value: `s:${s.id}`, label: `Every ${s.name}`, tone: 'plain' as const })),
      ...objects.map((o) => ({ value: `o:${o.id}`, label: `Just ${objectName(project, o.id)}`, tone: 'plain' as const })),
    ],
  });
  if (!choice) return null;
  return choice.startsWith('s:') ? { spriteId: choice.slice(2) } : { objectId: choice.slice(2) };
}

/** The "When…" choices that make sense for what the rule is about. */
async function pickTrigger(dialogs: DialogApi, project: LevelProject, subject: RuleSubject): Promise<RuleTrigger | null> {
  if (subject.kind === 'object') {
    const o = findObject(project, subject.objectId);
    if (!o) return null;
    const name = objectName(project, o.id);
    const options =
      o.kind === 'treasure'
        ? [{ value: 'collect', label: `${name} is collected` }]
        : o.kind === 'goal'
          ? []
          : [
              { value: 'touch', label: `The player touches ${name}` },
              { value: 'talk', label: `The player talks to ${name} (faces it, presses A)` },
              { value: 'hit', label: `The player attacks ${name}` },
              ...(isEnemyObject(project, o) ? [{ value: 'beat', label: `${name} is beaten` }] : []),
            ];
    if (options.length === 0) {
      dialogs.toast('Goals finish the game when touched. Other rules can make them appear or disappear.', 'bad');
      return null;
    }
    const kind = await dialogs.choose({ title: 'When…', options: options.map((x) => ({ ...x, tone: 'plain' as const })) });
    if (kind === 'collect') return { on: 'collect', count: 'each', objectId: o.id };
    if (kind === 'touch') return { on: 'touch', objectId: o.id };
    if (kind === 'talk') return { on: 'talk', objectId: o.id };
    if (kind === 'hit') return { on: 'hit', objectId: o.id };
    if (kind === 'beat') return { on: 'beat', count: 'each', objectId: o.id };
    return null;
  }

  if (subject.kind === 'treasure') {
    const kind = await dialogs.choose({
      title: 'When…',
      options: [
        { value: 'each', label: 'Any treasure is collected (each one)' },
        { value: 'count', label: 'A number of treasures are collected…' },
        { value: 'all', label: 'All the treasure is collected' },
      ].map((o) => ({ ...o, tone: 'plain' as const })),
    });
    if (kind === 'each' || kind === 'all') return { on: 'collect', count: kind };
    if (kind !== 'count') return null;
    const n = await dialogs.choose({
      title: 'How many treasures?',
      options: ['1', '2', '3', '5', '10'].map((v) => ({ value: v, label: v, tone: 'plain' as const })),
    });
    return n ? { on: 'collect', count: Number(n) } : null;
  }

  if (subject.kind === 'sprite') {
    const name = spriteName(project, subject.spriteId);
    const enemy = isEnemySprite(project, subject.spriteId);
    const kind = await dialogs.choose({
      title: 'When…',
      message: enemy ? undefined : `To use “beaten” rules, make ${name} an Enemy in the level editor.`,
      options: [
        { value: 'touch', label: `The player touches any ${name}` },
        { value: 'talk', label: `The player talks to any ${name} (faces it, presses A)` },
        { value: 'hit', label: `The player attacks any ${name}` },
        ...(enemy
          ? [
              { value: 'beatEach', label: `Any ${name} is beaten (each one)` },
              { value: 'beatAll', label: `Every ${name} is beaten` },
            ]
          : []),
      ].map((o) => ({ ...o, tone: 'plain' as const })),
    });
    if (kind === 'touch') return { on: 'touch', spriteId: subject.spriteId };
    if (kind === 'talk') return { on: 'talk', spriteId: subject.spriteId };
    if (kind === 'hit') return { on: 'hit', spriteId: subject.spriteId };
    if (kind === 'beatEach') return { on: 'beat', count: 'each', spriteId: subject.spriteId };
    if (kind === 'beatAll') return { on: 'beat', count: 'all', spriteId: subject.spriteId };
    return null;
  }

  const kind = await dialogs.choose({
    title: 'When…',
    options: [
      { value: 'start', label: 'The game starts' },
      { value: 'goalOpen', label: 'The goal opens' },
      { value: 'hurt', label: 'The player loses a heart' },
      { value: 'beatEach', label: 'Any enemy is beaten (each one)' },
      { value: 'beatAll', label: 'All the enemies are beaten' },
    ].map((o) => ({ ...o, tone: 'plain' as const })),
  });
  switch (kind) {
    case 'start':
    case 'goalOpen':
    case 'hurt':
      return { on: kind };
    case 'beatEach':
      return { on: 'beat', count: 'each' };
    case 'beatAll':
      return { on: 'beat', count: 'all' };
  }
  return null;
}

async function pickAction(dialogs: DialogApi, project: LevelProject, subject: RuleSubject): Promise<RuleAction | null> {
  // In an object's or sprite's own rules, "it disappears" is offered directly.
  const self =
    subject.kind === 'object'
      ? { label: `${objectName(project, subject.objectId)} disappears`, target: { objectId: subject.objectId } }
      : subject.kind === 'sprite'
        ? { label: `Every ${spriteName(project, subject.spriteId)} disappears`, target: { spriteId: subject.spriteId } }
        : null;
  const kind = await dialogs.choose({
    title: '…then',
    options: [
      { value: 'message', label: 'Show a message…' },
      ...(self ? [{ value: 'hideSelf', label: self.label }] : []),
      { value: 'hide', label: 'Make something disappear…' },
      { value: 'show', label: 'Make something appear…' },
      { value: 'openGoal', label: 'Open the goal' },
      { value: 'heal', label: 'Give back a heart' },
      { value: 'win', label: 'Win the game' },
      ...(project.levelCount > 1 ? [{ value: 'goLevel', label: 'Go to another level… (a door, a cave, the next area)' }] : []),
    ].map((o) => ({ ...o, tone: 'plain' as const })),
  });
  switch (kind) {
    case null:
      return null;
    case 'openGoal':
    case 'heal':
    case 'win':
      return { do: kind };
    case 'hideSelf':
      return self ? { do: 'hide', ...self.target } : null;
    case 'message': {
      const text = await dialogs.prompt({ title: 'What should the message say?', confirmLabel: 'OK', maxLength: LIMITS.messageMaxLength });
      return text?.trim() ? { do: 'message', text: text.trim() } : null;
    }
    case 'hide':
    case 'show': {
      const target = await pickTarget(dialogs, project, kind === 'hide' ? 'What disappears?' : 'What appears?');
      return target ? { do: kind, ...target } : null;
    }
    case 'goLevel': {
      const levelId = await dialogs.choose({
        title: 'Go to which level?',
        message: 'The player arrives at that level’s start, and it opens for them.',
        options: project.levelNames.filter((l) => l.id !== project.level.id).map((l) => ({ value: l.id, label: l.name, tone: 'plain' as const })),
      });
      return levelId ? { do: 'goLevel', levelId } : null;
    }
  }
  return null;
}

/** A note about side effects the player will notice when building. */
function ruleNote(rule: Rule, project: LevelProject): string | null {
  const a = rule.then;
  const w = rule.when;
  if ('objectId' in w && w.objectId && !findObject(project, w.objectId)) return 'That object was removed from the level, so this rule never happens.';
  if (a.do === 'openGoal') return 'The goal starts locked until this happens.';
  if (a.do === 'show') {
    const name = a.objectId ? objectName(project, a.objectId) : `Every ${spriteName(project, a.spriteId!)}`;
    return `${name} stays hidden until this happens.`;
  }
  if (w.on === 'goalOpen' && !project.rules.some((r) => r.then.do === 'openGoal') && project.settings.winRule !== 'coinsThenGoal') {
    return 'The goal starts open, so this never happens. Add an “open the goal” rule or use Treasure, then goal.';
  }
  if (w.on === 'hit' && project.settings.battle === 'turns') {
    const enemy = w.spriteId ? isEnemySprite(project, w.spriteId) : (() => {
      const o = w.objectId ? findObject(project, w.objectId) : undefined;
      return o ? isEnemyObject(project, o) : false;
    })();
    if (!enemy) return 'In turn-based games the player only attacks enemies (in battles), so this never happens. Switch Battles to Action to attack things.';
  }
  if (w.on === 'talk' && project.settings.mode !== 'topdown') {
    return `Talking works in top-down levels (${project.settings.mode === 'shooter' ? 'in a shooter, A fires' : 'in side view, A jumps'}), so this never happens here.`;
  }
  if (w.on === 'beat' && w.spriteId && !isEnemySprite(project, w.spriteId)) {
    return `${spriteName(project, w.spriteId)} isn’t an Enemy, so it can’t be beaten. Make it an Enemy in the level editor.`;
  }
  return null;
}

/**
 * Walks through making one rule ("When…", then "…then") about a subject.
 * In a sprite's section it first asks "Every Slime, or just one?".
 * Returns null if the player cancels at any step.
 */
export async function createRule(dialogs: DialogApi, project: LevelProject, subject: RuleSubject): Promise<Rule | null> {
  if (project.rules.length >= LIMITS.rulesMax) {
    dialogs.toast(`A game can have up to ${LIMITS.rulesMax} rules.`, 'bad');
    return null;
  }
  let about = subject;
  if (subject.kind === 'sprite') {
    const copies = project.level.objects.filter((o) => o.spriteId === subject.spriteId);
    if (copies.length > 0) {
      const name = spriteName(project, subject.spriteId);
      const which = await dialogs.choose({
        title: `Every ${name}, or just one?`,
        options: [
          { value: 'every', label: `Every ${name}`, tone: 'plain' as const },
          ...copies.map((o) => ({ value: o.id, label: `Just ${objectName(project, o.id)}`, tone: 'plain' as const })),
        ],
      });
      if (!which) return null;
      if (which !== 'every') about = { kind: 'object', objectId: which };
    }
  }
  const when = await pickTrigger(dialogs, project, about);
  if (!when) return null;
  const then = await pickAction(dialogs, project, about);
  if (!then) return null;
  // New rules belong to this level; they can be switched to every level afterwards.
  return { id: createId(), when, then, levelId: project.level.id };
}

/** Rules about one placed object only make sense in its level. */
const aboutObject = (r: Rule): boolean => ('objectId' in r.when && !!r.when.objectId) || ('objectId' in r.then && !!r.then.objectId);

interface SectionProps {
  project: LevelProject;
  subject: RuleSubject;
  icon: ReactNode;
  title: string;
  hint: string;
  addLabel: string;
  onChange(rules: Rule[]): void;
  /** Extra content under the rules (e.g. one object's own rules inside its sprite's section). */
  children?: ReactNode;
  focused?: boolean;
  dataKey?: string;
  /** Called after a new rule is made here. */
  onAdded?(rule: Rule): void;
}

/** One group of rules (whole game, treasure, a sprite or one object), with its own Add button. */
export function RuleSection({ project, subject, icon, title, hint, addLabel, onChange, children, focused, dataKey, onAdded }: SectionProps) {
  const dialogs = useDialogs();
  const { rules } = project;
  const own = rules.filter((r) => sameSubject(ruleSubject(r), subject));

  const add = async () => {
    const rule = await createRule(dialogs, project, subject);
    if (!rule) return;
    onChange([...rules, rule]);
    onAdded?.(rule);
  };
  const update = (id: string, change: Partial<Pick<Rule, 'when' | 'then' | 'levelId'>>) =>
    onChange(
      rules.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...change };
        // A rule that now points at a placed object belongs to this level.
        return aboutObject(next) && !next.levelId ? { ...next, levelId: project.level.id } : next;
      }),
    );
  const remove = async (rule: Rule) => {
    const ok = await dialogs.confirm({
      title: 'Delete this rule?',
      message: `When ${describeTrigger(rule.when, project)}, then ${describeAction(rule.then, project)}.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) onChange(rules.filter((r) => r.id !== rule.id));
  };
  const thumb = (spriteId: string) => {
    const sprite = project.sprites.find((s) => s.id === spriteId);
    return sprite ? <SpriteThumb sprite={sprite} palette={project.palette} size={22} /> : null;
  };
  const targetThumb = (a: RuleAction) => {
    if (a.do !== 'hide' && a.do !== 'show') return null;
    if (a.spriteId) return thumb(a.spriteId);
    const o = a.objectId ? findObject(project, a.objectId) : undefined;
    return o ? thumb(objectSpriteId(project, o)) : null;
  };

  return (
    <section className={`ruleSection ${subject.kind} ${focused ? 'focused' : ''}`} data-subject={dataKey}>
      <header>
        {icon}
        <div>
          <h3>{title}</h3>
          <p>{hint}</p>
        </div>
        <button type="button" className="btn small" onClick={() => void add()}>
          <Plus size={16} aria-hidden="true" /> {addLabel}
        </button>
      </header>
      {own.length > 0 && (
        <ol className="rulesList">
          {own.map((rule) => {
            const note = ruleNote(rule, project);
            return (
              <li key={rule.id} className="ruleCard">
                <div className="ruleRow">
                  <button
                    type="button"
                    className="rulePart when"
                    onClick={async () => {
                      const when = await pickTrigger(dialogs, project, ruleSubject(rule));
                      if (when) update(rule.id, { when });
                    }}
                  >
                    <small>When</small>
                    <span>{describeTrigger(rule.when, project)}</span>
                  </button>
                  <ArrowRight size={20} aria-hidden="true" className="ruleArrow" />
                  <button
                    type="button"
                    className="rulePart then"
                    onClick={async () => {
                      const then = await pickAction(dialogs, project, ruleSubject(rule));
                      if (then) update(rule.id, { then });
                    }}
                  >
                    <small>Then</small>
                    <span>
                      {targetThumb(rule.then)}
                      {describeAction(rule.then, project)}
                    </span>
                  </button>
                  <button type="button" className="iconBtn small" aria-label="Delete rule" onClick={() => void remove(rule)}>
                    <Trash2 size={18} />
                  </button>
                </div>
                {note && <p className="ruleNote">{note}</p>}
                {project.levelCount > 1 && !aboutObject(rule) && (
                  <div className="chipGroup ruleScope" role="radiogroup" aria-label="Where this rule works">
                    <button type="button" role="radio" aria-checked={!!rule.levelId} className={rule.levelId ? 'on' : ''} onClick={() => update(rule.id, { levelId: project.level.id })}>
                      This level
                    </button>
                    <button type="button" role="radio" aria-checked={!rule.levelId} className={rule.levelId ? '' : 'on'} onClick={() => update(rule.id, { levelId: undefined })}>
                      Every level
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {children}
    </section>
  );
}

interface Props {
  project: LevelProject;
  onChange(rules: Rule[]): void;
  onClose(): void;
  /** Open with this sprite selected (and its objects showing). */
  focusSpriteId?: string;
}

/** Keys for the list on the left: 'game', 'treasure', a sprite id, or 'obj:' + an object id. */
type NavKey = string;
const objKey = (id: string) => `obj:${id}`;

function subjectOf(key: NavKey): RuleSubject {
  if (key === 'game') return { kind: 'game' };
  if (key === 'treasure') return { kind: 'treasure' };
  if (key.startsWith('obj:')) return { kind: 'object', objectId: key.slice(4) };
  return { kind: 'sprite', spriteId: key };
}

/**
 * "When … then …" rules. On the left, everything that can have rules: the
 * whole game, the treasure, and each sprite, which drops down to show the
 * placed objects that have rules of their own. On the right, the rules of
 * whatever is selected.
 */
export function RulesEditor({ project, onChange, onClose, focusSpriteId }: Props) {
  const [selected, setSelected] = useState<NavKey>(focusSpriteId ?? 'game');
  const [open, setOpen] = useState<Set<string>>(() => new Set(focusSpriteId ? [focusSpriteId] : []));

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

  const thumb = (spriteId: string, size = 24) => {
    const sprite = project.sprites.find((s) => s.id === spriteId);
    return sprite ? <SpriteThumb sprite={sprite} palette={project.palette} size={size} /> : null;
  };
  const count = (subject: RuleSubject) => project.rules.filter((r) => sameSubject(ruleSubject(r), subject)).length;
  /** Objects with rules of their own, for the drop-downs. */
  const withRules = (objects: LevelObject[]) => objects.filter((o) => objectRules(project, o.id).length > 0);
  // Rules about objects no longer in the level, so they can still be seen and deleted.
  const orphanIds = [
    ...new Set(
      project.rules.flatMap((r) => {
        const s = ruleSubject(r);
        return s.kind === 'object' && !findObject(project, s.objectId) ? [s.objectId] : [];
      }),
    ),
  ];

  const treasureId = project.level.collectibleSpriteId;
  const groups: Array<{ key: NavKey; title: string; icon: ReactNode; hint: string; addLabel: string; objects: LevelObject[] }> = [
    { key: 'game', title: 'Whole game', icon: <Globe size={22} aria-hidden="true" />, hint: 'Starting, the goal, hearts, all enemies', addLabel: 'Add game rule', objects: [] },
    {
      key: 'treasure',
      title: 'Treasure',
      icon: thumb(treasureId),
      hint: `Collecting ${spriteName(project, treasureId)}`,
      addLabel: 'Add treasure rule',
      objects: withRules(project.level.objects.filter((o) => o.kind === 'treasure')),
    },
    ...ruleSprites(project).map((s) => ({
      key: s.id,
      title: s.name,
      icon: thumb(s.id),
      hint: isEnemySprite(project, s.id) ? 'Enemy: rules for every one, or just one' : 'Rules for every one, or just one',
      addLabel: `Add ${s.name} rule`,
      objects: withRules(project.level.objects.filter((o) => o.spriteId === s.id)),
    })),
  ];

  // What the right-hand side shows.
  const subject = subjectOf(selected);
  const group = groups.find((g) => g.key === selected);
  const selectedObject = subject.kind === 'object' ? findObject(project, subject.objectId) : undefined;
  const detail = group
    ? { title: group.title, icon: group.icon, hint: group.hint, addLabel: group.addLabel }
    : selectedObject
      ? { title: objectName(project, selectedObject.id), icon: thumb(objectSpriteId(project, selectedObject), 32), hint: 'Just this one', addLabel: 'Add rule' }
      : { title: 'Removed object', icon: <Trash2 size={22} aria-hidden="true" />, hint: 'It is no longer in the level', addLabel: 'Add rule' };

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const navButton = (key: NavKey, label: string, icon: ReactNode, n: number, child = false) => (
    <button
      type="button"
      className={`rulesNavItem ${child ? 'child' : ''} ${selected === key ? 'on' : ''}`}
      aria-current={selected === key}
      onClick={() => setSelected(key)}
    >
      {icon}
      <span>{label}</span>
      <small className={n ? 'has' : ''}>{n}</small>
    </button>
  );

  return (
    <div className="rulesSheet" role="dialog" aria-modal="true" aria-labelledby="rules-title">
      <header className="rulesHeader">
        <Zap size={22} aria-hidden="true" />
        <div>
          <h2 id="rules-title">Rules</h2>
          <p>Pick something on the left to see its rules. Tap a part of a rule to change it.</p>
        </div>
        <button type="button" className="btn primary" onClick={onClose}>
          <Check size={18} aria-hidden="true" /> Done
        </button>
      </header>

      <div className="rulesBody">
        <nav className="rulesNav" aria-label="What the rules are about">
          {groups.map((g) => {
            const own = count(subjectOf(g.key));
            const total = own + g.objects.reduce((n, o) => n + objectRules(project, o.id).length, 0);
            const expandable = g.objects.length > 0;
            const isOpen = open.has(g.key);
            return (
              <div key={g.key} className="rulesNavGroup">
                <div className="rulesNavRow">
                  {navButton(g.key, g.title, g.icon, expandable ? total : own)}
                  {expandable && (
                    <button
                      type="button"
                      className="rulesNavToggle"
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? 'Hide' : 'Show'} ${g.title} objects with their own rules`}
                      onClick={() => toggle(g.key)}
                    >
                      <ChevronDown size={18} aria-hidden="true" className={isOpen ? 'open' : ''} />
                    </button>
                  )}
                </div>
                {expandable &&
                  isOpen &&
                  g.objects.map((o) => navButton(objKey(o.id), objectName(project, o.id), thumb(objectSpriteId(project, o), 20), objectRules(project, o.id).length, true))}
              </div>
            );
          })}
          {orphanIds.map((id) => navButton(objKey(id), 'Removed object', <Trash2 size={18} aria-hidden="true" />, count({ kind: 'object', objectId: id })))}
        </nav>

        <div className="rulesDetail">
          <RuleSection
            key={selected}
            project={project}
            subject={subject}
            icon={detail.icon}
            title={detail.title}
            hint={detail.hint}
            addLabel={detail.addLabel}
            onChange={onChange}
            onAdded={(rule) => {
              // A rule for one object moves the list to that object, so it can be seen.
              const s = ruleSubject(rule);
              if (s.kind === 'object' && objKey(s.objectId) !== selected) {
                const o = findObject(project, s.objectId);
                const parent = o ? (o.kind === 'treasure' ? 'treasure' : o.spriteId) : undefined;
                if (parent) setOpen((prev) => new Set(prev).add(parent));
                setSelected(objKey(s.objectId));
              }
            }}
          />
          {count(subject) === 0 && <p className="rulesEmpty">No rules here yet. Use “{detail.addLabel}” to make one.</p>}
        </div>
      </div>
    </div>
  );
}
