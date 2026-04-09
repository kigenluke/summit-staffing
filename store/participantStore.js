import {create} from 'zustand';

import * as participantService from '../services/participantService';

export const useParticipantStore = create((set, get) => ({
  participant: null,
  isLoading: false,
  error: null,

  fetchParticipant: async (id) => {
    set({isLoading: true, error: null});
    const res = await participantService.getParticipant(id);
    if (!res.success) {
      set({isLoading: false, error: res.error});
      return res;
    }
    set({participant: res.data?.participant || res.data || null, isLoading: false});
    return res;
  },

  updateParticipant: async (id, data) => {
    set({isLoading: true, error: null});
    const res = await participantService.updateParticipant(id, data);
    if (!res.success) {
      set({isLoading: false, error: res.error});
      return res;
    }
    set({participant: res.data?.participant || res.data || null, isLoading: false});
    return res;
  },

  setParticipant: (participant) => {
    set({participant});
  },
}));
