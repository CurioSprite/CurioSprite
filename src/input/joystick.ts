/**
 * The on-screen joystick: where the thumb is, turned into the same up / down /
 * left / right presses the arrow keys make. Pure, so it can be tested.
 */

export type StickDirections = { up: boolean; down: boolean; left: boolean; right: boolean };

/** How far (of the stick's reach) the thumb must move before it counts. */
export const STICK_DEAD_ZONE = 0.3;

export const STICK_CENTRED: StickDirections = { up: false, down: false, left: false, right: false };

/**
 * The directions held for a thumb `dx`, `dy` pixels from the middle of a stick
 * that reaches `radius` pixels. Eight ways: each eighth of the circle is one
 * direction, or two together on the diagonals.
 */
export function stickDirections(dx: number, dy: number, radius: number): StickDirections {
  if (Math.hypot(dx, dy) < radius * STICK_DEAD_ZONE) return STICK_CENTRED;
  // Clockwise from right, in eighths: 0 right, 2 down, 4 left, 6 up.
  const eighth = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) & 7;
  return {
    right: eighth === 7 || eighth === 0 || eighth === 1,
    down: eighth >= 1 && eighth <= 3,
    left: eighth >= 3 && eighth <= 5,
    up: eighth >= 5 && eighth <= 7,
  };
}

/** The thumb's spot drawn inside the stick's reach. */
export function clampToStick(dx: number, dy: number, radius: number): { x: number; y: number } {
  const d = Math.hypot(dx, dy);
  return d <= radius ? { x: dx, y: dy } : { x: (dx / d) * radius, y: (dy / d) * radius };
}
