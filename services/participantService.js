import { api, safeRequest } from './api';

export const getParticipant = async (id) => {
  return safeRequest(() => api.get(`/api/participants/${id}`));
};

export const getMe = async () => {
  return safeRequest(() => api.get('/api/participants/me'));
};

export const updateParticipant = async (id, data) => {
  return safeRequest(() => api.put(`/api/participants/${id}`, data));
};

export const uploadProfilePhoto = async (file, onUploadProgress) => {
  const form = new FormData();
  form.append('file', file);
  return safeRequest(() =>
    api.post('/api/participants/me/profile-photo', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    })
  );
};

export const verifyNDIS = async (ndisNumber) => {
  return safeRequest(() => api.post('/api/participants/verify-ndis', { ndisNumber }));
};
