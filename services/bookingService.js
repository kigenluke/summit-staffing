import { api, safeRequest } from './api';

export const createBooking = async (bookingData) => {
  return safeRequest('POST', '/api/bookings', bookingData);
};

export const getBookings = async (filters = {}) => {
  const query = new URLSearchParams();
  Object.entries(filters || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') query.append(k, String(v));
  });
  return safeRequest('GET', `/api/bookings${query.toString() ? `?${query.toString()}` : ''}`);
};

export const getBookingById = async (id) => {
  return safeRequest('GET', `/api/bookings/${id}`);
};

export const acceptBooking = async (id) => {
  return safeRequest('PUT', `/api/bookings/${id}/accept`);
};

export const declineBooking = async (id) => {
  return safeRequest('PUT', `/api/bookings/${id}/decline`);
};

export const cancelBooking = async (id) => {
  return safeRequest('PUT', `/api/bookings/${id}/cancel`);
};

export const clockIn = async (id, lat, lng) => {
  return safeRequest('POST', `/api/bookings/${id}/clock-in`, { lat, lng });
};

export const clockOut = async (id, lat, lng) => {
  return safeRequest('POST', `/api/bookings/${id}/clock-out`, { lat, lng });
};

export const completeBooking = async (id) => {
  return safeRequest('PUT', `/api/bookings/${id}/complete`);
};

export const saveNotes = async (id, notes) => {
  return safeRequest('PUT', `/api/bookings/${id}/notes`, { notes });
};
