import { useId, useLayoutEffect, useRef } from 'react';
import { BRAND, LOGO_GRADIENT, LOGO_GRADIENT_SPAN, LOGO_VIEWBOX, logoPixels } from '../graphics/logoMark';

const PIXELS = logoPixels();

export function LogoMark({ size = 48 }: { size?: number }) {
  const gradientId = useId();
  const g = LOGO_GRADIENT_SPAN;
  return (
    <svg className="logoMark" width={size} height={size} viewBox={LOGO_VIEWBOX} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
          {LOGO_GRADIENT.map((c, i) => (
            <stop key={c} offset={i / (LOGO_GRADIENT.length - 1)} stopColor={c} />
          ))}
        </linearGradient>
      </defs>
      {PIXELS.map((p) => (
        <rect key={`${p.x},${p.y}`} x={p.x} y={p.y} width={p.size} height={p.size} rx={0.12} fill={p.fill ?? `url(#${gradientId})`} />
      ))}
    </svg>
  );
}

/** "Curio" in white, "Sprite" letter-by-letter in the brand colours. */
export function Wordmark() {
  return (
    <span className="wordmark" aria-label="CurioSprite">
      <span aria-hidden="true">Curio</span>
      {[...'Sprite'].map((ch, i) => (
        <span key={i} aria-hidden="true" style={{ color: BRAND.sprite[i] }}>
          {ch}
        </span>
      ))}
    </span>
  );
}

export function Tagline() {
  return (
    <p className="tagline">
      {BRAND.tagline.map(({ word, color }) => (
        <span key={word} style={{ color }}>
          {word}
        </span>
      ))}
    </p>
  );
}

/**
 * Wordmark stacked over the tagline, with the wordmark's font size fitted so
 * both lines are exactly the same width.
 */
export function BrandLockup() {
  const titleRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const title = titleRef.current;
    const tag = tagRef.current;
    if (!title || !tag) return;
    const fit = () => {
      const target = tag.getBoundingClientRect().width;
      title.style.fontSize = '100px';
      const natural = title.getBoundingClientRect().width;
      if (natural > 0 && target > 0) title.style.fontSize = `${(100 * target) / natural}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(tag);
    void document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="brandLockup">
      <div ref={titleRef} className="brandTitle">
        <Wordmark />
      </div>
      <div ref={tagRef} className="brandTagline">
        <Tagline />
      </div>
    </div>
  );
}
