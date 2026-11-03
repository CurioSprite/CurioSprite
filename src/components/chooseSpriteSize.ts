import type { SpriteSize } from '../models/project';
import type { DialogApi } from './Dialogs';

/** Asks how big a new sprite should be. Resolves to null if cancelled. */
export async function chooseSpriteSize(dialogs: DialogApi): Promise<SpriteSize | null> {
  const choice = await dialogs.choose({
    title: 'How big is your sprite?',
    message: 'Both fill one block in the game. 32 × 32 has smaller squares for more detail. You can change this later.',
    options: [
      { value: '16', label: '16 × 16 · Simple', tone: 'primary' },
      { value: '32', label: '32 × 32 · Detailed', tone: 'primary' },
    ],
  });
  return choice === null ? null : (Number(choice) as SpriteSize);
}
