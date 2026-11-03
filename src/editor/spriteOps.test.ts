import { describe, expect, it } from 'vitest';
import type { SpriteImage } from '../models/project';
import { clearImage, drawLine, floodFill, getPixel, isBlank, resizeImage, setPixel } from './spriteOps';

const blank = (size: 16 | 32 = 16): SpriteImage => ({ width: size, height: size, pixels: new Array(size * size).fill(0) });

describe('setPixel', () => {
  it('paints one pixel without mutating the original', () => {
    const img = blank();
    const next = setPixel(img, 3, 2, 5);
    expect(getPixel(next, 3, 2)).toBe(5);
    expect(getPixel(img, 3, 2)).toBe(0);
    expect(next.pixels.filter((p) => p !== 0)).toHaveLength(1);
  });

  it('returns the same image when nothing changes', () => {
    const img = setPixel(blank(), 1, 1, 4);
    expect(setPixel(img, 1, 1, 4)).toBe(img);
    expect(setPixel(img, -1, 0, 4)).toBe(img);
    expect(setPixel(img, 16, 0, 4)).toBe(img);
  });
});

describe('drawLine', () => {
  it('draws a continuous diagonal', () => {
    const img = drawLine(blank(), 0, 0, 15, 15, 2);
    for (let i = 0; i < 16; i++) expect(getPixel(img, i, i)).toBe(2);
    expect(img.pixels.filter((p) => p === 2)).toHaveLength(16);
  });

  it('leaves no gaps on a shallow line', () => {
    const img = drawLine(blank(), 0, 0, 15, 3, 1);
    for (let x = 0; x < 16; x++) {
      const column = [0, 1, 2, 3].map((y) => getPixel(img, x, y));
      expect(column).toContain(1);
    }
  });

  it('clips pixels outside the canvas', () => {
    const img = drawLine(blank(), -5, 0, 20, 0, 3);
    expect(img.pixels.slice(0, 16).every((p) => p === 3)).toBe(true);
  });
});

describe('floodFill', () => {
  it('fills an enclosed region only', () => {
    let img = blank();
    // A 4×4 box outline from (2,2) to (5,5).
    img = drawLine(img, 2, 2, 5, 2, 1);
    img = drawLine(img, 5, 2, 5, 5, 1);
    img = drawLine(img, 5, 5, 2, 5, 1);
    img = drawLine(img, 2, 5, 2, 2, 1);
    const filled = floodFill(img, 3, 3, 4);
    expect(getPixel(filled, 3, 3)).toBe(4);
    expect(getPixel(filled, 4, 4)).toBe(4);
    expect(getPixel(filled, 2, 2)).toBe(1);
    expect(getPixel(filled, 0, 0)).toBe(0);
    expect(filled.pixels.filter((p) => p === 4)).toHaveLength(4);
  });

  it('fills the whole canvas when empty', () => {
    const filled = floodFill(blank(32), 10, 10, 7);
    expect(filled.pixels.every((p) => p === 7)).toBe(true);
  });

  it('does not leak diagonally', () => {
    let img = blank();
    img = drawLine(img, 0, 1, 1, 0, 1); // diagonal wall cutting off the corner
    const filled = floodFill(img, 0, 0, 5);
    expect(filled.pixels.filter((p) => p === 5)).toHaveLength(1);
  });

  it('is a no-op when the colour already matches', () => {
    const img = blank();
    expect(floodFill(img, 0, 0, 0)).toBe(img);
  });
});

describe('clear / resize', () => {
  it('clears every pixel', () => {
    const img = clearImage(drawLine(blank(), 0, 0, 15, 15, 2));
    expect(isBlank(img)).toBe(true);
  });

  it('scales 16 → 32 with nearest neighbour and back again losslessly', () => {
    const img = setPixel(blank(), 1, 2, 6);
    const big = resizeImage(img, 32);
    expect(big.width).toBe(32);
    expect(big.pixels).toHaveLength(1024);
    expect([getPixel(big, 2, 4), getPixel(big, 3, 4), getPixel(big, 2, 5), getPixel(big, 3, 5)]).toEqual([6, 6, 6, 6]);
    expect(resizeImage(big, 16).pixels).toEqual(img.pixels);
  });
});
