import { Home, Lock, Play } from 'lucide-react';
import { useMemo } from 'react';
import { levelView } from '../models/levels';
import type { Level, Project } from '../models/project';
import { LevelPreview } from './LevelPreview';

interface Props {
  game: Project;
  /** How many levels are open; the rest show locked. */
  unlocked: number;
  exitLabel: string;
  onPick(index: number): void;
  onExit(): void;
}

export const levelKindLabel = (l: Pick<Level, 'mode' | 'direction' | 'movement'>): string =>
  l.mode === 'shooter' ? 'Shooter' : l.mode === 'topdown' ? (l.movement === 'grid' ? 'Adventure' : 'Top-down') : l.direction === 'up' ? 'Climb' : 'Run';

/** Choose a level: winning one opens the next, and any open level can be played again. */
export function LevelSelect({ game, unlocked, exitLabel, onPick, onExit }: Props) {
  const views = useMemo(() => game.levels.map((_, i) => levelView(game, i)), [game]);
  return (
    <main className="screen levelSelect">
      <header className="levelSelectHead">
        <button type="button" className="btn back" onClick={onExit}>
          <Home size={18} aria-hidden="true" /> {exitLabel}
        </button>
        <h1>{game.meta.name}</h1>
        <span className="muted">
          {Math.min(unlocked, game.levels.length)} of {game.levels.length} levels open
        </span>
      </header>
      <div className="levelGrid">
        {views.map((v, i) => {
          const open = i < unlocked;
          return (
            <button
              key={v.level.id}
              type="button"
              className={`levelTile ${open ? '' : 'locked'}`}
              disabled={!open}
              aria-label={open ? `Play ${v.level.name}` : `${v.level.name} (locked)`}
              onClick={() => onPick(i)}
            >
              <span className="levelTileArt">
                <LevelPreview project={v} maxHeight={72} />
                {!open && (
                  <span className="levelLock">
                    <Lock size={28} aria-hidden="true" />
                  </span>
                )}
              </span>
              <strong>
                <span className="levelNumber">{i + 1}</span> {v.level.name}
              </strong>
              <small>
                {open ? <Play size={12} aria-hidden="true" /> : <Lock size={12} aria-hidden="true" />} {levelKindLabel(game.levels[i])}
              </small>
            </button>
          );
        })}
      </div>
    </main>
  );
}
