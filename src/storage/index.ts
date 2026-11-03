import { IndexedDbProjectRepository } from './indexedDbRepository';
import { migrateLegacyStorage } from './legacyMigration';
import { MemoryProjectRepository, type ProjectRepository } from './repository';

export * from './repository';

/**
 * Opens persistent storage, falling back to memory (with `volatile = true`)
 * when IndexedDB is unavailable, e.g. in some private-browsing modes.
 */
export async function openRepository(): Promise<ProjectRepository> {
  let repo: ProjectRepository;
  try {
    repo = await IndexedDbProjectRepository.open();
  } catch (e) {
    console.warn('CurioSprite: IndexedDB unavailable, projects will not persist', e);
    repo = new MemoryProjectRepository();
  }
  try {
    await migrateLegacyStorage(repo);
  } catch (e) {
    console.warn('CurioSprite: could not import 0.1 projects', e);
  }
  return repo;
}
