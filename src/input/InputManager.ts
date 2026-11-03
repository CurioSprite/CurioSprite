import {
  ACTIONS,
  DEFAULT_BINDINGS,
  actionForKey,
  emptyActionState,
  readAllGamepads,
  type Action,
  type ActionState,
  type InputBindings,
} from './bindings';

export interface InputFrame {
  /** Actions currently held down. */
  held: ActionState;
  /** Actions that went down since the previous poll. */
  pressed: ActionState;
}

/**
 * Merges keyboard, gamepad and on-screen (virtual) controls into one stream
 * of logical actions. Call `poll()` once per frame.
 */
export class InputManager {
  private keys = emptyActionState();
  private virtual = emptyActionState();
  private previous = emptyActionState();
  /** Presses since the last poll, so a tap shorter than one frame is not lost. */
  private latched = emptyActionState();
  private target: Window | null = null;

  constructor(private bindings: InputBindings = DEFAULT_BINDINGS) {}

  attach(target: Window = window): void {
    if (this.target) return;
    this.target = target;
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.reset);
  }

  detach(): void {
    if (!this.target) return;
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.reset);
    this.target = null;
    this.reset();
  }

  setBindings(bindings: InputBindings): void {
    this.bindings = bindings;
    this.reset();
  }

  /** Used by on-screen touch controls. */
  setVirtual(action: Action, down: boolean): void {
    if (down) this.latched[action] = true;
    this.virtual[action] = down;
  }

  poll(): InputFrame {
    const pads = readAllGamepads(this.bindings);
    const held = emptyActionState();
    const pressed = emptyActionState();
    for (const a of ACTIONS) {
      const down = this.keys[a] || this.virtual[a] || pads[a];
      pressed[a] = (down && !this.previous[a]) || this.latched[a];
      held[a] = down || this.latched[a];
    }
    this.previous = held;
    this.latched = emptyActionState();
    return { held, pressed };
  }

  readonly reset = (): void => {
    this.keys = emptyActionState();
    this.virtual = emptyActionState();
    this.latched = emptyActionState();
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const action = actionForKey(e.code, this.bindings);
    if (!action) return;
    // Stop arrows / space scrolling the page while playing.
    e.preventDefault();
    if (!e.repeat) this.latched[action] = true;
    this.keys[action] = true;
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const action = actionForKey(e.code, this.bindings);
    if (action) this.keys[action] = false;
  };
}
