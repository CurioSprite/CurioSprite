import { Gamepad2, Paintbrush, UserRound } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { BrandLockup, LogoMark } from '../components/Logo';
import { ProfilePortrait } from '../components/ProfilePicker';
import type { Profile } from '../models/profile';

interface Props {
  gameCount: number | null;
  onCreate(): void;
  onPlay(): void;
  /** Who is playing (null: nobody chosen yet). */
  player: Profile | null;
  onChoosePlayer(): void;
}

export function HomeScreen({ gameCount, onCreate, onPlay, player, onChoosePlayer }: Props) {
  const createRef = useRef<HTMLButtonElement>(null);
  useEffect(() => createRef.current?.focus({ preventScroll: true }), []);

  return (
    <main className="screen home">
      <button type="button" className="playerChip" onClick={onChoosePlayer} aria-label={player ? `Playing as ${player.name}. Change player` : 'Who’s playing?'}>
        {player ? <ProfilePortrait profile={player} size={36} /> : <UserRound size={24} aria-hidden="true" />}
        <span>{player ? player.name : 'Who’s playing?'}</span>
      </button>
      <div className="homeBrand">
        <LogoMark size={72} />
        <BrandLockup />
      </div>

      <div className="homeTiles">
        <button ref={createRef} type="button" className="homeTile create" onClick={onCreate}>
          <Paintbrush size={44} aria-hidden="true" />
          <strong>Create</strong>
          <small>Make a new game, draw sprites, change how it plays</small>
        </button>
        <button type="button" className="homeTile play" onClick={onPlay}>
          <Gamepad2 size={44} aria-hidden="true" />
          <strong>Play</strong>
          <small>
            {gameCount === null ? 'Loading games…' : gameCount === 1 ? '1 game ready to play' : `${gameCount} games ready to play`}
          </small>
        </button>
      </div>

      <p className="homeQuest">
        What <em>Quest</em> will you create?
      </p>
    </main>
  );
}
