import { Check, Pencil, Trash2, Zap } from 'lucide-react';
import { useEffect } from 'react';
import { ENEMY_MOVES, LIMITS, type EnemyMoves, type LevelObject, type LevelProject, type Rule } from '../models/project';
import { isEnemyObject, objectName, objectRules, ruleSubject } from '../models/rules';
import { useDialogs } from './Dialogs';
import { RuleSection, objectSpriteId } from './RulesEditor';
import { SpriteThumb } from './SpriteThumb';

interface Props {
  /** The game, with the level as it is being edited. */
  project: LevelProject;
  object: LevelObject;
  onUpdate(patch: Partial<Pick<LevelObject, 'name' | 'moves' | 'hp'>>): void;
  onRemove(): void;
  onChangeRules(rules: Rule[]): void;
  /** Opens the full Rules screen at this object's sprite. */
  onOpenSpriteRules(spriteId: string): void;
  onClose(): void;
}

const MOVE_LABELS: Record<EnemyMoves, string> = { still: 'Stays put', wander: 'Wanders', patrol: 'Back & forth', chase: 'Chases' };
const TOUGHNESS = [1, 2, 3, 5];

/**
 * One placed object: its name, what it shares with every copy of its sprite,
 * its own enemy settings, and rules for just this one.
 */
export function ObjectPanel({ project, object: o, onUpdate, onRemove, onChangeRules, onOpenSpriteRules, onClose }: Props) {
  const dialogs = useDialogs();
  const name = objectName(project, o.id);
  const spriteId = objectSpriteId(project, o);
  const sprite = project.sprites.find((s) => s.id === spriteId);
  const spriteLabel = sprite?.name ?? 'sprite';
  const enemyType = o.kind === 'sprite' ? project.level.enemies.find((e) => e.spriteId === o.spriteId) : undefined;
  const enemy = isEnemyObject(project, o);
  const walkThrough = o.kind === 'sprite' && project.level.passThroughSpriteIds.includes(o.spriteId!);
  const ownRuleCount = objectRules(project, o.id).length;
  const spriteRuleCount = o.kind === 'sprite' ? project.rules.filter((r) => {
    const s = ruleSubject(r);
    return s.kind === 'sprite' && s.spriteId === o.spriteId;
  }).length : 0;

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

  const rename = async () => {
    const next = await dialogs.prompt({
      title: `Name this ${o.kind === 'sprite' ? spriteLabel : o.kind === 'treasure' ? 'treasure' : 'goal'}`,
      message: 'Leave it empty to use a number again.',
      initialValue: o.name ?? name,
      confirmLabel: 'Rename',
      maxLength: LIMITS.nameMaxLength,
    });
    if (next === null) return;
    onUpdate({ name: next.trim() || undefined });
  };
  const remove = async () => {
    const ok = await dialogs.confirm({
      title: `Remove ${name}?`,
      message: 'Its own rules stay in the Rules list until you delete them. You can press Undo.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) onRemove();
  };

  const shared =
    o.kind === 'treasure'
      ? 'Treasure: the player collects it.'
      : o.kind === 'goal'
        ? 'Goal: touching it finishes the game (when How to win uses the goal).'
        : enemyType
          ? `One of your ${spriteLabel}s. Every ${spriteLabel} is an enemy that ${MOVE_LABELS[enemyType.moves].toLowerCase()} and takes ${enemyType.hp} hit${enemyType.hp === 1 ? '' : 's'}.`
          : `One of your ${spriteLabel}s. Every ${spriteLabel} is ${walkThrough ? 'walk-through' : 'solid'}.`;

  return (
    <div className="rulesSheet objectPanel" role="dialog" aria-modal="true" aria-labelledby="object-title">
      <header className="rulesHeader">
        {sprite && <SpriteThumb sprite={sprite} palette={project.palette} size={44} />}
        <div>
          <h2 id="object-title">{name}</h2>
          <p>Its own rules are on the left; what makes it different from the others is on the right.</p>
        </div>
        <button type="button" className="btn primary" onClick={onClose}>
          <Check size={18} aria-hidden="true" /> Done
        </button>
      </header>

      <div className="objectBody">
        <div className="rulesDetail">
          <RuleSection
            project={project}
            subject={{ kind: 'object', objectId: o.id }}
            icon={<Zap size={24} aria-hidden="true" />}
            title={`${name}’s rules`}
            hint={o.kind === 'goal' ? 'Goals have no “when” of their own. Other rules can make this one appear or disappear.' : 'These only happen for this one.'}
            addLabel="Add rule"
            onChange={onChangeRules}
          />
          {ownRuleCount === 0 && <p className="rulesEmpty">No rules yet. Use “Add rule” to make one.</p>}
        </div>

        <aside className="objectSide" aria-label={`${name} settings`}>
          <p className="objectShared">{shared}</p>
          <div className="objectButtons">
            <button type="button" className="btn small" onClick={() => void rename()}>
              <Pencil size={16} aria-hidden="true" /> Rename
            </button>
            <button type="button" className="btn small danger" onClick={() => void remove()}>
              <Trash2 size={16} aria-hidden="true" /> Remove
            </button>
          </div>

          {enemy && enemyType && (
            <>
              <h3>Just this {spriteLabel}</h3>
              <span className="chipLabel">Moves</span>
              <div className="chipGroup" role="radiogroup" aria-label="How it moves">
                <button type="button" role="radio" aria-checked={o.moves === undefined} className={o.moves === undefined ? 'on' : ''} onClick={() => onUpdate({ moves: undefined })}>
                  Like every {spriteLabel}
                </button>
                {ENEMY_MOVES.map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={o.moves === m} className={o.moves === m ? 'on' : ''} onClick={() => onUpdate({ moves: m })}>
                    {MOVE_LABELS[m]}
                  </button>
                ))}
              </div>
              <span className="chipLabel">Hits to beat it</span>
              <div className="chipGroup" role="radiogroup" aria-label="Hits to beat it">
                <button type="button" role="radio" aria-checked={o.hp === undefined} className={o.hp === undefined ? 'on' : ''} onClick={() => onUpdate({ hp: undefined })}>
                  Like every {spriteLabel}
                </button>
                {TOUGHNESS.map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={o.hp === n} className={o.hp === n ? 'on' : ''} onClick={() => onUpdate({ hp: n })}>
                    {n}
                  </button>
                ))}
              </div>
            </>
          )}

          {o.kind === 'sprite' && (
            <button type="button" className="btn small spriteRulesLink" onClick={() => onOpenSpriteRules(o.spriteId!)}>
              <Zap size={16} aria-hidden="true" /> Rules for every {spriteLabel} ({spriteRuleCount})
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
