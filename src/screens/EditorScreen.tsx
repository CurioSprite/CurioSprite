import { Eraser, Grid3x3, PaintBucket, Pencil, Play, Plus, Redo2, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { chooseSpriteSize } from '../components/chooseSpriteSize';
import { useDialogs } from '../components/Dialogs';
import { SaveButton } from '../components/SaveButton';
import { SpriteThumb } from '../components/SpriteThumb';
import { TopBar } from '../components/TopBar';
import { EditorCanvas } from '../editor/EditorCanvas';
import {
  activeHistory,
  activeFrame,
  activeImage,
  activeView,
  createEditorState,
  currentSprites,
  editorReducer,
  type Tool,
} from '../editor/editorState';
import { canRedo, canUndo } from '../editor/history';
import { FramesBar } from '../editor/FramesBar';
import { frameCount, frameOf, isBlank } from '../editor/spriteOps';
import { createSprite } from '../models/defaults';
import { FACINGS, LIMITS, TRANSPARENT, type Project, type Sprite, type SpriteSize } from '../models/project';
import { ROLE_LABELS, nextSpriteName, rolesOf } from '../models/projectEdits';
import { PlayScreen } from './PlayScreen';

interface Props {
  project: Project;
  initialSpriteId?: string;
  dirty: boolean;
  /** Pushes edited sprites into the open game (not yet saved). */
  onChange(sprites: Sprite[]): void;
  onSave(): void;
  onBack(): void;
}

const TOOLS: Array<{ tool: Tool; label: string; icon: ReactNode; key: string }> = [
  { tool: 'pencil', label: 'Pencil', icon: <Pencil size={24} />, key: 'p' },
  { tool: 'eraser', label: 'Eraser', icon: <Eraser size={24} />, key: 'e' },
  { tool: 'fill', label: 'Fill', icon: <PaintBucket size={24} />, key: 'f' },
];

export function EditorScreen({ project, initialSpriteId, dirty, onChange, onSave, onBack }: Props) {
  const dialogs = useDialogs();
  const [state, dispatch] = useReducer(editorReducer, undefined, () => createEditorState(project.sprites, initialSpriteId));
  const [testing, setTesting] = useState(false);

  const image = activeImage(state);
  const view = activeView(state);
  const frameImage = activeFrame(state);
  const frames = frameCount(view);
  // Side-view levels only ever show sprites from the front or the side; the back is for top-down ones.
  const views = FACINGS.filter((f) => f !== 'back' || project.levels.some((l) => l.mode !== 'platformer') || image.back).map((f) => ({ facing: f, made: f === 'front' || !!image[f] }));
  const history = activeHistory(state);
  const activeLabel = state.sprites.find((s) => s.id === state.activeId)?.name ?? 'Sprite';
  const roleBadge = (id: string) => rolesOf(project, id).map((r) => ROLE_LABELS[r]).join(' · ');

  // Keep the open game in sync, so one Save stores everything.
  const lastSynced = useRef(state.histories);
  useEffect(() => {
    if (state.stroke || state.histories === lastSynced.current) return;
    lastSynced.current = state.histories;
    onChange(currentSprites(state));
  }, [state, onChange]);

  const clear = async () => {
    if (isBlank(frameImage)) return;
    const ok = await dialogs.confirm({
      title: frames > 1 ? `Clear frame ${state.frame + 1}?` : 'Clear the whole sprite?',
      message: 'You can still press Undo afterwards.',
      confirmLabel: 'Clear',
      danger: true,
    });
    if (ok) dispatch({ type: 'clear' });
  };

  const autoAnimate = async () => {
    if (isBlank(frameOf(view, 0))) {
      dialogs.toast('Draw the first frame, then it can be made to move.', 'bad');
      return;
    }
    if (frames > 1) {
      const ok = await dialogs.confirm({
        title: 'Make new frames?',
        message: 'Your other frames are replaced by an automatic bounce made from frame 1. You can press Undo.',
        confirmLabel: 'Make it move',
      });
      if (!ok) return;
    }
    dispatch({ type: 'autoAnimate' });
  };

  const resize = async (size: SpriteSize) => {
    if (size === image.width) return;
    if (size < image.width && !isBlank(image)) {
      const ok = await dialogs.confirm({
        title: `Shrink to ${size}×${size}?`,
        message: 'Small details may be lost. You can press Undo to get them back.',
        confirmLabel: 'Shrink',
      });
      if (!ok) return;
    }
    dispatch({ type: 'resize', size });
  };

  const newSprite = async () => {
    const size = await chooseSpriteSize(dialogs);
    if (size) dispatch({ type: 'addSprite', sprite: createSprite(nextSpriteName(state.sprites), size) });
  };

  // Keyboard shortcuts.
  useEffect(() => {
    if (testing) return;
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      } else if (mod && k === 'y') {
        e.preventDefault();
        dispatch({ type: 'redo' });
      } else if (mod && k === 's') {
        e.preventDefault();
        onSave();
      } else if (!mod && !e.altKey) {
        const t = TOOLS.find((t) => t.key === k);
        if (t) dispatch({ type: 'tool', tool: t.tool });
        else if (k === 'g') dispatch({ type: 'toggleGrid' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [testing, onSave]);

  if (testing) {
    return <PlayScreen game={project} unlocked={project.levels.length} onUnlock={() => {}} exitLabel="Back to drawing" onExit={() => setTesting(false)} />;
  }

  return (
    <main className="screen">
      <TopBar
        tone="create"
        backLabel="Game"
        onBack={onBack}
        title={
          <span className="editorTitle">
            {project.meta.name} <span className="muted">· {activeLabel}</span>
          </span>
        }
      >
        <button type="button" className="btn play" onClick={() => setTesting(true)}>
          <Play size={18} aria-hidden="true" /> Test
        </button>
        <SaveButton dirty={dirty} onSave={onSave} />
      </TopBar>

      <div className="editorBody">
        <aside className="toolPanel" aria-label="Tools">
          {TOOLS.map((t) => (
            <button
              key={t.tool}
              type="button"
              className={`toolBtn ${state.tool === t.tool ? 'on' : ''}`}
              aria-pressed={state.tool === t.tool}
              onClick={() => dispatch({ type: 'tool', tool: t.tool })}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
          <button type="button" className={`toolBtn ${state.showGrid ? 'on soft' : ''}`} aria-pressed={state.showGrid} onClick={() => dispatch({ type: 'toggleGrid' })}>
            <Grid3x3 size={24} />
            <span>Grid</span>
          </button>
          <button type="button" className="toolBtn" disabled={!canUndo(history)} onClick={() => dispatch({ type: 'undo' })}>
            <Undo2 size={24} />
            <span>Undo</span>
          </button>
          <button type="button" className="toolBtn" disabled={!canRedo(history)} onClick={() => dispatch({ type: 'redo' })}>
            <Redo2 size={24} />
            <span>Redo</span>
          </button>
          <button type="button" className="toolBtn danger" disabled={isBlank(frameImage)} onClick={() => void clear()}>
            <Trash2 size={24} />
            <span>Clear</span>
          </button>
          <div className="sizeToggle" role="radiogroup" aria-labelledby="sizeToggleLabel">
            <span id="sizeToggleLabel" className="sizeToggleLabel">Sprite size</span>
            {([16, 32] as const).map((size) => (
              <button
                key={size}
                type="button"
                role="radio"
                aria-checked={image.width === size}
                className={image.width === size ? 'on' : ''}
                onClick={() => void resize(size)}
              >
                {size}×{size}
              </button>
            ))}
          </div>
        </aside>

        <div className="editorCenter">
          <FramesBar
            image={view}
            facing={state.facing}
            views={views}
            onFacing={(facing) => dispatch({ type: 'facing', facing })}
            palette={project.palette}
            frame={state.frame}
            onSelect={(index) => dispatch({ type: 'frame', index })}
            onCopy={() => dispatch({ type: 'addFrame' })}
            onRemove={() => dispatch({ type: 'removeFrame' })}
            onAuto={() => void autoAnimate()}
          />
          <EditorCanvas
            image={frameImage}
            palette={project.palette}
            showGrid={state.showGrid}
            onStrokeBegin={(x, y) => dispatch({ type: 'strokeBegin', x, y })}
            onStrokeMove={(x, y) => dispatch({ type: 'strokeMove', x, y })}
            onStrokeEnd={() => dispatch({ type: 'strokeEnd' })}
          />
        </div>

        <aside className="sidePanel">
          <div className="spriteTabs" role="tablist" aria-label="Sprites">
            {currentSprites(state).map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={s.id === state.activeId}
                className={s.id === state.activeId ? 'on' : ''}
                onClick={() => dispatch({ type: 'select', id: s.id })}
              >
                <SpriteThumb sprite={s} palette={project.palette} size={36} />
                <span className="tabName">{s.name}</span>
                {roleBadge(s.id) && <span className="tabRole">{roleBadge(s.id)}</span>}
              </button>
            ))}
            <button
              type="button"
              className="addTab"
              aria-label="New sprite"
              disabled={state.sprites.length >= LIMITS.spritesMax}
              onClick={() => void newSprite()}
            >
              <Plus size={24} aria-hidden="true" />
              <span className="tabName">New</span>
            </button>
          </div>
          <div className="swatches" role="radiogroup" aria-label="Colours">
            <button
              type="button"
              role="radio"
              aria-checked={state.tool !== 'eraser' && state.color === TRANSPARENT}
              className={`clearSwatch ${state.tool !== 'eraser' && state.color === TRANSPARENT ? 'on' : ''}`}
              onClick={() => dispatch({ type: 'color', color: TRANSPARENT })}
            >
              See-through
            </button>
            {project.palette.map((c, i) => {
              const value = i + 1;
              const selected = state.tool !== 'eraser' && state.color === value;
              return (
                <button
                  key={`${c}-${i}`}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`Colour ${c}`}
                  className={selected ? 'on' : ''}
                  style={{ background: c }}
                  onClick={() => dispatch({ type: 'color', color: value })}
                />
              );
            })}
          </div>
        </aside>
      </div>
    </main>
  );
}
