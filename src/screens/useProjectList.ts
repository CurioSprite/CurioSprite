import { useCallback, useEffect, useState } from 'react';
import type { ProjectListEntry, ProjectRepository } from '../storage';

export function useProjectList(repo: ProjectRepository) {
  const [entries, setEntries] = useState<ProjectListEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setEntries(await repo.list());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load games');
      setEntries([]);
    }
  }, [repo]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { entries, error, reload };
}
