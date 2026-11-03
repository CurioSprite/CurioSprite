import { useEffect, useRef } from 'react';
import { createSpriteCanvas } from '../graphics/spriteCanvas';
import type { SpriteImage } from '../models/project';

interface Props {
  sprite: SpriteImage;
  palette: readonly string[];
  size?: number;
  className?: string;
}

/** Small crisp preview of a sprite. */
export function SpriteThumb({ sprite, palette, size = 48, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(createSpriteCanvas(sprite, palette), 0, 0, canvas.width, canvas.height);
  }, [sprite, palette]);
  // 64 backing pixels keeps both 16 and 32 px sprites sharp.
  return <canvas ref={ref} width={64} height={64} className={`spriteThumb ${className ?? ''}`} style={{ width: size, height: size }} aria-hidden="true" />;
}
