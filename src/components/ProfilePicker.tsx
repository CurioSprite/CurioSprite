import { Check, MoreHorizontal, UserPlus, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_PALETTE } from '../models/palette';
import { heroImage, type Profile } from '../models/profile';
import { LIMITS } from '../models/project';
import type { HeroLook } from '../models/heroMaker';
import { useDialogs } from './Dialogs';
import { HeroMaker } from './HeroMaker';
import { SpriteThumb } from './SpriteThumb';

/** A profile's hero, drawn small. */
export function ProfilePortrait({ profile, size = 48 }: { profile: Profile; size?: number }) {
  const { image, palette } = useMemo(() => heroImage(profile, []), [profile]);
  return <SpriteThumb sprite={image} palette={palette} size={size} />;
}

interface Props {
  profiles: Profile[];
  currentId: string | null;
  onSelect(id: string | null): void;
  onCreate(name: string, look: HeroLook): void;
  onRename(id: string, name: string): void;
  onChangeLook(id: string, look: HeroLook): void;
  onRemove(id: string): void;
  onClose(): void;
}

/** "Who's playing?": pick your profile, or make one (name + hero). */
export function ProfilePicker({ profiles, currentId, onSelect, onCreate, onRename, onChangeLook, onRemove, onClose }: Props) {
  const dialogs = useDialogs();
  /** Making a hero: for a new player (null id) or an existing one. */
  const [making, setMaking] = useState<{ id: string | null; name: string; look?: HeroLook } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !making && !document.querySelector('.dialogBackdrop')) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, making]);

  const newPlayer = async () => {
    const name = await dialogs.prompt({ title: 'What is your name?', confirmLabel: 'Next: make my hero', maxLength: LIMITS.nameMaxLength });
    if (name?.trim()) setMaking({ id: null, name: name.trim() });
  };

  const more = async (p: Profile) => {
    const choice = await dialogs.choose({
      title: p.name,
      cancelLabel: 'Close',
      options: [
        { value: 'hero', label: 'Change my hero', tone: 'primary' },
        { value: 'rename', label: 'Rename', tone: 'plain' },
        { value: 'delete', label: 'Delete this player', tone: 'danger' },
      ],
    });
    if (choice === 'hero') setMaking({ id: p.id, name: p.name, look: p.look });
    if (choice === 'rename') {
      const name = await dialogs.prompt({ title: 'Rename player', initialValue: p.name, confirmLabel: 'Rename', maxLength: LIMITS.nameMaxLength });
      if (name?.trim()) onRename(p.id, name.trim());
    }
    if (choice === 'delete') {
      const ok = await dialogs.confirm({
        title: `Delete ${p.name}?`,
        message: 'Their hero goes too. Games they made stay.',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (ok) onRemove(p.id);
    }
  };

  if (making) {
    return (
      <HeroMaker
        initialLook={making.look}
        palette={DEFAULT_PALETTE}
        heroName={making.name}
        useMessage="This hero is yours: every new game you make starts with it."
        onUse={(look, _mode, name) => {
          if (making.id) {
            onChangeLook(making.id, look);
            if (name !== making.name) onRename(making.id, name);
            setMaking(null);
          } else {
            // A new player starts playing straight away.
            onCreate(name, look);
            onClose();
          }
        }}
        onClose={() => setMaking(null)}
      />
    );
  }

  return (
    <div className="rulesSheet profilePicker" role="dialog" aria-modal="true" aria-labelledby="players-title">
      <header className="rulesHeader">
        <Users size={22} aria-hidden="true" />
        <div>
          <h2 id="players-title">Who’s playing?</h2>
          <p>Each player has their own hero. New games start with it.</p>
        </div>
        <button type="button" className="btn primary" onClick={onClose}>
          <Check size={18} aria-hidden="true" /> Done
        </button>
      </header>

      <div className="profileGrid">
        {profiles.map((p) => (
          <div key={p.id} className={`profileCard ${p.id === currentId ? 'on' : ''}`}>
            <button
              type="button"
              className="profilePick"
              aria-pressed={p.id === currentId}
              onClick={() => {
                onSelect(p.id);
                onClose();
              }}
            >
              <ProfilePortrait profile={p} size={88} />
              <strong>{p.name}</strong>
              {p.id === currentId && <small>Playing now</small>}
            </button>
            <button type="button" className="spriteMenuBtn" aria-label={`More for ${p.name}`} onClick={() => void more(p)}>
              <MoreHorizontal size={18} />
            </button>
          </div>
        ))}
        <button type="button" className="profileCard newPlayer" onClick={() => void newPlayer()}>
          <UserPlus size={40} aria-hidden="true" />
          <strong>New player</strong>
        </button>
      </div>
      {currentId && (
        <button type="button" className="btn small noPlayer" onClick={() => onSelect(null)}>
          Nobody (use the starter hero)
        </button>
      )}
    </div>
  );
}
