/** Normalize Australian BSB to 6 digits (no dash). */
const normalizeBsb = (raw) => String(raw || '').replace(/\D/g, '').slice(0, 6);

/** Format BSB as XXX-XXX for display. */
const formatBsbDisplay = (bsbDigits) => {
  const d = normalizeBsb(bsbDigits);
  if (d.length !== 6) return d;
  return `${d.slice(0, 3)}-${d.slice(3)}`;
};

const normalizeAccountNumber = (raw) => String(raw || '').replace(/\D/g, '').slice(0, 9);

const validateAustralianBankDetails = ({ account_holder_name, bsb, account_number }) => {
  const name = String(account_holder_name || '').trim();
  if (name.length < 2) {
    return { ok: false, error: 'Account holder name is required.' };
  }
  const bsbDigits = normalizeBsb(bsb);
  if (bsbDigits.length !== 6) {
    return { ok: false, error: 'BSB must be 6 digits (e.g. 062-000).' };
  }
  const acct = normalizeAccountNumber(account_number);
  if (acct.length < 5 || acct.length > 9) {
    return { ok: false, error: 'Account number must be 5 to 9 digits.' };
  }
  return {
    ok: true,
    account_holder_name: name,
    bsb: bsbDigits,
    account_number: acct,
  };
};

module.exports = {
  normalizeBsb,
  formatBsbDisplay,
  normalizeAccountNumber,
  validateAustralianBankDetails,
};
