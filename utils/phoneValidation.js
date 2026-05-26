/** Strip to digits for length checks (AU and international). */
export function phoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

export function isValidPhone(phone) {
  const digits = phoneDigits(phone);
  return digits.length >= 8 && digits.length <= 15;
}

export function normalizePhoneForStorage(phone) {
  return String(phone || '').trim();
}
