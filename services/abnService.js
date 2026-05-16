const https = require('https');

const normalize = (abn) => String(abn || '').replace(/[^0-9]/g, '').trim();

/** Australian Business Number checksum (ATO / ABR algorithm). */
const validateABNChecksum = (abn) => {
  const digits = normalize(abn);
  if (!/^[0-9]{11}$/.test(digits)) return false;

  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const nums = digits.split('').map((d) => Number(d));
  nums[0] -= 1;

  let sum = 0;
  for (let i = 0; i < 11; i += 1) {
    sum += nums[i] * weights[i];
  }
  return sum % 89 === 0;
};

const fetchAbrJson = (abn, guid) =>
  new Promise((resolve, reject) => {
    const url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${encodeURIComponent(abn)}&guid=${encodeURIComponent(guid)}`;
    https
      .get(url, { timeout: 12000 }, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const start = body.indexOf('{');
            const end = body.lastIndexOf('}');
            if (start < 0 || end < start) {
              resolve(null);
              return;
            }
            resolve(JSON.parse(body.slice(start, end + 1)));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject)
      .on('timeout', () => reject(new Error('ABR lookup timed out')));
  });

/**
 * Verify an Australian ABN: format + checksum, then optional live ABR register lookup.
 * Register for a free GUID: https://abr.business.gov.au/Tools/WebServices
 * Set ABR_LOOKUP_GUID in server env.
 */
const verifyAbn = async (abn) => {
  const normalized = normalize(abn);

  if (!normalized) {
    return { valid: false, error: 'ABN is required' };
  }

  if (!/^[0-9]{11}$/.test(normalized)) {
    return { valid: false, error: 'ABN must be exactly 11 digits (Australian Business Number only)' };
  }

  if (!validateABNChecksum(normalized)) {
    return {
      valid: false,
      error: 'This is not a valid Australian ABN. Summit Staffing is Australia-only — use your real ABN from the Australian Business Register.',
    };
  }

  const guid = process.env.ABR_LOOKUP_GUID || process.env.ABN_LOOKUP_GUID;
  if (!guid) {
    return {
      valid: true,
      checksumOk: true,
      registeredOnAbr: null,
      abn: normalized,
      message: 'ABN format is valid. Configure ABR_LOOKUP_GUID on the server for live register checks.',
    };
  }

  try {
    const data = await fetchAbrJson(normalized, guid);
    if (!data || data.Message) {
      return {
        valid: false,
        error: 'ABN was not found on the Australian Business Register. Only valid Australian ABNs can be used.',
      };
    }

    const status = String(data.AbnStatus || data.EntityStatus || '').trim();
    const entityName = String(data.EntityName || data.BusinessName || '').trim();
    const active = !status || /^active$/i.test(status);

    if (!active) {
      return {
        valid: false,
        error: `This ABN is ${status || 'not active'} on the Australian Business Register and cannot be used.`,
        abn_status: status,
      };
    }

    return {
      valid: true,
      checksumOk: true,
      registeredOnAbr: true,
      abn: normalized,
      entity_name: entityName || null,
      abn_status: status || 'Active',
    };
  } catch (_) {
    return {
      valid: true,
      checksumOk: true,
      registeredOnAbr: null,
      abn: normalized,
      message: 'ABN format is valid. ABR register is temporarily unavailable; try again shortly.',
    };
  }
};

const validateABN = (abn) => validateABNChecksum(normalize(abn));

module.exports = {
  normalize,
  validateABN,
  validateABNChecksum,
  verifyAbn,
};
