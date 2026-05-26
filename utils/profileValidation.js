const trim = (v) => String(v ?? '').trim();

const hasPhone = (phone) => trim(phone).replace(/\D/g, '').length >= 8;

const isValidNdis = (ndisNumber) => {
  const normalized = String(ndisNumber || '').replace(/[^0-9]/g, '');
  return /^43[0-9]{8}$/.test(normalized);
};

/**
 * Required for worker & participant edit-profile saves.
 * About is optional for participants.
 */
export const validateGatedProfile = (profile, { requireNdis = false } = {}) => {
  const errors = [];

  if (!trim(profile.first_name)) errors.push('First name is required');
  if (!trim(profile.last_name)) errors.push('Last name is required');
  if (!trim(profile.address)) errors.push('Address is required');
  if (!hasPhone(profile.phone)) errors.push('Phone number is required (at least 8 digits)');

  if (requireNdis) {
    const ndis = trim(profile.ndis_number);
    if (!ndis) {
      errors.push('NDIS number is required');
    } else if (!isValidNdis(ndis)) {
      errors.push('NDIS number must be 10 digits and start with 43');
    }
  }

  if (!trim(profile.emergency_contact_name)) errors.push('Emergency contact name is required');
  if (!hasPhone(profile.emergency_contact_phone)) {
    errors.push('Emergency contact phone is required (at least 8 digits)');
  }

  return {
    ok: errors.length === 0,
    errors,
    message: errors.length ? errors.join('\n') : null,
  };
};

export { hasPhone, isValidNdis };
