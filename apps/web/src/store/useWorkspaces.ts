import { useCallback, useEffect, useRef, useState } from 'react';
import { listWorkspaces, mergeWorkspaces } from './registry';
import type { Workspace } from './types';

export function useWorkspaces() {
  const [spaces, setSpaces] = useState<Workspace[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);

  const reload = useCallback(async () => {
    const at = ++revision.current;
    try {
      const loaded = await listWorkspaces();
      if (at === revision.current) setSpaces(loaded);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const replace = useCallback((workspace: Workspace) => {
    revision.current += 1;
    setSpaces((all) => mergeWorkspaces([
      ...all.filter((w) => w.origin !== 'demo' && w.id !== workspace.id),
      workspace,
    ]));
  }, []);

  return { spaces, ready, error, reload, replace };
}
