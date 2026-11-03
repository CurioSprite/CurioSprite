import { Check, Save } from 'lucide-react';

/** The one Save for the whole game: sprites, level and settings together. */
export function SaveButton({ dirty, onSave }: { dirty: boolean; onSave(): void }) {
  return (
    <button type="button" className={`btn ${dirty ? 'save' : ''}`} onClick={onSave} disabled={!dirty}>
      {dirty ? <Save size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
      {dirty ? 'Save game' : 'Saved'}
    </button>
  );
}
