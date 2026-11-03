import { Copy, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SpriteThumb } from '../components/SpriteThumb';
import { LIMITS, type AnimatedImage, type Facing } from '../models/project';
import { frameCount, frameOf } from './spriteOps';

interface Props {
  /** The view being drawn. */
  image: AnimatedImage;
  facing: Facing;
  /** Views the sprite can have in this game (side-view games never show the back), and which it has. */
  views: Array<{ facing: Facing; made: boolean }>;
  onFacing(facing: Facing): void;
  palette: readonly string[];
  frame: number;
  onSelect(index: number): void;
  onCopy(): void;
  onRemove(): void;
  onAuto(): void;
}

/** How fast the preview plays (the game uses the same speed for walking). */
export const PREVIEW_FPS = 8;

export const FACING_LABELS: Record<Facing, string> = { front: 'Front', back: 'Back', side: 'Side' };

/** The animation of the sprite being drawn: a playing preview, its frames, and buttons to make more. */
export function FramesBar({ image, facing, views, onFacing, palette, frame, onSelect, onCopy, onRemove, onAuto }: Props) {
  const count = frameCount(image);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (count < 2) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000 / PREVIEW_FPS);
    return () => window.clearInterval(id);
  }, [count]);

  return (
    <div className="framesBar" aria-label="Animation frames">
      <div className="facingTabs" role="radiogroup" aria-label="Seen from">
        {views.map((v) => (
          <button
            key={v.facing}
            type="button"
            role="radio"
            aria-checked={v.facing === facing}
            className={`${v.facing === facing ? 'on' : ''} ${v.made ? '' : 'new'}`}
            title={v.made ? `Draw the ${v.facing}` : `Add a ${v.facing} view (starts as a copy of the front)`}
            onClick={() => onFacing(v.facing)}
          >
            {v.made ? '' : '+'}
            {FACING_LABELS[v.facing]}
          </button>
        ))}
      </div>
      <div className="framePreview" title={count > 1 ? 'Playing the animation' : 'Add frames to make it move'}>
        <SpriteThumb sprite={frameOf(image, count > 1 ? tick % count : 0)} palette={palette} size={32} />
      </div>
      <div className="frameList" role="radiogroup" aria-label="Frame to draw">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={i === frame}
            aria-label={`Frame ${i + 1}`}
            className={i === frame ? 'on' : ''}
            onClick={() => onSelect(i)}
          >
            <SpriteThumb sprite={frameOf(image, i)} palette={palette} size={20} />
            <small>{i + 1}</small>
          </button>
        ))}
      </div>
      <button type="button" className="frameBtn" onClick={onCopy} disabled={count >= LIMITS.framesMax} title="Copy this frame to make the next one" aria-label="Copy frame">
        <Copy size={16} aria-hidden="true" /> Copy
      </button>
      {(count > 1 || facing !== 'front') && (
        <button type="button" className="frameBtn" onClick={onRemove} aria-label={count > 1 ? `Remove frame ${frame + 1}` : `Remove the ${facing} view`}>
          <Trash2 size={16} aria-hidden="true" />
        </button>
      )}
      <button type="button" className="frameBtn auto" onClick={onAuto} title="Makes frames from the first one automatically">
        <Sparkles size={16} aria-hidden="true" /> Move
      </button>
    </div>
  );
}
