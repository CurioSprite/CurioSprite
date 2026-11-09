import { Play } from 'lucide-react';
import { SpriteThumb } from '../components/SpriteThumb';
import { TopBar } from '../components/TopBar';
import type { Project } from '../models/project';
import type { ProjectRepository } from '../storage';
import { useProjectList } from './useProjectList';

interface Props {
  repo: ProjectRepository;
  onBack(): void;
  onLaunch(project: Project): void;
  onGoCreate(): void;
}

export function LibraryScreen({ repo, onBack, onLaunch, onGoCreate }: Props) {
  const { entries, error } = useProjectList(repo);
  const games = (entries ?? []).flatMap((e) => (e.status === 'ok' ? [e.project] : []));
  const damaged = (entries ?? []).length - games.length;

  return (
    <main className="screen">
      <TopBar title="Play" tone="play" backLabel="Home" onBack={onBack} />
      <div className="screenBody">
        {error && <p className="errorText">{error}</p>}
        {entries === null && <p className="muted">Loading…</p>}
        {entries !== null && games.length === 0 && (
          <div className="emptyNote">
            <p>No games to play yet.</p>
            <button type="button" className="btn primary big" onClick={onGoCreate}>
              Make one in Create
            </button>
          </div>
        )}
        <div className="gameGrid">
          {games.map((p) => (
            <button key={p.id} type="button" className="gameCard" onClick={() => onLaunch(p)} style={{ ['--sky' as string]: p.levels[0].background }}>
              <span className="gameArt">
                <SpriteThumb sprite={p.sprites.find((s) => s.id === p.player.spriteId) ?? p.sprites[0]} palette={p.palette} size={72} />
              </span>
              <strong>{p.meta.name}</strong>
              <small>
                <Play size={14} aria-hidden="true" /> {p.levels.length > 1 ? `${p.levels.length} levels` : p.levels[0].mode === 'racing' ? 'Racing' : p.levels[0].mode === 'shooter' ? 'Shooter' : p.levels[0].mode === 'topdown' ? 'Explore' : p.levels[0].direction === 'up' ? 'Climb' : 'Jump & Run'}
              </small>
            </button>
          ))}
        </div>
        {damaged > 0 && <p className="muted small">{damaged} damaged game(s) hidden. You can delete them in Create.</p>}
      </div>
    </main>
  );
}
