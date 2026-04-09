/**
 * Summit Staffing – Participant sign-up onboarding state
 * Holds answers from the multi-step client sign-up flow (who, when, over18, funding, location).
 */
import React, { createContext, useContext, useState, useCallback } from 'react';

const ParticipantSignUpContext = createContext(null);

export function useParticipantSignUp() {
  const ctx = useContext(ParticipantSignUpContext);
  if (!ctx) throw new Error('useParticipantSignUp must be used within ParticipantSignUpProvider');
  return ctx;
}

const initialState = {
  whoNeedsSupport: null,   // 'me' | 'assisting' | 'coordinator'
  whenStartLooking: null, // 'within_4_weeks' | 'after_4_weeks'
  over18: null,            // true | false
  fundingType: null,       // 'ndis' | 'support_at_home' | 'waiting' | 'private' | 'other'
  location: null,          // { address, latitude?, longitude? }
};

export function ParticipantSignUpProvider({ children }) {
  const [state, setState] = useState(initialState);

  const setWhoNeedsSupport = useCallback((value) => {
    setState((s) => ({ ...s, whoNeedsSupport: value }));
  }, []);
  const setWhenStartLooking = useCallback((value) => {
    setState((s) => ({ ...s, whenStartLooking: value }));
  }, []);
  const setOver18 = useCallback((value) => {
    setState((s) => ({ ...s, over18: value }));
  }, []);
  const setFundingType = useCallback((value) => {
    setState((s) => ({ ...s, fundingType: value }));
  }, []);
  const setLocation = useCallback((value) => {
    setState((s) => ({ ...s, location: value }));
  }, []);

  const reset = useCallback(() => setState(initialState), []);

  const value = {
    ...state,
    setWhoNeedsSupport,
    setWhenStartLooking,
    setOver18,
    setFundingType,
    setLocation,
    reset,
  };

  return (
    <ParticipantSignUpContext.Provider value={value}>
      {children}
    </ParticipantSignUpContext.Provider>
  );
}
