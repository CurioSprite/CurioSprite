import { useCallback, useEffect, useState } from 'react';
import { useDialogs } from './components/Dialogs';
import { LogoMark } from './components/Logo';
import { useMenuNavigation } from './input/useMenuNavigation';
import { createProject } from './models/defaults';
import { createAdventureProject } from './models/adventure';
import { createRacingProject } from './models/racing';
import { createShooterProject } from './models/shooter';
import { LIMITS, type GameMode, type LevelConfig, type Project, type Rule, type Sprite, type WinRule } from './models/project';
import { duplicateProject } from './models/serialization';
import { CreateScreen } from './screens/CreateScreen';
import { EditorScreen } from './screens/EditorScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LevelEditorScreen } from './screens/LevelEditorScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { PlayScreen } from './screens/PlayScreen';
import { ProjectScreen } from './screens/ProjectScreen';
import { ProjectConflictError, openRepository, type ProjectRepository } from './storage';
import { usePlayers } from './storage/usePlayers';
import { ProfilePicker } from './components/ProfilePicker';
import { applyProfileHero } from './models/profile';
import { LEVEL_KIND_TEXT, setLevel, setLevelPlay, setLevelRules, type LevelKind } from './models/levels';
import { gameKindChoices, heroOf } from './components/GameKindDemo';
import { GUEST, unlockLevels, unlockedLevels } from './storage/progress';

type Route =
  | { name: 'home' }
  | { name: 'create' }
  | { name: 'library' }
  /** `makeHero`: open "Make your hero" straight away (a brand-new game). */
  | { name: 'project'; makeHero?: boolean; level?: number }
  | { name: 'editor'; spriteId?: string }
  /** Editing one level. */
  | { name: 'level'; index: number }
  | { name: 'play'; project: Project; returnTo: 'library' | 'project' };

/**
 * The game currently open in Create. Every editor writes into it straight
 * away; one Save stores the whole thing.
 */
interface Session {
  project: Project;
  dirty: boolean;
}

export function App() {
  const dialogs = useDialogs();
  const [repo, setRepo] = useState<ProjectRepository | null>(null);
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [session, setSession] = useState<Session | null>(null);
  const [gameCount, setGameCount] = useState<number | null>(null);
  const players = usePlayers(repo);
  const [choosingPlayer, setChoosingPlayer] = useState(false);

  useEffect(() => {
    void openRepository().then(setRepo);
  }, []);

  useEffect(() => {
    if (repo && route.name === 'home') {
      void repo.list().then((list) => setGameCount(list.filter((e) => e.status === 'ok').length));
    }
  }, [repo, route.name]);

  useMenuNavigation(route.name !== 'play');

  // Warn before closing the browser with unsaved work.
  useEffect(() => {
    if (!session?.dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [session?.dirty]);

  const changeSprites = useCallback((sprites: Sprite[]) => {
    setSession((s) => s && { project: { ...s.project, sprites }, dirty: true });
  }, []);

  // The level editor's changes go into the level being edited.
  const levelIndex = route.name === 'level' ? route.index : 0;
  const changeLevel = useCallback((level: LevelConfig) => {
    setSession((s) => s && { project: setLevel(s.project, levelIndex, level), dirty: true });
  }, [levelIndex]);

  const changeRules = useCallback((rules: Rule[]) => {
    setSession((s) => s && { project: setLevelRules(s.project, levelIndex, rules), dirty: true });
  }, [levelIndex]);

  const changeWinRule = useCallback((winRule: WinRule) => {
    setSession((s) => s && { project: setLevelPlay(s.project, levelIndex, { winRule }), dirty: true });
  }, [levelIndex]);

  /** Progress is kept per player (or for guests); bumped so the level picker shows newly opened levels. */
  const progressFor = players.current?.id ?? GUEST;
  const [, setProgressSeen] = useState(0);

  /** Persists a project, guarding against overwriting newer data. */
  const persist = useCallback(
    async (project: Project): Promise<boolean> => {
      if (!repo) return false;
      try {
        const saved = await repo.save(project);
        setSession({ project: saved, dirty: false });
        dialogs.toast('Saved!');
        return true;
      } catch (e) {
        if (e instanceof ProjectConflictError) {
          const choice = await dialogs.choose({
            title: 'Can’t save over this game',
            message: `${e.message} Save your version as a new game so nothing is lost?`,
            options: [{ value: 'copy', label: 'Save as new game' }],
          });
          if (choice !== 'copy') return false;
          const copy = await repo.create(duplicateProject(project, `${project.meta.name} (copy)`));
          setSession({ project: copy, dirty: false });
          dialogs.toast(`Saved as “${copy.meta.name}”`);
          return true;
        }
        dialogs.toast(e instanceof Error ? `Could not save: ${e.message}` : 'Could not save', 'bad');
        return false;
      }
    },
    [repo, dialogs],
  );

  const newGame = async () => {
    if (!repo) return;
    const player = players.current;
    // First the kind of game. A player's own hero stars in the pictures (a shooter flies its ship, a race drives its car).
    const own = player ? heroOf(applyProfileHero(createProject('Hero'), player)) : undefined;
    const shape = await dialogs.choose<LevelKind>({
      title: 'What kind of game?',
      message: 'You can change this later under How it plays.',
      options: gameKindChoices((k) => (k === 'shooter' || k === 'racing' ? undefined : own)),
    });
    if (!shape) return;
    // Then its name.
    const count = (await repo.list()).length;
    const name = await dialogs.prompt({
      title: `Name your new ${LEVEL_KIND_TEXT[shape].label.toLowerCase()} game`,
      initialValue: `My Game ${count + 1}`,
      confirmLabel: 'Create',
      maxLength: LIMITS.nameMaxLength,
    });
    if (!name) return;
    if (shape === 'shooter' || shape === 'racing') {
      setSession({ project: await repo.create(shape === 'shooter' ? createShooterProject(name) : createRacingProject(name)), dirty: false });
      setRoute({ name: 'project' });
      return;
    }
    const view: GameMode = shape === 'adventure' ? 'topdown' : 'platformer';
    // A player's own hero goes straight into their new game.
    const fresh = shape === 'adventure' ? createAdventureProject(name) : createProject(name, new Date(), view, shape === 'climb');
    const project = await repo.create(player ? applyProfileHero(fresh, player) : fresh);
    setSession({ project, dirty: false });
    if (player) {
      setRoute({ name: 'project' });
      return;
    }
    const makeHero = await dialogs.choose({
      title: 'Make your own hero?',
      message: 'Pick a skin tone, hair and clothes, and you are in the game. You can always do this later.',
      cancelLabel: 'Later',
      options: [{ value: 'yes', label: 'Make my hero', tone: 'primary' }],
    });
    setRoute({ name: 'project', makeHero: makeHero === 'yes' });
  };

  const openProject = (project: Project) => {
    setSession({ project, dirty: false });
    setRoute({ name: 'project' });
  };

  const closeProject = async () => {
    if (session?.dirty) {
      const choice = await dialogs.choose({
        title: 'Save changes?',
        message: `“${session.project.meta.name}” has changes that are not saved.`,
        cancelLabel: 'Stay',
        options: [
          { value: 'discard', label: 'Don’t save', tone: 'danger' },
          { value: 'save', label: 'Save', tone: 'primary' },
        ],
      });
      if (choice === null) return;
      if (choice === 'save' && !(await persist(session.project))) return;
    }
    setSession(null);
    setRoute({ name: 'create' });
  };

  const saveGame = useCallback(() => {
    if (session) void persist(session.project);
  }, [session, persist]);

  if (!repo) {
    return (
      <div className="app loading">
        <LogoMark size={96} />
      </div>
    );
  }

  return (
    <div className="app">
      {repo.volatile && (
        <div className="banner" role="alert">
          This browser can’t store games, so they will disappear when the page closes.
        </div>
      )}

      {route.name === 'home' && (
        <HomeScreen
          gameCount={gameCount}
          player={players.current}
          onCreate={() => setRoute({ name: 'create' })}
          onPlay={() => setRoute({ name: 'library' })}
          onChoosePlayer={() => setChoosingPlayer(true)}
        />
      )}

      {route.name === 'create' && (
        <CreateScreen repo={repo} onBack={() => setRoute({ name: 'home' })} onNewGame={() => void newGame()} onOpen={openProject} />
      )}

      {route.name === 'project' && session && (
        <ProjectScreen
          project={session.project}
          dirty={session.dirty}
          onChange={(project) => setSession({ project, dirty: true })}
          onSave={saveGame}
          onBack={() => void closeProject()}
          onEditSprite={(spriteId) => setRoute({ name: 'editor', spriteId })}
          onEditLevel={(index) => setRoute({ name: 'level', index })}
          makeHeroNow={route.makeHero}
          initialLevel={route.level}
          player={players.current}
          onSaveHeroToPlayer={async (sprite, palette, look) => {
            if (!players.current) return;
            await players.saveHero(players.current.id, sprite, palette, look);
            dialogs.toast(`Saved to ${players.current.name}’s profile`);
          }}
          onPlay={() => setRoute({ name: 'play', project: session.project, returnTo: 'project' })}
        />
      )}

      {route.name === 'editor' && session && (
        <EditorScreen
          project={session.project}
          initialSpriteId={route.spriteId}
          dirty={session.dirty}
          onChange={changeSprites}
          onSave={saveGame}
          onBack={() => setRoute({ name: 'project' })}
        />
      )}

      {route.name === 'level' && session && (
        <LevelEditorScreen
          key={route.index}
          game={session.project}
          levelIndex={Math.min(route.index, session.project.levels.length - 1)}
          dirty={session.dirty}
          onChange={changeLevel}
          onChangeWinRule={changeWinRule}
          onChangeRules={changeRules}
          onSave={saveGame}
          onBack={() => setRoute({ name: 'project', level: route.index })}
        />
      )}

      {route.name === 'library' && (
        <LibraryScreen
          repo={repo}
          onBack={() => setRoute({ name: 'home' })}
          onLaunch={(project) => setRoute({ name: 'play', project, returnTo: 'library' })}
          onGoCreate={() => setRoute({ name: 'create' })}
        />
      )}

      {route.name === 'play' && (
        <PlayScreen
          game={route.project}
          // The person making the game can play every level; players unlock them by winning.
          unlocked={route.returnTo === 'project' ? route.project.levels.length : unlockedLevels(progressFor, route.project.id)}
          onUnlock={(count) => {
            unlockLevels(progressFor, route.project.id, count);
            setProgressSeen((n) => n + 1);
          }}
          exitLabel={route.returnTo === 'project' ? 'Back to game' : 'Library'}
          onExit={() => setRoute(route.returnTo === 'project' ? { name: 'project' } : { name: 'library' })}
        />
      )}
      {choosingPlayer && (
        <ProfilePicker
          profiles={players.profiles}
          currentId={players.currentId}
          onSelect={players.select}
          onCreate={(name, look) => void players.create(name, look).then((p) => dialogs.toast(`Hi ${p.name}!`))}
          onRename={(id, name) => void players.rename(id, name)}
          onChangeLook={(id, look) => void players.changeLook(id, look)}
          onRemove={(id) => void players.remove(id)}
          onClose={() => setChoosingPlayer(false)}
        />
      )}
    </div>
  );
}
