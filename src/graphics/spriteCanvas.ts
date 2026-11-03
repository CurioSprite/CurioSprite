import { pixelColor } from '../models/palette';
import type { SpriteImage } from '../models/project';

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Renders a sprite into an offscreen canvas at native resolution (1 pixel per
 * sprite pixel). Callers scale it with `imageSmoothingEnabled = false`.
 */
export function createSpriteCanvas(sprite: SpriteImage, palette: readonly string[]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = sprite.width;
  canvas.height = sprite.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const image = ctx.createImageData(sprite.width, sprite.height);
  const rgb = palette.map(hexToRgb);
  sprite.pixels.forEach((value, i) => {
    if (!pixelColor(palette, value)) return;
    const [r, g, b] = rgb[value - 1];
    image.data.set([r, g, b, 255], i * 4);
  });
  ctx.putImageData(image, 0, 0);
  return canvas;
}
