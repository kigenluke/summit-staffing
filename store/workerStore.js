import {create} from 'zustand';

import * as workerService from '../services/workerService';

/**
 * @typedef {{ skills: string[], radius: number, minRating: number }} WorkerFilters
 */

const defaultFilters = {
  skills: [],
  radius: 10,
  minRating: 0,
  dateFrom: null,
  dateTo: null,
  minRate: 0,
  maxRate: 200,
  serviceTypes: [],
  verifiedOnly: false,
  gender: 'any',
};

export const useWorkerStore = create((set, get) => ({
  workers: [],
  selectedWorker: null,
  filters: defaultFilters,
  searchQuery: '',
  location: null,
  favorites: {},
  hasMore: true,
  page: 1,
  pageSize: 10,
  isLoading: false,
  error: null,

  fetchWorkers: async (filters = {}) => {
    set({isLoading: true, error: null});
    const res = await workerService.getWorkers(filters);
    if (!res.success) {
      set({isLoading: false, error: res.error});
      return res;
    }
    set({workers: res.data?.workers || res.data || [], isLoading: false});
    return res;
  },

  searchWorkers: async (lat, lng, radius, skills) => {
    set({isLoading: true, error: null});
    const res = await workerService.searchWorkers(lat, lng, radius, skills);
    if (!res.success) {
      set({isLoading: false, error: res.error});
      return res;
    }
    set({workers: res.data?.workers || res.data || [], isLoading: false});
    return res;
  },

  searchWorkersWithParams: async (params = {}, opts = {}) => {
    const {append = false} = opts;
    set({isLoading: true, error: null});
    const res = await workerService.searchWorkers(params);
    if (!res.success) {
      set({isLoading: false, error: res.error});
      return res;
    }

    const list = res.data?.workers || res.data || [];
    set({
      workers: append ? [...get().workers, ...list] : list,
      isLoading: false,
      hasMore: list.length >= (params.limit || get().pageSize),
    });
    return res;
  },

  setSelectedWorker: (worker) => {
    set({selectedWorker: worker});
  },

  updateFilters: (filters) => {
    set({filters: {...get().filters, ...filters}});
  },

  setSearchQuery: (q) => {
    set({searchQuery: q});
  },

  setLocation: (location) => {
    set({location});
  },

  toggleFavorite: (workerId) => {
    const fav = {...get().favorites};
    fav[workerId] = !fav[workerId];
    set({favorites: fav});
  },

  isFavorite: (workerId) => {
    return Boolean(get().favorites?.[workerId]);
  },

  clearFilters: () => {
    set({filters: defaultFilters});
  },

  addWorker: (worker) => {
    set({workers: [worker, ...get().workers]});
  },

  updateWorker: (id, data) => {
    const list = get().workers.map(w => (w?.id === id ? {...w, ...data} : w));
    const selected = get().selectedWorker?.id === id ? {...get().selectedWorker, ...data} : get().selectedWorker;
    set({workers: list, selectedWorker: selected});
  },
}));
