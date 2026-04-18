import { api, safeRequest } from './api';

export const getParticipant = async (id) => {
  return safeRequest('GET', `/api/participants/${id}`);
};

export const getMe = async () => {
  return safeRequest('GET', '/api/participants/me');
};

export const updateParticipant = async (id, data) => {
  return safeRequest('PUT', `/api/participants/${id}`, data);
};

export const uploadProfilePhoto = async (file, onUploadProgress) => {
  const form = new FormData();
  form.append('file', file);
  const { data, error } = await api.post('/api/participants/me/profile-photo', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress,
  });
  return {
    success: !error,
    data,
    error: error ? (error.message || 'Request failed') : null,
  };
};

export const verifyNDIS = async (ndisNumber) => {
  return safeRequest('POST', '/api/participants/verify-ndis', { ndisNumber });
};
