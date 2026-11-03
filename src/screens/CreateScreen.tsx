import { AlertTriangle, FolderOpen, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useRef } from 'react';
import { useDialogs } from '../components/Dialogs';
import { SpriteThumb } from '../components/SpriteThumb';
import { TopBar } from '../components/TopBar';
import { LIMITS, type Project } from '../models/project';
import { duplicateProject, parseProject } from '../models/serialization';
import type { ProjectRepository } from '../storage';
import { useProjectList } from './useProjectList';

interface Props {
  repo: ProjectRepository;
  onBack(): void;
  onNewGame(): void;
  onOpen(project: Project): void;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function CreateScreen({ repo, onBack, onNewGame, onOpen }: Props) {
  const dialogs = useDialogs();
  const { entries, error, reload } = useProjectList(repo);
  const fileRef = useRef<HTMLInputElement>(null);

  const rename = async (project: Project) => {
    const name = await dialogs.prompt({
      title: 'Rename game',
      initialValue: project.meta.name,
      confirmLabel: 'Rename',
      maxLength: LIMITS.nameMaxLength,
    });
    if (!name || name === project.meta.name) return;
    try {
      await repo.save({ ...project, meta: { ...project.meta, name } });
      dialogs.toast(`Renamed to “${name}”`);
    } catch (e) {
      dialogs.toast(e instanceof Error ? e.message : 'Could not rename', 'bad');
    }
    await reload();
  };

  const remove = async (id: string, name: string) => {
    const ok = await dialogs.confirm({
      title: `Delete “${name}”?`,
      message: 'This game and all of its sprites will be gone for good.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await repo.remove(id);
    dialogs.toast('Game deleted');
    await reload();
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    const result = parseProject(await file.text());
    if (!result.ok) {
      await dialogs.confirm({ title: 'That file can’t be opened', message: result.errors.slice(0, 3).join('. '), confirmLabel: 'OK' });
      return;
    }
    // Always import under a new id so an existing game is never replaced.
    const imported = await repo.create(duplicateProject(result.project, result.project.meta.name));
    dialogs.toast(`Imported “${imported.meta.name}”`);
    await reload();
  };

  return (
    <main className="screen">
      <TopBar title="Create" tone="create" backLabel="Home" onBack={onBack}>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          <Upload size={18} aria-hidden="true" /> <span className="hideNarrow">Import</span>
        </button>
      </TopBar>

      <div className="screenBody createBody">
        <button type="button" className="newGameTile" onClick={onNewGame}>
          <Plus size={40} aria-hidden="true" />
          <strong>New Game</strong>
          <small>Starts with a hero, treasure, enemies and a level ready to play</small>
        </button>

        <section className="projectList" aria-label="Your games">
          {error && <p className="errorText">{error}</p>}
          {entries === null && <p className="muted">Loading…</p>}
          {entries?.length === 0 && <p className="emptyNote">No games yet. Tap New Game to make your first one!</p>}
          {entries?.map((entry) =>
            entry.status === 'ok' ? (
              <div className="projectRow" key={entry.project.id}>
                <button type="button" className="projectOpen" onClick={() => onOpen(entry.project)}>
                  <SpriteThumb
                    sprite={entry.project.sprites.find((s) => s.id === entry.project.player.spriteId) ?? entry.project.sprites[0]}
                    palette={entry.project.palette}
                    size={44}
                  />
                  <span className="projectText">
                    <strong>{entry.project.meta.name}</strong>
                    <small>Saved {formatDate(entry.project.meta.updatedAt)}</small>
                  </span>
                  <FolderOpen size={20} aria-hidden="true" />
                </button>
                <button type="button" className="iconBtn" aria-label={`Rename ${entry.project.meta.name}`} onClick={() => void rename(entry.project)}>
                  <Pencil size={20} />
                </button>
                <button type="button" className="iconBtn danger" aria-label={`Delete ${entry.project.meta.name}`} onClick={() => void remove(entry.project.id, entry.project.meta.name)}>
                  <Trash2 size={20} />
                </button>
              </div>
            ) : (
              <div className="projectRow damaged" key={entry.id || entry.name}>
                <div className="projectOpen" title={entry.errors.join('\n')}>
                  <AlertTriangle size={30} aria-hidden="true" />
                  <span className="projectText">
                    <strong>{entry.name}</strong>
                    <small>This game’s data is damaged and can’t be opened.</small>
                  </span>
                </div>
                {entry.id && (
                  <button type="button" className="iconBtn danger" aria-label={`Delete damaged game ${entry.name}`} onClick={() => void remove(entry.id, entry.name)}>
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
            ),
          )}
        </section>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".json,.curio,application/json"
        hidden
        onChange={(e) => {
          void importFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </main>
  );
}
