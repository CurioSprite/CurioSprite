import { useEffect } from 'react';
import { ACTIONS, emptyActionState, readAllGamepads, type Action } from './bindings';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const REPEAT_DELAY = 0.35;
const REPEAT_RATE = 0.12;

/** The open dialog if any, otherwise the whole document. */
function scope(): ParentNode {
  const dialogs = document.querySelectorAll('[role="dialog"]');
  return dialogs.length ? dialogs[dialogs.length - 1] : document;
}

function moveFocus(delta: number): void {
  const items = Array.from(scope().querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
  if (!items.length) return;
  const index = items.indexOf(document.activeElement as HTMLElement);
  const next = index < 0 ? (delta > 0 ? 0 : items.length - 1) : (index + delta + items.length) % items.length;
  items[next].focus();
  items[next].scrollIntoView({ block: 'nearest' });
}

/** A game (including Test inside an editor) owns the controls while it runs. */
const gameRunning = (): boolean => document.querySelector('[data-game-running]') !== null;

function goBack(): void {
  scope().querySelector<HTMLElement>('[data-nav-back]')?.click();
}

/**
 * Lets menus be driven by a gamepad alone: d-pad / stick moves focus, A
 * activates, B or Home presses the screen's back button. Escape on a keyboard
 * also goes back. Disabled while a game is running (the runtime owns input).
 */
export function useMenuNavigation(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    let previous = emptyActionState();
    let holdTime = 0;
    let nextRepeat = 0;
    let last = performance.now();

    const handle = (action: Action) => {
      if (action === 'up' || action === 'left') moveFocus(-1);
      else if (action === 'down' || action === 'right') moveFocus(1);
      else if (action === 'primary' || action === 'start') (document.activeElement as HTMLElement | null)?.click();
      else if (action === 'secondary' || action === 'home') goBack();
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const dt = (now - last) / 1000;
      last = now;
      const state = readAllGamepads();
      if (gameRunning()) {
        previous = state;
        return;
      }
      for (const a of ACTIONS) if (state[a] && !previous[a]) handle(a);

      // Auto-repeat while a direction is held.
      const dir = (['up', 'down', 'left', 'right'] as const).find((a) => state[a] && previous[a]);
      if (dir) {
        holdTime += dt;
        if (holdTime >= REPEAT_DELAY && holdTime >= nextRepeat) {
          handle(dir);
          nextRepeat = holdTime + REPEAT_RATE;
        }
      } else {
        holdTime = 0;
        nextRepeat = REPEAT_DELAY;
      }
      previous = state;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || gameRunning()) return;
      e.preventDefault();
      goBack();
    };

    frame = requestAnimationFrame(loop);
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
    };
  }, [enabled]);
}
