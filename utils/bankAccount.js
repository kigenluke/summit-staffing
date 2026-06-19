/** Normalize Australian BSB to 6 digits (no dash). */
const normalizeBsb = (raw) => String(raw || '').replace(/\D/g, '').slice(0, 6);

/** Format BSB as XXX-XXX for display. */
const formatBsbDisplay = (bsbDigits) => {
  const d = normalizeBsb(bsbDigits);
  if (d.length !== 6) return d;
  return `${d.slice(0, 3)}-${d.slice(3)}`;
};

const normalizeAccountNumber = (raw) => String(raw || '').replace(/\D/g, '').slice(0, 9);

/** Parse DOB for Stripe (AU KYC). Accepts DD/MM/YYYY or YYYY-MM-DD. Worker must be 18+. */
const parseWorkerDateOfBirth = (raw) => {
  const s = String(raw || '').trim();
  if (!s) {
    return { ok: false, error: 'Date of birth is required for bank payouts (Stripe verification).' };
  }

  let day;
  let month;
  let year;

  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
  } else if (ymd) {
    year = Number(ymd[1]);
    month = Number(ymd[2]);
    day = Number(ymd[3]);
  } else {
    return { ok: false, error: 'Date of birth must be DD/MM/YYYY (e.g. 15/03/1990).' };
  }

  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return { ok: false, error: 'Invalid date of birth.' };
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1925 || year > 2008) {
    return { ok: false, error: 'Enter a valid date of birth (worker must be 18 or older).' };
  }

  const born = new Date(year, month - 1, day);
  if (born.getFullYear() !== year || born.getMonth() !== month - 1 || born.getDate() !== day) {
    return { ok: false, error: 'Invalid date of birth.' };
  }

  const ageMs = Date.now() - born.getTime();
  const ageYears = ageMs / (365.25 * 24 * 60 * 60 * 1000);
  if (ageYears < 18) {
    return { ok: false, error: 'You must be at least 18 to receive payouts.' };
  }

  return { ok: true, dob: { day, month, year }, dob_display: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}` };
};

const validateAustralianBankDetails = ({ account_holder_name, bsb, account_number, date_of_birth, personal_id_number }) => {
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
  const dobParsed = parseWorkerDateOfBirth(date_of_birth);
  if (!dobParsed.ok) {
    return dobParsed;
  }
  const idDigits = String(personal_id_number || '').replace(/\D/g, '');
  if (idDigits.length < 8 || idDigits.length > 9) {
    return { ok: false, error: 'Personal ID number (TFN) is required — 8 or 9 digits. Sent securely to Stripe only; not stored by Summit Staffing.' };
  }
  return {
    ok: true,
    account_holder_name: name,
    bsb: bsbDigits,
    account_number: acct,
    dob: dobParsed.dob,
    dob_display: dobParsed.dob_display,
    personal_id_number: idDigits,
  };
};

module.exports = {
  normalizeBsb,
  formatBsbDisplay,
  normalizeAccountNumber,
  parseWorkerDateOfBirth,
  validateAustralianBankDetails,
};
