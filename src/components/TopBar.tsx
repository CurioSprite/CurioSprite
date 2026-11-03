import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  title: ReactNode;
  backLabel?: string;
  onBack?: () => void;
  children?: ReactNode;
  tone?: 'create' | 'play';
}

/** Screen header. The back button is tagged so gamepad B / Escape can find it. */
export function TopBar({ title, backLabel = 'Back', onBack, children, tone }: Props) {
  return (
    <header className={`topBar ${tone ?? ''}`}>
      {onBack && (
        <button type="button" className="btn back" data-nav-back onClick={onBack}>
          <ArrowLeft size={20} aria-hidden="true" />
          <span>{backLabel}</span>
        </button>
      )}
      <h1 className="topTitle">{title}</h1>
      <div className="topActions">{children}</div>
    </header>
  );
}
