/**
 * Logical actions understood by CurioSprite, independent of the physical
 * device. Games and menus only ever see these.
 */
export const ACTIONS = ['up', 'down', 'left', 'right', 'primary', 'secondary', 'start', 'home'] as const;
export type Action = (typeof ACTIONS)[number];

export interface InputBindings {
  /** KeyboardEvent.code values per action. */
  keyboard: Record<Action, string[]>;
  /** Gamepad button indices per action (W3C "standard" mapping by default). */
  gamepadButtons: Record<Action, number[]>;
  /** Analogue stick axes used for the d-pad actions. */
  gamepadAxes: { horizontal: number; vertical: number; deadzone: number };
}

/**
 * Default mapping. A CurioSprite handheld's controller should present itself
 * as a standard gamepad; if it does not, this object is the single place to
 * remap it (a settings UI can edit and persist a copy later).
 */
export const DEFAULT_BINDINGS: InputBindings = {
  keyboard: {
    up: ['ArrowUp', 'KeyW'],
    down: ['ArrowDown', 'KeyS'],
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    primary: ['KeyZ', 'Space'],
    secondary: ['KeyX'],
    start: ['Enter'],
    home: ['Escape'],
  },
  gamepadButtons: {
    up: [12],
    down: [13],
    left: [14],
    right: [15],
    primary: [0],
    secondary: [1],
    start: [9],
    home: [16, 8],
  },
  gamepadAxes: { horizontal: 0, vertical: 1, deadzone: 0.4 },
};

export type ActionState = Record<Action, boolean>;

export function emptyActionState(): ActionState {
  return { up: false, down: false, left: false, right: false, primary: false, secondary: false, start: false, home: false };
}

/** Minimal shape of a Gamepad, so mapping can be unit-tested without a browser. */
export interface GamepadSnapshot {
  buttons: ReadonlyArray<{ pressed: boolean; value?: number }>;
  axes: ReadonlyArray<number>;
}

export function readGamepad(pad: GamepadSnapshot, bindings: InputBindings = DEFAULT_BINDINGS): ActionState {
  const state = emptyActionState();
  for (const action of ACTIONS) {
    state[action] = bindings.gamepadButtons[action].some((i) => {
      const b = pad.buttons[i];
      return !!b && (b.pressed || (b.value ?? 0) > 0.5);
    });
  }
  const { horizontal, vertical, deadzone } = bindings.gamepadAxes;
  const ax = pad.axes[horizontal] ?? 0;
  const ay = pad.axes[vertical] ?? 0;
  if (ax < -deadzone) state.left = true;
  if (ax > deadzone) state.right = true;
  if (ay < -deadzone) state.up = true;
  if (ay > deadzone) state.down = true;
  return state;
}

/** Combined state of every connected gamepad. */
export function readAllGamepads(bindings: InputBindings = DEFAULT_BINDINGS): ActionState {
  const state = emptyActionState();
  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    const s = readGamepad(pad, bindings);
    for (const a of ACTIONS) state[a] ||= s[a];
  }
  return state;
}

export function actionForKey(code: string, bindings: InputBindings = DEFAULT_BINDINGS): Action | null {
  for (const action of ACTIONS) if (bindings.keyboard[action].includes(code)) return action;
  return null;
}
