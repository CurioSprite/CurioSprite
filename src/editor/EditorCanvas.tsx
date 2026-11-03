import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { pixelColor } from '../models/palette';
import type { SpriteImage } from '../models/project';

interface Props {
  image: SpriteImage;
  palette: readonly string[];
  showGrid: boolean;
  onStrokeBegin(x: number, y: number): void;
  onStrokeMove(x: number, y: number): void;
  onStrokeEnd(): void;
}

/** Draws the editable sprite. Separate from the game renderer on purpose. */
function renderEditor(
  ctx: CanvasRenderingContext2D,
  px: number,
  img: SpriteImage,
  palette: readonly string[],
  showGrid: boolean,
  hover: { x: number; y: number } | null,
): void {
  const cell = px / img.width;
  ctx.clearRect(0, 0, px, px);
  // Checkerboard shows transparency.
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const c = pixelColor(palette, img.pixels[y * img.width + x]);
      ctx.fillStyle = c ?? ((x + y) % 2 === 0 ? '#e9eef5' : '#d3dbe6');
      ctx.fillRect(Math.floor(x * cell), Math.floor(y * cell), Math.ceil(cell), Math.ceil(cell));
    }
  }
  if (showGrid) {
    const major = img.width / 4;
    for (let i = 1; i < img.width; i++) {
      const pos = Math.round(i * cell) + 0.5;
      ctx.strokeStyle = i % major === 0 ? 'rgba(15,23,42,0.45)' : 'rgba(15,23,42,0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, px);
      ctx.moveTo(0, pos);
      ctx.lineTo(px, pos);
      ctx.stroke();
    }
  }
  if (hover) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(hover.x * cell + 1, hover.y * cell + 1, cell - 2, cell - 2);
  }
}

export function EditorCanvas({ image, palette, showGrid, onStrokeBegin, onStrokeMove, onStrokeEnd }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activePointer = useRef<number | null>(null);
  const [size, setSize] = useState(0);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  // Keep the canvas square and as large as its container allows.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const update = () => setSize(Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || size === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const backing = Math.round(size * dpr);
    if (canvas.width !== backing) {
      canvas.width = backing;
      canvas.height = backing;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderEditor(ctx, size, image, palette, showGrid, hover);
  }, [size, image, palette, showGrid, hover]);

  const cellAt = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.floor(((e.clientX - rect.left) / rect.width) * image.width),
      y: Math.floor(((e.clientY - rect.top) / rect.height) * image.height),
    };
  };

  const inside = (c: { x: number; y: number }) => c.x >= 0 && c.y >= 0 && c.x < image.width && c.y < image.height;

  const end = (e: PointerEvent<HTMLCanvasElement>) => {
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
    onStrokeEnd();
  };

  return (
    <div className="editorCanvasWrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="editorCanvas"
        style={{ width: size, height: size }}
        aria-label={`Sprite canvas, ${image.width} by ${image.height} pixels`}
        onPointerDown={(e) => {
          if (activePointer.current !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          activePointer.current = e.pointerId;
          const c = cellAt(e);
          if (inside(c)) onStrokeBegin(c.x, c.y);
          else activePointer.current = null;
        }}
        onPointerMove={(e) => {
          const c = cellAt(e);
          if (e.pointerType === 'mouse') setHover(inside(c) ? c : null);
          if (activePointer.current === e.pointerId) onStrokeMove(c.x, c.y);
        }}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={() => setHover(null)}
      />
    </div>
  );
}
