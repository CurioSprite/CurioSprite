import { ArrowRight, Flag, Heart, Home, Lock, Pause, Play, RotateCcw, Shield, Swords, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Action } from '../input/bindings';
import { InputManager } from '../input/InputManager';
import { STICK_CENTRED, clampToStick, stickDirections, type StickDirections } from '../input/joystick';
import { levelView } from '../models/levels';
import type { Project } from '../models/project';
import { LevelSelect } from '../components/LevelSelect';
import { SpriteThumb } from '../components/SpriteThumb';
import { BATTLE_CHOICES, type BattleChoice } from '../runtime/game';
import { GameRunner, type Hud, type RunnerStats } from '../runtime/GameRunner';

interface Props {
  game: Project;
  /** Go straight into this level (Test from the level editor); otherwise games with several levels start at the level picker. */
  startLevel?: number;
  /** How many levels are open to play. */
  unlocked: number;
  /** Winning a level opens the next: `count` levels are now open. */
  onUnlock(count: number): void;
  exitLabel: string;
  onExit(): void;
}

/** On-screen button that feeds the shared InputManager. */
function PadButton({ input, action, className, label, children }: { input: InputManager; action: Action; className: string; label: string; children: ReactNode }) {
  const release = () => input.setVirtual(action, false);
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      className={`padBtn ${className}`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        input.setVirtual(action, true);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

/** How far (px) the thumb can push the stick from its middle. */
const STICK_REACH = 44;
const STICK_WAYS = ['up', 'down', 'left', 'right'] as const;

/** On-screen joystick: drag the knob, and it holds the arrows that way (diagonals hold two). */
function TouchStick({ input }: { input: InputManager }) {
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);
  const held = useRef<StickDirections>(STICK_CENTRED);
  const centre = useRef({ x: 0, y: 0 });
  const finger = useRef<number | null>(null);
  const hold = (next: StickDirections) => {
    for (const way of STICK_WAYS) if (next[way] !== held.current[way]) input.setVirtual(way, next[way]);
    held.current = next;
  };
  const follow = (clientX: number, clientY: number) => {
    const dx = clientX - centre.current.x;
    const dy = clientY - centre.current.y;
    setKnob(clampToStick(dx, dy, STICK_REACH));
    hold(stickDirections(dx, dy, STICK_REACH));
  };
  const release = () => {
    finger.current = null;
    setKnob(null);
    hold(STICK_CENTRED);
  };
  // Let go of everything if the pad goes away mid-push.
  useEffect(() => () => hold(STICK_CENTRED), []);
  return (
    <div
      className={`stick${knob ? ' active' : ''}`}
      role="presentation"
      onPointerDown={(e) => {
        e.preventDefault();
        if (finger.current !== null) return;
        finger.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        centre.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        follow(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.pointerId === finger.current) follow(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => e.pointerId === finger.current && release()}
      onPointerCancel={(e) => e.pointerId === finger.current && release()}
      onLostPointerCapture={(e) => e.pointerId === finger.current && release()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="stickKnob" style={knob ? { transform: `translate(${knob.x}px, ${knob.y}px)` } : undefined} />
    </div>
  );
}

const BATTLE_LABELS: Record<BattleChoice, string> = { attack: 'Attack', defend: 'Defend', run: 'Run' };
const BATTLE_ICONS: Record<BattleChoice, ReactNode> = {
  attack: <Swords size={22} aria-hidden="true" />,
  defend: <Shield size={22} aria-hidden="true" />,
  run: <Undo2 size={22} aria-hidden="true" />,
};

const coarsePointer = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export function PlayScreen({ game, startLevel, unlocked, onUnlock, exitLabel, onExit }: Props) {
  const picker = startLevel === undefined && game.levels.length > 1;
  const [levelIndex, setLevelIndex] = useState<number | null>(picker ? null : (startLevel ?? 0));
  if (levelIndex === null) {
    return <LevelSelect game={game} unlocked={unlocked} exitLabel={exitLabel} onPick={setLevelIndex} onExit={onExit} />;
  }
  return (
    <LevelPlay
      key={levelIndex}
      game={game}
      levelIndex={levelIndex}
      onUnlock={onUnlock}
      // From a level, leaving goes back to the level picker (when there is one).
      exitLabel={picker ? 'Levels' : exitLabel}
      onExit={picker ? () => setLevelIndex(null) : onExit}
      onNext={() => setLevelIndex(levelIndex + 1)}
      onGoLevel={(index) => {
        // Going through a door opens that level too.
        onUnlock(index + 1);
        setLevelIndex(index);
      }}
    />
  );
}

interface LevelPlayProps {
  game: Project;
  levelIndex: number;
  onUnlock(count: number): void;
  exitLabel: string;
  onExit(): void;
  onNext(): void;
  onGoLevel(index: number): void;
}

/** One level being played. */
function LevelPlay({ game, levelIndex, onUnlock, exitLabel, onExit, onNext, onGoLevel }: LevelPlayProps) {
  const project = useMemo(() => levelView(game, levelIndex), [game, levelIndex]);
  const hasNext = levelIndex + 1 < game.levels.length;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runnerRef = useRef<GameRunner | null>(null);
  const input = useMemo(() => new InputManager(), []);
  const [hud, setHud] = useState<Hud>({
    collected: 0,
    total: 0,
    status: 'playing',
    paused: false,
    winRule: project.settings.winRule,
    goalOpen: project.settings.winRule !== 'coinsThenGoal',
    atLockedGoal: false,
    hearts: project.player.hearts,
    maxHearts: project.player.hearts,
    healthStyle: project.player.health ?? 'hearts',
    shield: 0,
    maxShield: 0,
    enemiesLeft: 0,
    enemiesTotal: 0,
    battle: null,
    message: null,
    dialog: null,
    dialogMore: false,
    winMessage: '',
  });
  const [showPad, setShowPad] = useState(coarsePointer);
  // Open the game with ?debug to see frame rate and controller details (for testing new hardware).
  const debug = useMemo(() => new URLSearchParams(window.location.search).has('debug'), []);
  const [stats, setStats] = useState<RunnerStats | null>(null);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;
  const nextRef = useRef<() => boolean>(() => false);
  nextRef.current = () => {
    if (!hasNext) return false;
    onNext();
    return true;
  };

  const goRef = useRef<(id: string) => void>(() => {});
  goRef.current = (id) => {
    const index = game.levels.findIndex((l) => l.id === id);
    if (index >= 0) onGoLevel(index);
  };

  // Winning opens the next level.
  useEffect(() => {
    if (hud.status === 'won' && hasNext) onUnlock(levelIndex + 2);
  }, [hud.status === 'won']);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Space / Enter belong to the game now, not to whichever button was focused.
    (document.activeElement as HTMLElement | null)?.blur();
    const runner = new GameRunner(canvas, project, input, {
      onHud: setHud,
      onExit: () => exitRef.current(),
      onStats: debug ? setStats : undefined,
      nextLevel: () => nextRef.current(),
      goLevel: (id) => goRef.current(id),
    });
    runnerRef.current = runner;
    runner.start();
    return () => {
      runner.stop();
      runnerRef.current = null;
    };
  }, [project, input]);

  // Reveal the touch pad the first time the screen is touched.
  useEffect(() => {
    const onTouch = () => setShowPad(true);
    window.addEventListener('touchstart', onTouch, { once: true });
    return () => window.removeEventListener('touchstart', onTouch);
  }, []);

  const ended = hud.status !== 'playing';
  const overlay = ended || hud.paused;
  const { mode, battle: battleStyle } = project.settings;
  // The counter shows the game's own treasure, whatever it looks like.
  const treasureSprite = project.sprites.find((s) => s.id === project.level.collectibleSpriteId);
  const enemySprite = hud.battle ? project.sprites.find((s) => s.id === hud.battle!.enemySpriteId) : undefined;
  const heroSprite = project.sprites.find((s) => s.id === project.player.spriteId);
  const heroBack = heroSprite && { width: heroSprite.width, height: heroSprite.height, pixels: heroSprite.back?.[0] ?? heroSprite.pixels };
  const controls =
    mode === 'shooter'
      ? 'Turn: ← → / A D · Thrust: ↑ · Brake: ↓ · Fire: Z / Space'
      : mode === 'platformer'
      ? `Move: arrows / WASD · Jump: Z / Space${battleStyle === 'action' ? ' · Attack: X' : ''}`
      : battleStyle === 'action'
        ? 'Move: arrows / WASD · Attack: Z / Space · Dash: X'
        : 'Move: arrows / WASD · Dash: Z / Space';

  return (
    <main className="screen playScreen" data-game-running>
      <div className="stage">
        <canvas ref={canvasRef} className="gameCanvas" aria-label={`${project.meta.name} game screen`} />

        <div className="playHud">
          <button type="button" className="btn back" onClick={onExit}>
            <Home size={18} aria-hidden="true" /> {exitLabel}
          </button>
          <strong className="playName">{project.levelCount > 1 ? `${levelIndex + 1}. ${project.level.name}` : project.meta.name}</strong>
          <span className="heartsPill">
            <HealthMeter hud={hud} size={16} />
          </span>
          {hud.enemiesTotal > 0 && hud.winRule === 'enemies' && (
            <span className="goalPill open">
              <Swords size={16} aria-hidden="true" /> {hud.enemiesLeft} left
            </span>
          )}
          {(hud.winRule === 'goal' || hud.winRule === 'coinsThenGoal') && (
            <span className={`goalPill ${hud.goalOpen ? 'open' : 'locked'}`}>
              {hud.goalOpen ? <Flag size={16} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
              {!hud.goalOpen ? 'Goal locked' : hud.winRule === 'goal' ? 'Reach the goal' : 'Goal open!'}
            </span>
          )}
          {(hud.total > 0 || hud.winRule === 'coins' || hud.winRule === 'coinsThenGoal') && (
            <span className="coinCount" aria-live="polite" aria-label={`Treasure: ${hud.collected} of ${hud.total}`}>
              {treasureSprite ? <SpriteThumb sprite={treasureSprite} palette={project.palette} size={20} /> : <span className="coinDot" aria-hidden="true" />}
              {hud.collected} / {hud.total}
            </span>
          )}
          <button type="button" className="iconBtn" aria-label={hud.paused ? 'Resume' : 'Pause'} onClick={() => runnerRef.current?.setPaused(!hud.paused)} disabled={ended}>
            {hud.paused ? <Play size={20} /> : <Pause size={20} />}
          </button>
        </div>

        <div className="banners">
          {hud.message && hud.status === 'playing' && !hud.battle && (
            <div className="ruleMessage" role="status">
              {hud.message}
            </div>
          )}
          {hud.atLockedGoal && hud.status === 'playing' && (
            <div className="goalHint" role="status">
              <Lock size={18} aria-hidden="true" />{' '}
              {hud.winRule === 'coinsThenGoal' && hud.collected < hud.total
                ? `Collect all the treasure to open the goal! ${hud.total - hud.collected} left`
                : 'The goal is locked.'}
            </div>
          )}
        </div>

        {hud.battle && !overlay && (
          <div className={`battleScreen ${hud.battle.wild ? 'wild' : ''}`} role="dialog" aria-label={`Battle with ${hud.battle.enemyName}`}>
            <div className="battleInfo foe">
              <strong>{hud.battle.enemyName}</strong>
              <div className="hpBar" aria-label={`${hud.battle.enemyHp} of ${hud.battle.enemyMaxHp} hit points`}>
                <span style={{ width: `${(hud.battle.enemyHp / hud.battle.enemyMaxHp) * 100}%` }} />
              </div>
            </div>
            <div className="battleSpot foe">{enemySprite && <SpriteThumb sprite={enemySprite} palette={project.palette} size={112} />}</div>
            {/* The hero is seen from behind, facing the creature (its back view, if it has one). */}
            <div className="battleSpot you">{heroBack && <SpriteThumb sprite={heroBack} palette={project.palette} size={120} />}</div>
            <div className="battleInfo you">
              <strong>{heroSprite?.name ?? 'You'}</strong>
              <span className="battleHearts">
                <HealthMeter hud={hud} size={18} />
              </span>
            </div>
            <div className="battleBox">
              {hud.battle.phase === 'message' ? (
                <p className="battleMessage" aria-live="polite">
                  {hud.battle.message}
                </p>
              ) : (
                <>
                  <p className="battleMessage ask">What will you do?</p>
                  <div className="battleChoices" role="group" aria-label="Choose what to do">
                    {BATTLE_CHOICES.map((c, i) => (
                      <button
                        key={c}
                        type="button"
                        className={`battleChoice ${hud.battle!.choice === i ? 'on' : ''}`}
                        onClick={() => runnerRef.current?.chooseBattle(c)}
                      >
                        {BATTLE_ICONS[c]}
                        {BATTLE_LABELS[c]}
                        {c === 'attack' && hud.battle!.powered && <small>×2</small>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {hud.dialog && !overlay && (
          <div className="textBox" role="status" aria-live="polite">
            <p>{hud.dialog}</p>
            <span className="textBoxNext" aria-hidden="true">{hud.dialogMore ? '▼' : '■'}</span>
          </div>
        )}

        {overlay && (
          <div className="stageOverlay">
            <div className="overlayCard">
              <h2>{hud.status === 'won' ? hud.winMessage : hud.status === 'lost' ? (hud.healthStyle === 'bar' ? 'Out of health!' : 'Out of hearts!') : 'Paused'}</h2>
              {hud.status === 'won' && project.levelCount > 1 && (
                <p className="levelDone">{hasNext ? `${game.levels[levelIndex + 1].name} is open!` : 'You finished every level!'}</p>
              )}
              <div className="overlayButtons">
                {hud.status === 'won' && hasNext && (
                  <button type="button" className="btn primary big" onClick={onNext}>
                    Next level <ArrowRight size={20} aria-hidden="true" />
                  </button>
                )}
                {ended ? (
                  <button type="button" className={`btn big ${hud.status === 'won' && hasNext ? '' : 'primary'}`} onClick={() => runnerRef.current?.restart()}>
                    <RotateCcw size={20} aria-hidden="true" /> {hud.status === 'lost' ? 'Try again' : 'Play again'}
                  </button>
                ) : (
                  <button type="button" className="btn primary big" onClick={() => runnerRef.current?.setPaused(false)}>
                    <Play size={20} aria-hidden="true" /> Resume
                  </button>
                )}
                <button type="button" className="btn big" onClick={onExit}>
                  <Home size={20} aria-hidden="true" /> {exitLabel}
                </button>
              </div>
              <p className="muted small">{ended ? (hud.status === 'won' && hasNext ? 'A / Start: next level' : 'A / Start: play again') : 'Start: resume'} · Home / Esc: leave</p>
            </div>
          </div>
        )}

        {debug && stats && (
          <pre className="debugStats" aria-hidden="true">
            {`${stats.fps} fps\nGamepad API: ${typeof navigator.getGamepads === 'function' ? 'yes' : 'no'}\nControllers: ${
              typeof navigator.getGamepads === 'function' ? navigator.getGamepads().filter(Boolean).length : 0
            }\nLast: ${stats.lastAction ?? '-'}`}
          </pre>
        )}

        {showPad && (
          <div className="touchPad">
            <TouchStick input={input} />
            <div className="faceButtons">
              <PadButton input={input} action="secondary" className="b" label="B">B</PadButton>
              <PadButton input={input} action="primary" className="a" label="A">A</PadButton>
            </div>
          </div>
        )}

        {!showPad && (
          <p className="controlsHint">
            {hud.battle ? 'Choose: arrows · OK: Z / Space' : hud.dialog ? 'Next: Z / Space' : controls} · Pause: Enter · Leave: Esc
          </p>
        )}
      </div>
    </main>
  );
}

/** Health as hearts or a bar, with the shield (if the game has one) in front. */
function HealthMeter({ hud, size }: { hud: Hud; size: number }) {
  const shield = hud.maxShield > 0;
  if (hud.healthStyle === 'bar') {
    const label = `Health ${Math.ceil(hud.hearts)} of ${hud.maxHearts}${shield ? `, shield ${Math.round((hud.shield / hud.maxShield) * 100)}%` : ''}`;
    return (
      <span className="healthMeter" role="img" aria-label={label}>
        {shield && <Shield size={size} aria-hidden="true" className={hud.shield > 0 ? 'shieldOn' : 'shieldOff'} />}
        <span className="healthBars">
          {shield && (
            <span className="shieldBar">
              <span style={{ width: `${(hud.shield / hud.maxShield) * 100}%` }} />
            </span>
          )}
          <span className={`healthBar ${hud.hearts / hud.maxHearts <= 0.3 ? 'low' : ''}`}>
            <span style={{ width: `${(hud.hearts / hud.maxHearts) * 100}%` }} />
          </span>
        </span>
      </span>
    );
  }
  const label = `${hud.hearts} of ${hud.maxHearts} hearts${shield ? `, ${Math.floor(hud.shield)} of ${hud.maxShield} shields` : ''}`;
  return (
    <span className="healthMeter" role="img" aria-label={label}>
      {Array.from({ length: hud.maxShield }, (_, i) => (
        <Shield key={`s${i}`} size={size} aria-hidden="true" className={i < Math.floor(hud.shield) ? 'shieldOn' : 'shieldOff'} />
      ))}
      {Array.from({ length: hud.maxHearts }, (_, i) => (
        <Heart key={i} size={size} aria-hidden="true" className={i < hud.hearts ? 'full' : 'empty'} />
      ))}
    </span>
  );
}
