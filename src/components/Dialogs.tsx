import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type Tone = 'primary' | 'danger' | 'plain';

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  tone?: Tone;
  /** A smaller line under the label (shown when options have art). */
  hint?: string;
  /** A picture for the option; options with art are shown as cards. */
  art?: ReactNode;
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PromptOptions {
  title: string;
  message?: string;
  initialValue?: string;
  confirmLabel?: string;
  maxLength?: number;
}

interface ChooseOptions<T extends string> {
  title: string;
  message?: string;
  options: ChoiceOption<T>[];
  cancelLabel?: string;
}

export interface DialogApi {
  confirm(options: ConfirmOptions): Promise<boolean>;
  prompt(options: PromptOptions): Promise<string | null>;
  choose<T extends string>(options: ChooseOptions<T>): Promise<T | null>;
  toast(message: string, tone?: 'good' | 'bad'): void;
}

type Request = { id: number } & (
  | { kind: 'prompt'; options: PromptOptions; resolve: (v: string | null) => void }
  | { kind: 'choose'; options: ChooseOptions<string>; resolve: (v: string | null) => void }
);

type NewRequest = Request extends infer R ? (R extends Request ? Omit<R, 'id'> : never) : never;

let nextRequestId = 1;

const DialogContext = createContext<DialogApi | null>(null);

export function useDialogs(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) throw new Error('useDialogs must be used inside <DialogProvider>');
  return api;
}

/** Touch-friendly replacements for window.confirm / prompt (which look out of place on a handheld). */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Request[]>([]);
  const [toastState, setToastState] = useState<{ message: string; tone: 'good' | 'bad'; key: number } | null>(null);

  const push = useCallback((r: NewRequest) => setQueue((q) => [...q, { ...r, id: nextRequestId++ } as Request]), []);

  const api = useMemo<DialogApi>(
    () => ({
      confirm: (o) =>
        new Promise<boolean>((resolve) =>
          push({
            kind: 'choose',
            options: {
              title: o.title,
              message: o.message,
              cancelLabel: o.cancelLabel ?? 'Cancel',
              options: [{ value: 'ok', label: o.confirmLabel ?? 'OK', tone: o.danger ? 'danger' : 'primary' }],
            },
            resolve: (v) => resolve(v === 'ok'),
          }),
        ),
      prompt: (o) => new Promise((resolve) => push({ kind: 'prompt', options: o, resolve })),
      choose: <T extends string>(o: ChooseOptions<T>) =>
        new Promise<T | null>((resolve) =>
          push({ kind: 'choose', options: o, resolve: (v) => resolve(v as T | null) }),
        ),
      toast: (message, tone = 'good') => setToastState({ message, tone, key: Date.now() }),
    }),
    [push],
  );

  useEffect(() => {
    if (!toastState) return;
    const t = window.setTimeout(() => setToastState(null), 2200);
    return () => window.clearTimeout(t);
  }, [toastState]);

  const current = queue[0];
  const close = (value: string | null) => {
    current?.resolve(value);
    setQueue((q) => q.slice(1));
  };

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current && <DialogView key={current.id} request={current} onClose={close} />}
      {toastState && (
        <div key={toastState.key} className={`toast ${toastState.tone}`} role="status">
          {toastState.message}
        </div>
      )}
    </DialogContext.Provider>
  );
}

function DialogView({ request, onClose }: { request: Request; onClose: (v: string | null) => void }) {
  const [text, setText] = useState(request.kind === 'prompt' ? request.options.initialValue ?? '' : '');
  const firstButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (request.kind === 'choose') firstButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [request, onClose]);

  const { title, message } = request.options;
  // Focus the first safe "primary" option, never a destructive one by default.
  const choices = request.kind === 'choose' ? request.options.options : [];
  const primaryIndex = choices.findIndex((o) => (o.tone ?? 'primary') === 'primary');
  const defaultIndex = primaryIndex >= 0 ? primaryIndex : choices.findIndex((o) => o.tone !== 'danger');
  const cards = choices.some((o) => o.art);
  return (
    <div className="dialogBackdrop">
      <div className={`dialog ${cards ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title">{title}</h2>
        {message && <p>{message}</p>}
        {request.kind === 'prompt' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = text.trim();
              if (value) onClose(value);
            }}
          >
            <input
              autoFocus
              value={text}
              maxLength={request.options.maxLength}
              onChange={(e) => setText(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              aria-label={title}
            />
            <div className="dialogButtons">
              <button type="button" className="btn" data-nav-back onClick={() => onClose(null)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={!text.trim()}>
                {request.options.confirmLabel ?? 'OK'}
              </button>
            </div>
          </form>
        ) : (
          <div
            className={`dialogButtons ${
              cards
                ? 'cards'
                : `${request.options.options.length > 2 ? 'list' : ''} ${
                    // Long choices get a full-width row each.
                    request.options.options.some((o) => o.label.length > 22) ? 'long' : ''
                  }`
            }`}
          >
            <button type="button" className="btn" data-nav-back onClick={() => onClose(null)}>
              {request.options.cancelLabel ?? 'Cancel'}
            </button>
            {request.options.options.map((o, i) => (
              <button
                key={o.value}
                ref={i === defaultIndex ? firstButton : undefined}
                type="button"
                className={cards ? 'choiceCard' : `btn ${o.tone ?? 'primary'}`}
                onClick={() => onClose(o.value)}
              >
                {cards ? (
                  <>
                    {o.art}
                    <strong>{o.label}</strong>
                    {o.hint && <span>{o.hint}</span>}
                  </>
                ) : (
                  o.label
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
