import { api, safeRequest } from './api';

export const generateInvoice = async (bookingId) => {
  return safeRequest('POST', `/api/invoices/generate/${bookingId}`);
};

export const getInvoices = async (filters = {}) => {
  const query = new URLSearchParams();
  Object.entries(filters || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') query.append(k, String(v));
  });
  return safeRequest('GET', `/api/invoices${query.toString() ? `?${query.toString()}` : ''}`);
};

export const getInvoiceById = async (id) => {
  return safeRequest('GET', `/api/invoices/${id}`);
};

export const downloadInvoicePDF = async (id) => {
  return safeRequest('POST', `/api/invoices/${id}/pdf`);
};

export const sendInvoiceEmail = async (id) => {
  return safeRequest('POST', `/api/invoices/${id}/send`);
};
