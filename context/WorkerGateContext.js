import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuthStore } from '../store/authStore.js';
import { api } from '../services/api.js';

const WorkerGateContext = createContext({
  restricted: false,
  loaded: false,
  refresh: async () => {},
  syncFromWorkerProfile: () => {},
});

export function WorkerGateProvider({ children }) {
  const { user } = useAuthStore();
  const isWorker = user?.role === 'worker';
  const [state, setState] = useState({ loaded: false, verified: false });

  const refresh = useCallback(async () => {
    if (!isWorker) {
      setState({ loaded: true, verified: true });
      return;
    }
    try {
      const { data } = await api.get('/api/workers/me');
      const verified = data?.ok && data?.worker?.verification_status === 'verified';
      setState({ loaded: true, verified: !!verified });
    } catch {
      setState({ loaded: true, verified: false });
    }
  }, [isWorker]);

  const syncFromWorkerProfile = useCallback((profile) => {
    if (!isWorker || !profile) return;
    setState({ loaded: true, verified: profile.verification_status === 'verified' });
  }, [isWorker]);

  useEffect(() => {
    refresh();
  }, [refresh, user?.id]);

  const restricted = isWorker && (!state.loaded || !state.verified);

  return (
    <WorkerGateContext.Provider value={{ restricted, loaded: state.loaded, refresh, syncFromWorkerProfile }}>
      {children}
    </WorkerGateContext.Provider>
  );
}

export function useWorkerGate() {
  return useContext(WorkerGateContext);
}
