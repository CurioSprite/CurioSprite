import { readProfile, type Profile } from '../models/profile';
import type { Project } from '../models/project';
import {
  ProjectExistsError,
  prepareSave,
  sortEntries,
  sortProfiles,
  toListEntry,
  type ProjectListEntry,
  type ProjectRepository,
} from './repository';

const DB_NAME = 'curiosprite';
// v2 added the profiles store; projects are untouched by the upgrade.
const DB_VERSION = 2;
const STORE = 'projects';
const PROFILES = 'profiles';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(PROFILES)) db.createObjectStore(PROFILES, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open IndexedDB'));
    req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
  });
}

export class IndexedDbProjectRepository implements ProjectRepository {
  readonly volatile = false;

  private constructor(private readonly db: IDBDatabase) {}

  static async open(): Promise<IndexedDbProjectRepository> {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available');
    return new IndexedDbProjectRepository(await openDatabase());
  }

  async list(): Promise<ProjectListEntry[]> {
    const tx = this.db.transaction(STORE, 'readonly');
    const raws = await request(tx.objectStore(STORE).getAll());
    return sortEntries(raws.map(toListEntry));
  }

  async get(id: string): Promise<ProjectListEntry | null> {
    const tx = this.db.transaction(STORE, 'readonly');
    const raw: unknown = await request(tx.objectStore(STORE).get(id));
    return raw === undefined ? null : toListEntry(raw);
  }

  async create(project: Project): Promise<Project> {
    const tx = this.db.transaction(STORE, 'readwrite');
    try {
      // `add` (not `put`) fails if the id is already taken.
      await request(tx.objectStore(STORE).add(project));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'ConstraintError') throw new ProjectExistsError(project.id);
      throw e;
    }
    await done(tx);
    return project;
  }

  /** Read-check-write happens inside a single transaction, so it is atomic. */
  save(project: Project): Promise<Project> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      let next: Project | null = null;
      const getReq = store.get(project.id);
      getReq.onsuccess = () => {
        try {
          next = prepareSave(getReq.result, project);
          store.put(next);
        } catch (e) {
          tx.abort();
          reject(e);
        }
      };
      tx.oncomplete = () => (next ? resolve(next) : reject(new Error('Save did not complete')));
      tx.onerror = () => reject(tx.error ?? new Error('Save failed'));
    });
  }

  async remove(id: string): Promise<void> {
    const tx = this.db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    await done(tx);
  }

  async listProfiles(): Promise<Profile[]> {
    const tx = this.db.transaction(PROFILES, 'readonly');
    const raws: unknown[] = await request(tx.objectStore(PROFILES).getAll());
    return sortProfiles(raws.map(readProfile));
  }

  async saveProfile(profile: Profile): Promise<void> {
    const tx = this.db.transaction(PROFILES, 'readwrite');
    tx.objectStore(PROFILES).put(profile);
    await done(tx);
  }

  async removeProfile(id: string): Promise<void> {
    const tx = this.db.transaction(PROFILES, 'readwrite');
    tx.objectStore(PROFILES).delete(id);
    await done(tx);
  }
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}
