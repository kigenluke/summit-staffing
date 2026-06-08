import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuthStore } from '../store/authStore.js';
import { api } from '../services/api.js';
import {
  getComplianceProgress,
  getExpiredComplianceDocuments,
  REQUIRED_WORKER_COMPLIANCE_DOCS,
  REQUIRED_PARTICIPANT_COMPLIANCE_DOCS,
  DOC_TYPE_LABELS,
} from '../utils/complianceProgress.js';

/**
 * accessPhase:
 * - loading
 * - needs_documents (required docs not all uploaded)
 * - ready_to_submit (all uploaded, not yet submitted)
 * - pending_verification (submitted, awaiting admin)
 * - documents_expired (one or more required docs past expiry)
 * - verified
 */
const AccountAccessContext = createContext({
  restricted: false,
  accessChecking: false,
  loaded: false,
  accessPhase: 'loading',
  expiredDocuments: [],
  refresh: async () => {},
  syncFromWorkerProfile: () => {},
  syncFromParticipantProfile: () => {},
});

function derivePhase({ progress, verified, submitted, expiredDocuments }) {
  if (expiredDocuments?.length > 0) return 'documents_expired';
  if (!progress?.allUploaded) return 'needs_documents';
  if (!submitted) return 'ready_to_submit';
  if (!verified) return 'pending_verification';
  return 'verified';
}

export function WorkerGateProvider({ children }) {
  const { user } = useAuthStore();
  const isWorker = user?.role === 'worker';
  const isParticipant = user?.role === 'participant';
  // Participants are not gated by compliance documents — only workers need uploads.
  const isGatedRole = isWorker;

  const [state, setState] = useState({
    loaded: false,
    progress: null,
    verified: false,
    submitted: false,
    expiredDocuments: [],
    accessPhase: 'loading',
  });

  const applyFromProfile = useCallback((profile, documents, requiredTypes) => {
    const progress = getComplianceProgress(documents, requiredTypes);
    const expiredDocuments = getExpiredComplianceDocuments(documents, requiredTypes, DOC_TYPE_LABELS);
    const verified = profile?.verification_status === 'verified';
    const submitted = Boolean(profile?.verification_submitted_at);
    const accessPhase = derivePhase({ progress, verified, submitted, expiredDocuments });
    setState({
      loaded: true,
      progress,
      verified,
      submitted,
      expiredDocuments,
      accessPhase,
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!isGatedRole) {
      setState({
        loaded: true,
        progress: { allUploaded: true, uploadedCount: 0, total: 0, missing: [] },
        verified: true,
        submitted: true,
        expiredDocuments: [],
        accessPhase: 'verified',
      });
      return;
    }

    try {
      if (isWorker) {
        const { data } = await api.get('/api/workers/me');
        if (data?.ok && data?.worker) {
          applyFromProfile(data.worker, data.documents || [], REQUIRED_WORKER_COMPLIANCE_DOCS);
        } else {
          setState({ loaded: true, progress: null, verified: false, submitted: false, expiredDocuments: [], accessPhase: 'needs_documents' });
        }
        return;
      }

      // Participant compliance gating removed — nothing to load here.
    } catch {
      setState({ loaded: true, progress: null, verified: false, submitted: false, expiredDocuments: [], accessPhase: 'needs_documents' });
    }
  }, [isGatedRole, isWorker, isParticipant, applyFromProfile]);

  const syncFromWorkerProfile = useCallback((profile, documents = []) => {
    if (!isWorker || !profile) return;
    applyFromProfile(profile, documents, REQUIRED_WORKER_COMPLIANCE_DOCS);
  }, [isWorker, applyFromProfile]);

  // Participant compliance is not gated anymore; keep a no-op so existing callers don't crash.
  const syncFromParticipantProfile = useCallback(() => {}, []);

  useEffect(() => {
    refresh();
  }, [refresh, user?.id]);

  // Block immediately for workers/participants until we confirm they are verified (no click window after login).
  const restricted = isGatedRole && (!state.loaded || state.accessPhase !== 'verified');
  const accessChecking = isGatedRole && !state.loaded;

  return (
    <AccountAccessContext.Provider
      value={{
        restricted,
        accessChecking,
        loaded: state.loaded,
        accessPhase: state.accessPhase,
        progress: state.progress,
        expiredDocuments: state.expiredDocuments,
        refresh,
        syncFromWorkerProfile,
        syncFromParticipantProfile,
      }}
    >
      {children}
    </AccountAccessContext.Provider>
  );
}

export function useWorkerGate() {
  return useContext(AccountAccessContext);
}

export function useAccountAccess() {
  return useContext(AccountAccessContext);
}
