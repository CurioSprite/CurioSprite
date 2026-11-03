import { describe, expect, it } from 'vitest';
import { createProject } from '../models/defaults';
import { migrateLegacyStorage, LEGACY_STORAGE_KEY } from './legacyMigration';
import { MemoryProjectRepository, ProjectConflictError, ProjectExistsError } from './repository';

describe('MemoryProjectRepository', () => {
  it('creates, saves and reloads a project', async () => {
    const repo = new MemoryProjectRepository();
    const p = await repo.create(createProject('Saved Game'));
    p.sprites[0].pixels[0] = 4;
    const saved = await repo.save(p);
    expect(saved.revision).toBe(1);
    const loaded = await repo.get(p.id);
    expect(loaded?.status).toBe('ok');
    if (loaded?.status === 'ok') expect(loaded.project.sprites[0].pixels[0]).toBe(4);
  });

  it('never replaces an existing id on create', async () => {
    const repo = new MemoryProjectRepository();
    const p = await repo.create(createProject('One'));
    await expect(repo.create(p)).rejects.toBeInstanceOf(ProjectExistsError);
  });

  it('refuses to save a stale copy over newer data', async () => {
    const repo = new MemoryProjectRepository();
    const p = await repo.create(createProject('Shared'));
    const tabA = structuredClone(p);
    const tabB = structuredClone(p);
    await repo.save({ ...tabA, meta: { ...tabA.meta, name: 'A' } });
    await expect(repo.save({ ...tabB, meta: { ...tabB.meta, name: 'B' } })).rejects.toBeInstanceOf(ProjectConflictError);
    const stored = await repo.get(p.id);
    expect(stored?.status === 'ok' && stored.project.meta.name).toBe('A');
  });

  it('refuses to save a project that was deleted', async () => {
    const repo = new MemoryProjectRepository();
    const p = await repo.create(createProject('Gone'));
    await repo.remove(p.id);
    await expect(repo.save(p)).rejects.toBeInstanceOf(ProjectConflictError);
  });

  it('lists damaged records instead of dropping them', async () => {
    const repo = new MemoryProjectRepository();
    await repo.create(createProject('Good'));
    repo.putRaw('bad', { id: 'bad', schemaVersion: 2, meta: { name: 'Broken' }, sprites: 'nope' });
    const list = await repo.list();
    expect(list).toHaveLength(2);
    const damaged = list.find((e) => e.status === 'damaged');
    expect(damaged).toMatchObject({ status: 'damaged', id: 'bad', name: 'Broken' });
  });
});

describe('legacy localStorage migration', () => {
  class FakeStorage {
    data = new Map<string, string>();
    getItem = (k: string) => this.data.get(k) ?? null;
    setItem = (k: string, v: string) => void this.data.set(k, v);
  }

  it('imports 0.1 projects once and keeps the original data', async () => {
    const storage = new FakeStorage();
    const legacy = JSON.stringify([{ id: 'old1', name: 'Old', createdAt: 1, sprites: [{ id: 's', name: 'Hero', pixels: Array(256).fill('#ffffff') }] }]);
    storage.data.set(LEGACY_STORAGE_KEY, legacy);
    const repo = new MemoryProjectRepository();
    // Memory repos are volatile, so pretend this one persists for the flag logic.
    Object.defineProperty(repo, 'volatile', { value: false });

    expect(await migrateLegacyStorage(repo, storage as unknown as Storage)).toBe(1);
    expect(await migrateLegacyStorage(repo, storage as unknown as Storage)).toBe(0);
    expect(storage.data.get(LEGACY_STORAGE_KEY)).toBe(legacy);
    expect((await repo.list())[0]).toMatchObject({ status: 'ok', project: { id: 'old1' } });
  });
});
