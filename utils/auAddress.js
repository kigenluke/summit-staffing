/** Parse free-text AU addresses for Stripe Connect (street, city, state, postcode). */

const AU_STATE_ABBR = {
  'new south wales': 'NSW',
  nsw: 'NSW',
  victoria: 'VIC',
  vic: 'VIC',
  queensland: 'QLD',
  qld: 'QLD',
  'south australia': 'SA',
  sa: 'SA',
  'western australia': 'WA',
  wa: 'WA',
  tasmania: 'TAS',
  tas: 'TAS',
  'northern territory': 'NT',
  nt: 'NT',
  'australian capital territory': 'ACT',
  act: 'ACT',
};

const normalizeState = (raw) => {
  const key = String(raw || '').trim().toLowerCase();
  return AU_STATE_ABBR[key] || (key.length <= 3 ? key.toUpperCase() : null);
};

/**
 * Best-effort parse of Australian addresses from profile / Google Places text.
 * Examples: "12 George St, Parramatta NSW 2150" or "12 George St, Sydney NSW 2000, Australia"
 */
const parseAustralianAddress = (addressText) => {
  let text = String(addressText || '').trim().replace(/\s+/g, ' ');
  if (!text) return null;

  text = text.replace(/,?\s*Australia\s*$/i, '').trim();

  const postcodeMatch = text.match(/\b(\d{4})\s*$/);
  const postal_code = postcodeMatch ? postcodeMatch[1] : null;
  if (postcodeMatch) {
    text = text.slice(0, postcodeMatch.index).trim().replace(/,\s*$/, '');
  }

  let state = null;
  const stateTail = text.match(/\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\.?\s*$/i);
  if (stateTail) {
    state = stateTail[1].toUpperCase();
    text = text.slice(0, stateTail.index).trim().replace(/,\s*$/, '');
  } else {
    const words = text.split(/\s+/);
    const lastWord = words[words.length - 1];
    const normalized = normalizeState(lastWord);
    if (normalized) {
      state = normalized;
      text = words.slice(0, -1).join(' ').trim().replace(/,\s*$/, '');
    }
  }

  const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
  let line1 = '';
  let city = '';

  if (parts.length >= 2) {
    line1 = parts[0];
    city = parts[parts.length - 1];
  } else if (parts.length === 1) {
    const tokens = parts[0].split(/\s+/);
    if (tokens.length >= 3) {
      city = tokens[tokens.length - 1];
      line1 = tokens.slice(0, -1).join(' ');
    } else {
      line1 = parts[0];
    }
  }

  return {
    line1: line1.slice(0, 200) || text.slice(0, 200),
    city: city.slice(0, 100) || undefined,
    state: state || undefined,
    postal_code: postal_code || undefined,
    country: 'AU',
  };
};

const validateAddressForStripe = (addressText) => {
  const parsed = parseAustralianAddress(addressText);
  if (!parsed?.line1) {
    return {
      ok: false,
      error: 'Add a full Australian address in Profile (street, suburb, state and postcode). Example: 12 George St, Sydney NSW 2000',
    };
  }
  const missing = [];
  if (!parsed.city) missing.push('suburb/city');
  if (!parsed.state) missing.push('state');
  if (!parsed.postal_code) missing.push('postcode');
  if (missing.length) {
    return {
      ok: false,
      error: `Your profile address is missing ${missing.join(', ')}. Use format: Street, Suburb STATE Postcode (e.g. 12 George St, Parramatta NSW 2150).`,
      parsed,
    };
  }
  return { ok: true, parsed };
};

/** Stripe Connect individual.address payload. */
const toStripeConnectAddress = (addressText) => {
  const check = validateAddressForStripe(addressText);
  if (!check.ok) return { address: null, error: check.error };
  const p = check.parsed;
  return {
    address: {
      line1: p.line1,
      city: p.city,
      state: p.state,
      postal_code: p.postal_code,
      country: 'AU',
    },
    error: null,
  };
};

module.exports = {
  parseAustralianAddress,
  validateAddressForStripe,
  toStripeConnectAddress,
};
