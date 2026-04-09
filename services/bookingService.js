import { api, safeRequest } from './api';

export const createBooking = async (bookingData) => {
  return safeRequest(() => api.post('/api/bookings', bookingData));
};

export const getBookings = async (filters = {}) => {
  return safeRequest(() => api.get('/api/bookings', { params: filters }));
};

export const getBookingById = async (id) => {
  return safeRequest(() => api.get(`/api/bookings/${id}`));
};

export const acceptBooking = async (id) => {
  return safeRequest(() => api.put(`/api/bookings/${id}/accept`));
};

export const declineBooking = async (id) => {
  return safeRequest(() => api.put(`/api/bookings/${id}/decline`));
};

export const cancelBooking = async (id) => {
  return safeRequest(() => api.put(`/api/bookings/${id}/cancel`));
};

export const clockIn = async (id, lat, lng) => {
  return safeRequest(() => api.post(`/api/bookings/${id}/clock-in`, { lat, lng }));
};

export const clockOut = async (id, lat, lng) => {
  return safeRequest(() => api.post(`/api/bookings/${id}/clock-out`, { lat, lng }));
};

export const completeBooking = async (id) => {
  return safeRequest(() => api.put(`/api/bookings/${id}/complete`));
};

export const saveNotes = async (id, notes) => {
  return safeRequest(() => api.put(`/api/bookings/${id}/notes`, {notes}));
};
