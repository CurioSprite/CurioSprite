import { describe, expect, it } from 'vitest';
import { STICK_CENTRED, clampToStick, stickDirections } from './joystick';

const held = (dx: number, dy: number) =>
  Object.entries(stickDirections(dx, dy, 50))
    .filter(([, on]) => on)
    .map(([d]) => d)
    .sort();

describe('joystick', () => {
  it('does nothing near the middle', () => {
    expect(stickDirections(0, 0, 50)).toEqual(STICK_CENTRED);
    expect(stickDirections(10, -10, 50)).toEqual(STICK_CENTRED);
  });

  it('holds one direction straight out', () => {
    expect(held(40, 0)).toEqual(['right']);
    expect(held(-40, 0)).toEqual(['left']);
    expect(held(0, -40)).toEqual(['up']);
    expect(held(0, 40)).toEqual(['down']);
  });

  it('holds two on the diagonals', () => {
    expect(held(30, -30)).toEqual(['right', 'up']);
    expect(held(-30, -30)).toEqual(['left', 'up']);
    expect(held(-30, 30)).toEqual(['down', 'left']);
    expect(held(30, 30)).toEqual(['down', 'right']);
  });

  it('keeps nearly straight pushes to one direction', () => {
    // 15° off straight right is still just right.
    expect(held(40, -40 * Math.tan(Math.PI / 12))).toEqual(['right']);
  });

  it('works past the edge too', () => {
    expect(held(0, -400)).toEqual(['up']);
  });

  it('keeps the thumb inside the stick', () => {
    expect(clampToStick(10, 0, 50)).toEqual({ x: 10, y: 0 });
    const far = clampToStick(300, 400, 50);
    expect(far.x).toBeCloseTo(30);
    expect(far.y).toBeCloseTo(40);
  });
});
