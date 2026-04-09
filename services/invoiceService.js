import { api, safeRequest } from './api';

export const generateInvoice = async (bookingId) => {
  return safeRequest(() => api.post(`/api/invoices/generate/${bookingId}`));
};

export const getInvoices = async (filters = {}) => {
  return safeRequest(() => api.get('/api/invoices', { params: filters }));
};

export const getInvoiceById = async (id) => {
  return safeRequest(() => api.get(`/api/invoices/${id}`));
};

export const downloadInvoicePDF = async (id) => {
  return safeRequest(() => api.post(`/api/invoices/${id}/pdf`));
};

export const sendInvoiceEmail = async (id) => {
  return safeRequest(() => api.post(`/api/invoices/${id}/send`));
};
