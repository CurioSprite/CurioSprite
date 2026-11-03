import { parseProject } from '../models/serialization';
import { readProfile, type Profile } from '../models/profile';
import { APP_VERSION, type Project } from '../models/project';

export type ProjectListEntry =
  | { status: 'ok'; project: Project }
  | { status: 'damaged'; id: string; name: string; errors: string[] };

export class ProjectConflictError extends Error {
  constructor(public readonly latest: Project | null) {
    super(latest ? 'This game was changed somewhere else since it was opened.' : 'This game no longer exists.');
    this.name = 'ProjectConflictError';
  }
}

export class ProjectExistsError extends Error {
  constructor(id: string) {
    super(`A project with id ${id} already exists`);
    this.name = 'ProjectExistsError';
  }
}

export interface ProjectRepository {
  /** All stored projects, newest first. Damaged records are reported, never dropped. */
  list(): Promise<ProjectListEntry[]>;
  get(id: string): Promise<ProjectListEntry | null>;
  /** Inserts a new project. Fails rather than replacing an existing id. */
  create(project: Project): Promise<Project>;
  /**
   * Saves changes. `project.revision` must match the stored revision, which
   * guarantees an out-of-date copy can never overwrite newer data.
   * Resolves with the stored project (revision + 1, fresh `updatedAt`).
   */
  save(project: Project): Promise<Project>;
  remove(id: string): Promise<void>;
  /** Player profiles (who is playing, and their hero). Damaged records are skipped. */
  listProfiles(): Promise<Profile[]>;
  /** Inserts or replaces a profile. */
  saveProfile(profile: Profile): Promise<void>;
  removeProfile(id: string): Promise<void>;
  /** True when data only lives in memory (e.g. IndexedDB unavailable). */
  readonly volatile: boolean;
}

/** Turns a raw stored record into a list entry. */
export function toListEntry(raw: unknown): ProjectListEntry {
  const parsed = parseProject(raw);
  if (parsed.ok) return { status: 'ok', project: parsed.project };
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const meta = (typeof obj.meta === 'object' && obj.meta !== null ? obj.meta : {}) as Record<string, unknown>;
  const name = typeof meta.name === 'string' ? meta.name : typeof obj.name === 'string' ? obj.name : 'Unknown game';
  return { status: 'damaged', id: typeof obj.id === 'string' ? obj.id : '', name, errors: parsed.errors };
}

/**
 * The revision check shared by every repository implementation.
 * Throws ProjectConflictError when `incoming` is stale.
 */
export function prepareSave(stored: unknown, incoming: Project, now: Date = new Date()): Project {
  if (stored === undefined || stored === null) throw new ProjectConflictError(null);
  const entry = toListEntry(stored);
  const storedRevision =
    typeof (stored as { revision?: unknown }).revision === 'number' ? (stored as { revision: number }).revision : -1;
  if (storedRevision !== incoming.revision) {
    throw new ProjectConflictError(entry.status === 'ok' ? entry.project : null);
  }
  return {
    ...incoming,
    revision: incoming.revision + 1,
    meta: { ...incoming.meta, updatedAt: now.toISOString(), appVersion: APP_VERSION },
  };
}

export function sortEntries(entries: ProjectListEntry[]): ProjectListEntry[] {
  const key = (e: ProjectListEntry) => (e.status === 'ok' ? e.project.meta.updatedAt : '');
  return entries.sort((a, b) => key(b).localeCompare(key(a)));
}

/** Valid profiles, oldest first (so each player's place in the list stays put). */
export function sortProfiles(profiles: Array<Profile | null>): Profile[] {
  return profiles.filter((p): p is Profile => p !== null).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Non-persistent repository: used in tests and when IndexedDB is unavailable. */
export class MemoryProjectRepository implements ProjectRepository {
  readonly volatile = true;
  private records = new Map<string, unknown>();

  async list(): Promise<ProjectListEntry[]> {
    return sortEntries([...this.records.values()].map((r) => toListEntry(clone(r))));
  }

  async get(id: string): Promise<ProjectListEntry | null> {
    const r = this.records.get(id);
    return r === undefined ? null : toListEntry(clone(r));
  }

  async create(project: Project): Promise<Project> {
    if (this.records.has(project.id)) throw new ProjectExistsError(project.id);
    this.records.set(project.id, clone(project));
    return clone(project);
  }

  async save(project: Project): Promise<Project> {
    const next = prepareSave(this.records.get(project.id), project);
    this.records.set(project.id, clone(next));
    return clone(next);
  }

  async remove(id: string): Promise<void> {
    this.records.delete(id);
  }

  private profiles = new Map<string, unknown>();

  async listProfiles(): Promise<Profile[]> {
    return sortProfiles([...this.profiles.values()].map((p) => readProfile(clone(p))));
  }

  async saveProfile(profile: Profile): Promise<void> {
    this.profiles.set(profile.id, clone(profile));
  }

  async removeProfile(id: string): Promise<void> {
    this.profiles.delete(id);
  }

  /** Test helper: store arbitrary (possibly corrupt) data. */
  putRaw(id: string, raw: unknown): void {
    this.records.set(id, raw);
  }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
