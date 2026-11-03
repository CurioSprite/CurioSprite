import { migrateLegacyProject } from '../models/serialization';
import { ProjectExistsError, type ProjectRepository } from './repository';

/** localStorage key used by CurioSprite 0.1. */
export const LEGACY_STORAGE_KEY = 'curiosprite-projects-v01';
const MIGRATED_FLAG = 'curiosprite-legacy-migrated';

/**
 * Copies CurioSprite 0.1 projects from localStorage into the repository once.
 * The original localStorage data is left untouched as a backup.
 * Returns the number of projects imported.
 */
export async function migrateLegacyStorage(repo: ProjectRepository, storage: Storage | undefined = globalThis.localStorage): Promise<number> {
  if (!storage) return 0;
  let raw: string | null;
  try {
    if (storage.getItem(MIGRATED_FLAG)) return 0;
    raw = storage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return 0;
  }
  let count = 0;
  if (raw) {
    let list: unknown;
    try {
      list = JSON.parse(raw);
    } catch {
      list = [];
    }
    for (const item of Array.isArray(list) ? list : []) {
      const result = migrateLegacyProject(item);
      if (!result.ok) continue;
      try {
        await repo.create(result.project);
        count++;
      } catch (e) {
        if (!(e instanceof ProjectExistsError)) throw e;
      }
    }
  }
  if (!repo.volatile) storage.setItem(MIGRATED_FLAG, new Date().toISOString());
  return count;
}
