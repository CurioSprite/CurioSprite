/**
 * Pure pixel operations used by the sprite editor. Every function returns a
 * new image (or the same instance when nothing changed) so results can be
 * stored in undo history without defensive copying.
 */
import { LIMITS, TRANSPARENT, type AnimatedImage, type Facing, type GameMode, type SpriteImage, type SpriteSize } from '../models/project';

export function inBounds(img: SpriteImage, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < img.width && y < img.height;
}

export function getPixel(img: SpriteImage, x: number, y: number): number {
  return inBounds(img, x, y) ? img.pixels[y * img.width + x] : TRANSPARENT;
}

export function setPixel(img: SpriteImage, x: number, y: number, color: number): SpriteImage {
  if (!inBounds(img, x, y)) return img;
  const i = y * img.width + x;
  if (img.pixels[i] === color) return img;
  const pixels = img.pixels.slice();
  pixels[i] = color;
  return { ...img, pixels };
}

/** Bresenham line so fast pointer movement leaves no gaps. */
export function drawLine(img: SpriteImage, x0: number, y0: number, x1: number, y1: number, color: number): SpriteImage {
  let pixels: number[] | null = null;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    if (inBounds(img, x, y)) {
      const i = y * img.width + x;
      if ((pixels ?? img.pixels)[i] !== color) {
        pixels ??= img.pixels.slice();
        pixels[i] = color;
      }
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return pixels ? { ...img, pixels } : img;
}

/** 4-way flood fill of the contiguous region containing (x, y). */
export function floodFill(img: SpriteImage, x: number, y: number, color: number): SpriteImage {
  if (!inBounds(img, x, y)) return img;
  const target = getPixel(img, x, y);
  if (target === color) return img;
  const { width, height } = img;
  const pixels = img.pixels.slice();
  const stack: number[] = [y * width + x];
  while (stack.length) {
    const i = stack.pop()!;
    if (pixels[i] !== target) continue;
    pixels[i] = color;
    const px = i % width;
    const py = (i - px) / width;
    if (px > 0) stack.push(i - 1);
    if (px < width - 1) stack.push(i + 1);
    if (py > 0) stack.push(i - width);
    if (py < height - 1) stack.push(i + width);
  }
  return { ...img, pixels };
}

export function clearImage(img: SpriteImage): SpriteImage {
  if (img.pixels.every((p) => p === TRANSPARENT)) return img;
  return { ...img, pixels: new Array<number>(img.pixels.length).fill(TRANSPARENT) };
}

export function isBlank(img: SpriteImage): boolean {
  return img.pixels.every((p) => p === TRANSPARENT);
}

// ----- Animation frames ---------------------------------------------------------
// Frame 0 is `pixels`; frames 1… are in `frames`. Drawing tools work on one
// frame at a time, as a plain SpriteImage.

export const frameCount = (img: AnimatedImage): number => 1 + (img.frames?.length ?? 0);

export function frameOf(img: AnimatedImage, index: number): SpriteImage {
  const pixels = index === 0 ? img.pixels : (img.frames?.[index - 1] ?? img.pixels);
  return { width: img.width, height: img.height, pixels };
}

/** Puts a drawn frame back. Returns the same object when nothing changed. */
export function withFrame(img: AnimatedImage, index: number, frame: SpriteImage): AnimatedImage {
  if (frame.pixels === frameOf(img, index).pixels) return img;
  if (index === 0) return { ...img, pixels: frame.pixels };
  const frames = [...(img.frames ?? [])];
  frames[index - 1] = frame.pixels;
  return { ...img, frames };
}

/** Copies a frame and puts the copy right after it (the usual way to start the next frame). */
export function duplicateFrame(img: AnimatedImage, index: number): AnimatedImage {
  if (frameCount(img) >= LIMITS.framesMax) return img;
  const all = [img.pixels, ...(img.frames ?? [])];
  all.splice(index + 1, 0, [...all[index]]);
  return { ...img, pixels: all[0], frames: all.slice(1) };
}

export function removeFrame(img: AnimatedImage, index: number): AnimatedImage {
  if (frameCount(img) <= 1) return img;
  const all = [img.pixels, ...(img.frames ?? [])];
  all.splice(index, 1);
  const [pixels, ...rest] = all;
  const next: AnimatedImage = { width: img.width, height: img.height, pixels };
  if (rest.length) next.frames = rest;
  return next;
}

/** Moves a picture by whole pixels (what slides off the edge is lost). */
export function shiftImage(img: SpriteImage, dx: number, dy: number): SpriteImage {
  const pixels = new Array<number>(img.pixels.length).fill(TRANSPARENT);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const sx = x - dx;
      const sy = y - dy;
      if (sx >= 0 && sy >= 0 && sx < img.width && sy < img.height) pixels[y * img.width + x] = img.pixels[sy * img.width + sx];
    }
  }
  return { ...img, pixels };
}

/**
 * "Make it bounce": an automatic animation for any sprite, made from its
 * first frame: up a little, back down, settling. Replaces any other frames.
 */
export function autoBounce(img: AnimatedImage): AnimatedImage {
  const base = frameOf(img, 0);
  const step = Math.max(1, Math.round(img.height / 16));
  return { width: img.width, height: img.height, pixels: base.pixels, frames: [shiftImage(base, 0, -step).pixels, shiftImage(base, 0, -2 * step).pixels, shiftImage(base, 0, -step).pixels] };
}

/**
 * Changes the canvas size with nearest-neighbour scaling, so a 16×16 drawing
 * becomes a chunky 32×32 one (and vice versa, losing detail).
 */
export function resizeImage(img: SpriteImage, size: SpriteSize): SpriteImage {
  if (img.width === size && img.height === size) return img;
  const pixels = new Array<number>(size * size);
  for (let y = 0; y < size; y++) {
    const sy = Math.floor((y * img.height) / size);
    for (let x = 0; x < size; x++) {
      const sx = Math.floor((x * img.width) / size);
      pixels[y * size + x] = img.pixels[sy * img.width + sx];
    }
  }
  return { width: size, height: size, pixels };
}

/** Resizes every frame of an animated picture, in every view. */
export function resizeAnimated(img: AnimatedImage, size: SpriteSize): AnimatedImage {
  if (img.width === size && img.height === size) return img;
  const one = (f: number[]) => resizeImage({ width: img.width, height: img.height, pixels: f }, size).pixels;
  const next: AnimatedImage = resizeImage(img, size);
  if (img.frames?.length) next.frames = img.frames.map(one);
  if (img.back) next.back = img.back.map(one);
  if (img.side) next.side = img.side.map(one);
  return next;
}

// ----- Views (front, back, side) --------------------------------------------------
// The front is `pixels` + `frames`; the back and side are lists of frames.
// Each view can be handled as an animated picture of its own.

/** One view as an animated picture, or null when the sprite doesn't have it. */
export function viewOf(img: AnimatedImage, facing: Facing): AnimatedImage | null {
  if (facing === 'front') {
    const front: AnimatedImage = { width: img.width, height: img.height, pixels: img.pixels };
    if (img.frames?.length) front.frames = img.frames;
    return front;
  }
  const list = img[facing];
  if (!list?.length) return null;
  const view: AnimatedImage = { width: img.width, height: img.height, pixels: list[0] };
  if (list.length > 1) view.frames = list.slice(1);
  return view;
}

/** Puts a view back (null removes a back or side view). Returns the same object when nothing changed. */
export function withView(img: AnimatedImage, facing: Facing, view: AnimatedImage | null): AnimatedImage {
  const old = viewOf(img, facing);
  const same = (a: number[][] = [], b: number[][] = []) => a.length === b.length && a.every((f, i) => f === b[i]);
  if (view && old && view.pixels === old.pixels && same(view.frames, old.frames)) return img;
  if (!view && !old) return img;
  if (facing === 'front') {
    if (!view) return img;
    const { frames: _old, ...rest } = img;
    return view.frames?.length ? { ...rest, pixels: view.pixels, frames: view.frames } : { ...rest, pixels: view.pixels };
  }
  const { [facing]: _gone, ...rest } = img;
  return view ? { ...rest, [facing]: [view.pixels, ...(view.frames ?? [])] } : rest;
}

/** Starts a back or side view as a copy of the front (with its frames), ready to redraw. */
export function addView(img: AnimatedImage, facing: Facing): AnimatedImage {
  if (viewOf(img, facing)) return img;
  return { ...img, [facing]: [img.pixels, ...(img.frames ?? [])].map((f) => [...f]) };
}


/**
 * Which view to show for something heading in direction `dir`, and whether to
 * mirror it (side views look right). Side-view games always use the side;
 * top-down games use the back going up, the front going down, and the side
 * going left or right. In a shooter the hero is seen from behind and
 * enemies from the front. A missing view falls back to the front.
 */
export function pickView(has: { back: boolean; side: boolean }, mode: GameMode, dir: { x: number; y: number }): { facing: Facing; mirror: boolean } {
  const left = dir.x < 0;
  if (mode === 'platformer') return { facing: has.side ? 'side' : 'front', mirror: left };
  // Shooter: the player looks up at the enemies (from behind, if drawn); everything else faces front.
  if (mode === 'shooter') return { facing: dir.y < 0 && has.back ? 'back' : 'front', mirror: false };
  if (Math.abs(dir.y) > Math.abs(dir.x)) return { facing: dir.y < 0 && has.back ? 'back' : 'front', mirror: false };
  if (dir.x === 0) return { facing: 'front', mirror: false };
  return { facing: has.side ? 'side' : 'front', mirror: left };
}

/** The picture a sprite shows standing still in a game with this view (for the level editor). */
export function restingImage(img: AnimatedImage, mode: GameMode): SpriteImage {
  const pixels = mode === 'platformer' && img.side?.length ? img.side[0] : img.pixels;
  return { width: img.width, height: img.height, pixels };
}
