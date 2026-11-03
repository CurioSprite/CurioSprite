import { emptyActionState } from '../input/bindings';
import type { InputFrame, InputManager } from '../input/InputManager';
import type { HealthStyle, LevelProject, WinRule } from '../models/project';
import { WIN_MESSAGES } from '../models/winRules';
import { STEP, chooseBattle, createGame, enemiesLeft, goalOpen, stepGame, treasureTotal, type BattleChoice, type GameState, type GameStatus } from './game';
import { GameRenderer } from './renderer';

export interface Hud {
  collected: number;
  total: number;
  status: GameStatus;
  paused: boolean;
  winRule: WinRule;
  goalOpen: boolean;
  /** Touching the goal before it is open. */
  atLockedGoal: boolean;
  /** Health: hearts, or points on a bar; and the shield (max 0 without one). */
  hearts: number;
  maxHearts: number;
  healthStyle: HealthStyle;
  shield: number;
  maxShield: number;
  enemiesLeft: number;
  enemiesTotal: number;
  /** A turn-based battle in progress. */
  battle: BattleHud | null;
  /** A rule's message, while it is showing. */
  message: string | null;
  /** What a character is saying (the game waits until A is pressed). */
  dialog: string | null;
  /** More lines still to come after this one. */
  dialogMore: boolean;
  /** Headline for the win screen. */
  winMessage: string;
}

export interface BattleHud {
  enemyName: string;
  enemySpriteId: string;
  enemyHp: number;
  enemyMaxHp: number;
  /** Jumped out of tall grass. */
  wild: boolean;
  /** Showing a message, or waiting for a choice. */
  phase: 'message' | 'choose';
  message: string;
  choice: number;
  powered: boolean;
}

/** For testing on new hardware: how smooth the game runs and which control was pressed last. */
export interface RunnerStats {
  fps: number;
  lastAction: string | null;
}

export interface RunnerCallbacks {
  onHud(hud: Hud): void;
  onExit(): void;
  /** Called about once a second, and whenever a new control is pressed. */
  onStats?(stats: RunnerStats): void;
  /** A / Start after winning, when there is a next level to go on to (otherwise it plays again). */
  nextLevel?(): boolean;
  /** A rule took the player to another level (a door). */
  goLevel?(levelId: string): void;
}

/** Owns the animation loop: polls input, steps the simulation, renders. */
export class GameRunner {
  private state: GameState;
  private readonly renderer: GameRenderer;
  private frameId = 0;
  private last = 0;
  private acc = 0;
  private paused = false;
  private lastHud = '';
  private frames = 0;
  private statsSince = 0;
  private stats: RunnerStats = { fps: 0, lastAction: null };

  constructor(
    canvas: HTMLCanvasElement,
    private readonly project: LevelProject,
    private readonly input: InputManager,
    private readonly callbacks: RunnerCallbacks,
  ) {
    this.state = createGame(project);
    this.renderer = new GameRenderer(canvas, project);
  }

  start(): void {
    if (this.frameId) return;
    this.input.attach();
    this.last = performance.now();
    this.frameId = requestAnimationFrame(this.tick);
    this.emitHud();
  }

  stop(): void {
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    this.input.detach();
  }

  restart(): void {
    this.state = createGame(this.project);
    this.paused = false;
    this.acc = 0;
    this.emitHud();
  }

  /** A battle choice tapped on screen. */
  chooseBattle(choice: BattleChoice): void {
    chooseBattle(this.state, choice);
    this.emitHud();
  }

  setPaused(paused: boolean): void {
    if (this.state.status !== 'playing') return;
    this.paused = paused;
    this.emitHud();
  }

  private readonly tick = (now: number): void => {
    this.frameId = requestAnimationFrame(this.tick);
    const elapsed = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const frame = this.input.poll();
    this.trackStats(now, frame);

    if (frame.pressed.home) {
      this.callbacks.onExit();
      return;
    }
    if (this.state.status !== 'playing') {
      if (frame.pressed.primary || frame.pressed.start) {
        if (!(this.state.status === 'won' && this.callbacks.nextLevel?.())) this.restart();
      }
    } else if (frame.pressed.start) {
      this.setPaused(!this.paused);
    }

    if (!this.paused) {
      this.acc += elapsed;
      let first: InputFrame | null = frame;
      while (this.acc >= STEP) {
        // Edge-triggered presses only apply to the first sub-step.
        stepGame(this.state, first ?? { held: frame.held, pressed: emptyActionState() }, STEP);
        first = null;
        this.acc -= STEP;
      }
    }
    if (this.state.goTo) {
      const to = this.state.goTo;
      this.state.goTo = null;
      this.callbacks.goLevel?.(to);
      return;
    }
    this.renderer.render(this.state);
    this.emitHud();
  };

  private trackStats(now: number, frame: InputFrame): void {
    if (!this.callbacks.onStats) return;
    this.frames++;
    const pressed = (Object.keys(frame.pressed) as Array<keyof typeof frame.pressed>).find((a) => frame.pressed[a]);
    if (pressed) {
      this.stats = { ...this.stats, lastAction: pressed };
      this.callbacks.onStats(this.stats);
    }
    if (!this.statsSince) this.statsSince = now;
    if (now - this.statsSince >= 1000) {
      this.stats = { ...this.stats, fps: Math.round((this.frames * 1000) / (now - this.statsSince)) };
      this.frames = 0;
      this.statsSince = now;
      this.callbacks.onStats(this.stats);
    }
  }

  private emitHud(): void {
    const hud: Hud = {
      collected: this.state.collected,
      total: treasureTotal(this.state),
      status: this.state.status,
      paused: this.paused,
      winRule: this.state.winRule,
      goalOpen: goalOpen(this.state),
      atLockedGoal: this.state.atLockedGoal,
      hearts: this.state.hearts,
      maxHearts: this.state.maxHearts,
      healthStyle: this.state.healthStyle,
      shield: this.state.shield,
      maxShield: this.state.maxShield,
      enemiesLeft: enemiesLeft(this.state),
      enemiesTotal: this.state.enemies.filter((e) => !e.wild).length,
      battle: battleHud(this.state),
      message: this.state.message?.text ?? null,
      dialog: this.state.dialog[0] ?? null,
      dialogMore: this.state.dialog.length > 1,
      winMessage: this.state.wonByRule ? 'You win!' : WIN_MESSAGES[this.state.winRule],
    };
    const key = JSON.stringify(hud);
    if (key === this.lastHud) return;
    this.lastHud = key;
    this.callbacks.onHud(hud);
  }
}

function battleHud(s: GameState): BattleHud | null {
  const b = s.battle;
  if (!b) return null;
  const e = s.enemies[b.enemy];
  return {
    enemyName: e.name,
    enemySpriteId: e.spriteId,
    enemyHp: e.hp,
    enemyMaxHp: e.maxHp,
    wild: !!e.wild,
    phase: b.phase,
    message: b.message,
    choice: b.choice,
    powered: b.powered,
  };
}
