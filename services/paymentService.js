import { api, safeRequest } from './api';

export const createPaymentIntent = async (bookingId) => {
  return safeRequest(() => api.post('/api/payments/create-intent', { bookingId }));
};

export const confirmPayment = async (paymentIntentId) => {
  return safeRequest(() => api.post('/api/payments/confirm', { payment_intent_id: paymentIntentId }));
};

export const getPaymentHistory = async (params = {}) => {
  return safeRequest(() => api.get('/api/payments/history', { params }));
};

export const createConnectAccount = async () => {
  return safeRequest(() => api.post('/api/payments/connect/onboard'));
};

export const getAccountStatus = async () => {
  return safeRequest(() => api.get('/api/payments/connect/status'));
};
