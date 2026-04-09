import { api, safeRequest } from './api';

export const getMe = async () => {
  return safeRequest(() => api.get('/api/workers/me'));
};

export const getWorkers = async (filters = {}) => {
  return safeRequest(() => api.get('/api/workers', { params: filters }));
};

export const searchWorkers = async (latOrParams, lng, radius, skills) => {
  const params =
    latOrParams && typeof latOrParams === 'object'
      ? {...latOrParams}
      : {
          latitude: latOrParams,
          longitude: lng,
          radiusKm: radius,
          skills,
        };

  return safeRequest(() =>
    api.get('/api/workers/search', {
      params,
    })
  );
};

export const getWorkerById = async (id) => {
  return safeRequest(() => api.get(`/api/workers/${id}`));
};

export const updateWorker = async (id, data) => {
  return safeRequest(() => api.put(`/api/workers/${id}`, data));
};

export const uploadProfilePhoto = async (workerId, file, onUploadProgress) => {
  const form = new FormData();
  form.append('file', file);

  return safeRequest(() =>
    api.post(`/api/workers/${workerId}/profile-photo`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    })
  );
};

export const uploadDocument = async (
  workerId,
  file,
  { documentType, issue_date, expiry_date } = {},
  onUploadProgress
) => {
  const form = new FormData();
  // backend expects field name: file
  form.append('file', file);

  if (documentType) form.append('documentType', documentType);
  if (issue_date) form.append('issue_date', issue_date);
  if (expiry_date) form.append('expiry_date', expiry_date);

  return safeRequest(() =>
    api.post(`/api/workers/${workerId}/documents`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    })
  );
};

/**
 * Upload multiple documents at once. documentTypes must match order of files
 * (e.g. ['ndis_screening', 'wwcc', 'first_aid'] for 3 files).
 * Optional: issue_dates, expiry_dates as arrays of ISO date strings.
 */
export const uploadDocumentsBulk = async (
  workerId,
  files,
  { documentTypes, issue_dates, expiry_dates } = {},
  onUploadProgress
) => {
  const form = new FormData();
  if (Array.isArray(files)) {
    files.forEach((f) => form.append('files', f));
  }
  if (Array.isArray(documentTypes) && documentTypes.length) {
    form.append('documentTypes', documentTypes.join(','));
  }
  if (Array.isArray(issue_dates) && issue_dates.length) {
    form.append('issue_dates', issue_dates.join(','));
  }
  if (Array.isArray(expiry_dates) && expiry_dates.length) {
    form.append('expiry_dates', expiry_dates.join(','));
  }
  return safeRequest(() =>
    api.post(`/api/workers/${workerId}/documents/bulk`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    })
  );
};

export const addSkill = async (workerId, skill) => {
  return safeRequest(() => api.post(`/api/workers/${workerId}/skills`, { skill_name: skill }));
};

export const removeSkill = async (workerId, skillId) => {
  return safeRequest(() => api.delete(`/api/workers/${workerId}/skills/${skillId}`));
};

export const updateAvailability = async (workerId, schedule) => {
  return safeRequest(() => api.put(`/api/workers/${workerId}/availability`, { availability: schedule }));
};
