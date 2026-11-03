import { useEffect, useMemo, useRef, useState } from 'react';
import { layoutOf } from '../editor/levelOps';
import { createLevelArt, paintLevel, prepareCanvas } from '../graphics/levelPainter';
import type { LevelProject } from '../models/project';

/** The whole level drawn small, start to finish (tall ones fit within `maxHeight`). */
export function LevelPreview({ project, maxHeight }: { project: LevelProject; maxHeight?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const art = useMemo(() => createLevelArt(project), [project]);
  const { level } = project;
  const tilePx = Math.min(width / level.width, maxHeight ? maxHeight / level.height : Infinity);
  const canvasW = Math.round(level.width * tilePx);
  const height = Math.round(level.height * tilePx);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const update = () => setWidth(wrap.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0) return;
    const ctx = prepareCanvas(canvas, canvasW, height);
    if (ctx) paintLevel(ctx, layoutOf(level), art, { tilePx, camX: 0, camY: 0, viewW: canvasW, viewH: height });
  }, [art, level, width, canvasW, height, tilePx]);

  return (
    <div className="levelPreview" ref={wrapRef}>
      <canvas ref={canvasRef} style={{ width: canvasW, height }} aria-label="Level preview" />
    </div>
  );
}
