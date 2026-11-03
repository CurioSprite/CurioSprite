import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface ObjectMenuItem {
  label: string;
  icon: ReactNode;
  onSelect(): void;
  danger?: boolean;
}

interface Props {
  /** Where the tapped square is on screen (its centre), in CSS pixels. */
  x: number;
  y: number;
  /** The square's size on screen, so the menu sits beside it rather than on top. */
  size: number;
  title: string;
  icon?: ReactNode;
  note?: string;
  items: ObjectMenuItem[];
  onClose(): void;
}

const GAP = 6;

/** A small menu that pops up next to something tapped in the level. */
export function ObjectMenu({ x, y, size, title, icon, note, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y, ready: false });

  // Beside the square: to the right if it fits, otherwise to the left; kept on screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const right = x + size / 2 + GAP;
    const left = right + w <= window.innerWidth - 8 ? right : Math.max(8, x - size / 2 - GAP - w);
    const top = Math.max(8, Math.min(window.innerHeight - h - 8, y - h / 2));
    setPos({ left, top, ready: true });
  }, [x, y, size]);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.dialogBackdrop')) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="objectMenuBackdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className="objectMenu"
        role="menu"
        aria-label={title}
        style={{ left: pos.left, top: pos.top, visibility: pos.ready ? 'visible' : 'hidden' }}
      >
        <header>
          {icon}
          <strong>{title}</strong>
        </header>
        {note && <p>{note}</p>}
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className={item.danger ? 'danger' : ''}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
