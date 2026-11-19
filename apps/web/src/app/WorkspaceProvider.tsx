import { createContext, useContext, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Workspace } from '../store/types';
import { useWorkspaces } from '../store/useWorkspaces';

interface WorkspaceContextValue extends ReturnType<typeof useWorkspaces> {
  requestedId: string | null;
  workspace: Workspace | undefined;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [params] = useSearchParams();
  const requestedId = params.get('ws');
  const state = useWorkspaces();
  const workspace = requestedId ? state.spaces.find((w) => w.id === requestedId) : undefined;

  return (
    <WorkspaceContext.Provider value={{ ...state, requestedId, workspace }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace 必须在 WorkspaceProvider 内使用');
  return context;
}
