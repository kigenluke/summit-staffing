import { api, safeRequest } from './api';

export const createPaymentIntent = async (bookingId) => {
  return safeRequest('POST', '/api/payments/create-intent', { bookingId });
};

export const confirmPayment = async (paymentIntentId) => {
  return safeRequest('POST', '/api/payments/confirm', { payment_intent_id: paymentIntentId });
};

export const getPaymentHistory = async (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') query.append(k, String(v));
  });
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return safeRequest('GET', `/api/payments/history${suffix}`);
};

export const createConnectAccount = async () => {
  return safeRequest('POST', '/api/payments/connect/onboard');
};

export const getAccountStatus = async () => {
  return safeRequest('GET', '/api/payments/connect/status');
};
