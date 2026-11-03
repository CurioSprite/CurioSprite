import { useCallback, useEffect, useState } from 'react';
import type { HeroLook } from '../models/heroMaker';
import { createProfile, renameProfile, setProfileHeroFromSprite, setProfileLook, type Profile } from '../models/profile';
import type { SpriteImage } from '../models/project';
import type { ProjectRepository } from './repository';

/** Which player is using this device, remembered between visits (a convenience only). */
const CURRENT_KEY = 'curiosprite-player';

function readCurrent(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}

function writeCurrent(id: string | null): void {
  try {
    if (id) localStorage.setItem(CURRENT_KEY, id);
    else localStorage.removeItem(CURRENT_KEY);
  } catch {
    // Private mode or blocked storage: the choice just isn't remembered.
  }
}

/** Player profiles, stored with the games, and who is playing now. */
export function usePlayers(repo: ProjectRepository | null) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(readCurrent);

  const reload = useCallback(async () => {
    if (!repo) return;
    const list = await repo.listProfiles();
    setProfiles(list);
    // A remembered player that no longer exists is forgotten.
    setCurrentId((id) => (id && !list.some((p) => p.id === id) ? null : id));
  }, [repo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const select = useCallback((id: string | null) => {
    setCurrentId(id);
    writeCurrent(id);
  }, []);

  const store = useCallback(
    async (profile: Profile) => {
      if (!repo) return;
      await repo.saveProfile(profile);
      await reload();
    },
    [repo, reload],
  );

  const find = (id: string) => profiles.find((p) => p.id === id);

  return {
    profiles,
    currentId,
    current: profiles.find((p) => p.id === currentId) ?? null,
    select,
    create: async (name: string, look: HeroLook) => {
      const profile = createProfile(name, look);
      await store(profile);
      select(profile.id);
      return profile;
    },
    rename: async (id: string, name: string) => {
      const p = find(id);
      if (p) await store(renameProfile(p, name));
    },
    changeLook: async (id: string, look: HeroLook) => {
      const p = find(id);
      if (p) await store(setProfileLook(p, look));
    },
    /** Keeps a hero exactly as drawn in a game. */
    saveHero: async (id: string, sprite: SpriteImage, palette: readonly string[], look?: HeroLook) => {
      const p = find(id);
      if (p) await store(setProfileHeroFromSprite(p, sprite, palette, look));
    },
    remove: async (id: string) => {
      if (!repo) return;
      await repo.removeProfile(id);
      if (id === currentId) select(null);
      await reload();
    },
  };
}
