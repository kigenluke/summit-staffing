/**
 * NDIS-aligned min/max hourly rates (platform floor + government cap), sleepover, travel.
 * Sydney calendar for day-of-week, time-of-day, NSW public holidays.
 * Shifts crossing 6am / 8pm / midnight are split ("Midnight Splitter") for validation and totals.
 */

const TRAVEL_NON_LABOUR_PER_KM = 0.99;
const SLEEPOVER_FLAT_NIGHTLY = 297.6;
const GENERAL_MIN_HOURLY = 55.0;
const HIGH_INTENSITY_WEEKDAY_DAYTIME_MAX = 75.98;

/** Default floors/caps — override via NDIS_SHIFT_<TYPE>_MIN / _MAX env vars. */
const DEFAULT_SHIFT_TYPES = {
  weekday_day: { min: 52.0, max: 70.23 },
  weekday_evening: { min: 57.0, max: 77.38 },
  weekday_night: { min: 58.0, max: 78.81 },
  saturday: { min: 73.0, max: 98.83 },
  sunday: { min: 93.0, max: 127.43 },
  public_holiday: { min: 117.0, max: 156.03 },
};

/** Node (Railway) uses process.env; Vite web uses import.meta.env; RN uses defaults. */
function readEnv(key) {
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key] != null) {
      return process.env[key];
    }
  } catch (_) {}
  // Keep import.meta inside Function so Metro/Hermes does not fail parsing release bundles.
  try {
    const getter = new Function(
      'k',
      'try { return import.meta?.env?.[k]; } catch (_) { return undefined; }'
    );
    const v = getter(key);
    if (v != null && v !== '') return v;
  } catch (_) {}
  return null;
}

function envShiftLimit(typeId, bound) {
  const key = `NDIS_SHIFT_${String(typeId).toUpperCase()}_${bound === 'min' ? 'MIN' : 'MAX'}`;
  const raw = readEnv(key);
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function buildShiftTypesConfig() {
  const out = {};
  for (const [id, defaults] of Object.entries(DEFAULT_SHIFT_TYPES)) {
    const min = envShiftLimit(id, 'min') ?? defaults.min;
    const max = envShiftLimit(id, 'max') ?? defaults.max;
    out[id] = { min, max };
  }
  return out;
}

const SHIFT_TYPES = buildShiftTypesConfig();

/** @deprecated Use SHIFT_TYPES — kept for screens that reference RATES.* caps */
const RATES = {
  standardWeekdayDaytime: SHIFT_TYPES.weekday_day.max,
  standardWeekdayEvening: SHIFT_TYPES.weekday_evening.max,
  standardWeekdayNight: SHIFT_TYPES.weekday_night.max,
  standardSaturday: SHIFT_TYPES.saturday.max,
  standardSunday: SHIFT_TYPES.sunday.max,
  standardPublicHoliday: SHIFT_TYPES.public_holiday.max,
  houseCleaningYard: 56.98,
  personalDomesticActivities: 59.06,
  registeredNurseWeekdayDaytime: 123.65,
};

const NSW_PUBLIC_HOLIDAY_YMD = new Set([
  '2025-01-01', '2025-01-27', '2025-04-18', '2025-04-19', '2025-04-20', '2025-04-21',
  '2025-04-25', '2025-06-09', '2025-08-04', '2025-10-06', '2025-12-25', '2025-12-26',
  '2026-01-01', '2026-01-26', '2026-04-03', '2026-04-04', '2026-04-05', '2026-04-06',
  '2026-04-25', '2026-04-27', '2026-06-08', '2026-08-03', '2026-10-05',
  '2026-12-25', '2026-12-26', '2026-12-28',
  '2027-01-01', '2027-01-26', '2027-03-26', '2027-03-27', '2027-03-28', '2027-03-29',
  '2027-04-25', '2027-04-26', '2027-06-14', '2027-08-02', '2027-10-04',
  '2027-12-25', '2027-12-26', '2027-12-27', '2027-12-28',
  '2028-01-01', '2028-01-26', '2028-03-15', '2028-03-16', '2028-03-17', '2028-03-18',
  '2028-04-25', '2028-06-10', '2028-08-07', '2028-10-02', '2028-12-25', '2028-12-26',
]);

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** @returns {{ ymd: string, hour: number, jsWeekday: number }} */
function getSydneyYmdAndHour(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return null;
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Australia/Sydney',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(d);
  const hour = parseInt(hourStr, 10);
  const wk = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Australia/Sydney',
    weekday: 'short',
  }).format(d);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { ymd, hour, jsWeekday: map[wk] ?? 0 };
}

function gregorianEasterSundayUtcNoon(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function addUtcDays(dateUtcNoon, delta) {
  return new Date(dateUtcNoon.getTime() + delta * 86400000);
}

function ymdFromUtcNoon(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function sydneyJsWeekdayOnCalendarDate(year, month1to12, day) {
  const d = new Date(Date.UTC(year, month1to12 - 1, day, 14, 0, 0));
  const wk = new Intl.DateTimeFormat('en-US', { timeZone: 'Australia/Sydney', weekday: 'short' }).format(d);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wk] ?? 0;
}

function buildDynamicNswHolidayYmds(year) {
  const out = new Set();
  const easterSun = gregorianEasterSundayUtcNoon(year);
  [addUtcDays(easterSun, -2), addUtcDays(easterSun, -1), easterSun, addUtcDays(easterSun, 1)].forEach((dt) =>
    out.add(ymdFromUtcNoon(dt)),
  );
  const nthMonday = (monthIndex0, n) => {
    let count = 0;
    for (let day = 1; day <= 31; day++) {
      const probe = new Date(Date.UTC(year, monthIndex0, day, 12, 0, 0));
      if (probe.getUTCMonth() !== monthIndex0) break;
      if (probe.getUTCDay() === 1) {
        count += 1;
        if (count === n) return ymdFromUtcNoon(probe);
      }
    }
    return null;
  };
  const kings = nthMonday(5, 2);
  const bank = nthMonday(7, 1);
  const labour = nthMonday(9, 1);
  if (kings) out.add(kings);
  if (bank) out.add(bank);
  if (labour) out.add(labour);
  out.add(`${year}-01-01`);
  out.add(`${year}-04-25`);
  const wkJan26 = sydneyJsWeekdayOnCalendarDate(year, 1, 26);
  if (wkJan26 === 0) out.add(`${year}-01-27`);
  else if (wkJan26 === 6) out.add(`${year}-01-28`);
  else out.add(`${year}-01-26`);
  const wkApr25 = sydneyJsWeekdayOnCalendarDate(year, 4, 25);
  if (wkApr25 === 6) out.add(`${year}-04-27`);
  if (wkApr25 === 0) out.add(`${year}-04-26`);
  out.add(`${year}-12-25`);
  out.add(`${year}-12-26`);
  return out;
}

function isNswPublicHolidayYmd(ymd) {
  if (NSW_PUBLIC_HOLIDAY_YMD.has(ymd)) return true;
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const year = parseInt(m[1], 10);
  if (year < 2029) return false;
  return buildDynamicNswHolidayYmds(year).has(ymd);
}

/**
 * Resolve shift type ID at an instant (Sydney).
 * @returns {keyof typeof DEFAULT_SHIFT_TYPES}
 */
function getShiftTypeIdAt(isoOrDate) {
  const parts = getSydneyYmdAndHour(isoOrDate);
  if (!parts) return 'weekday_day';
  if (isNswPublicHolidayYmd(parts.ymd)) return 'public_holiday';
  if (parts.jsWeekday === 0) return 'sunday';
  if (parts.jsWeekday === 6) return 'saturday';
  if (parts.hour >= 6 && parts.hour < 20) return 'weekday_day';
  if (parts.hour >= 20) return 'weekday_evening';
  return 'weekday_night';
}

function getShiftTypeLimits(shiftTypeId) {
  return SHIFT_TYPES[shiftTypeId] || SHIFT_TYPES.weekday_day;
}

function getSegmentMaximum(shiftTypeId, opts = {}) {
  if (shiftTypeId === 'weekday_day' && opts.highIntensity) {
    return HIGH_INTENSITY_WEEKDAY_DAYTIME_MAX;
  }
  return getShiftTypeLimits(shiftTypeId).max;
}

function mergeAdjacentSegments(segments) {
  if (!segments.length) return [];
  const out = [{ ...segments[0] }];
  for (let i = 1; i < segments.length; i++) {
    const cur = segments[i];
    const prev = out[out.length - 1];
    if (prev.shiftTypeId === cur.shiftTypeId) {
      prev.hours = Number((prev.hours + cur.hours).toFixed(4));
      prev.endIso = cur.endIso;
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/**
 * Midnight splitter: slice shift into segments with hours per NDIS shift type.
 * @returns {Array<{ shiftTypeId: string, hours: number, startIso: string, endIso: string }>}
 */
function splitShiftIntoRateSegments(startIso, endIso) {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return [];

  const raw = [];
  let segStartMs = startMs;
  let currentType = getShiftTypeIdAt(new Date(segStartMs));

  for (let t = segStartMs + 60000; t <= endMs; t += 60000) {
    const probeMs = Math.min(t, endMs);
    const typeAtProbe = getShiftTypeIdAt(new Date(probeMs));
    if (typeAtProbe !== currentType || probeMs === endMs) {
      const hours = (probeMs - segStartMs) / 3600000;
      if (hours > 1e-9) {
        raw.push({
          shiftTypeId: currentType,
          hours: Number(hours.toFixed(4)),
          startIso: new Date(segStartMs).toISOString(),
          endIso: new Date(probeMs).toISOString(),
        });
      }
      if (probeMs === endMs) break;
      segStartMs = probeMs;
      currentType = typeAtProbe;
    }
  }

  return mergeAdjacentSegments(raw);
}

function getServiceCategoryMinimum(serviceType) {
  const t = String(serviceType || '').trim();
  if (t === 'Domestic Assistance' || t === 'Home & Community') return RATES.houseCleaningYard;
  if (t === 'Assistance with Daily Life') return RATES.personalDomesticActivities;
  if (t === 'Therapeutic Services' || t === 'Improved Health and Wellbeing') {
    return RATES.registeredNurseWeekdayDaytime;
  }
  return null;
}

/**
 * Allowed min/max for a flat hourly rate across the whole shift window (intersection of segment bounds).
 */
function getShiftWindowRateBounds(serviceType, startTimeIso, endTimeIso, opts = {}) {
  const endIso = endTimeIso || startTimeIso;
  const segments = splitShiftIntoRateSegments(startTimeIso, endIso);
  const list = segments.length ? segments : [{ shiftTypeId: getShiftTypeIdAt(startTimeIso), hours: 0 }];

  const serviceMin = getServiceCategoryMinimum(serviceType);
  let minimum = GENERAL_MIN_HOURLY;
  let maximum = Infinity;

  for (const seg of list) {
    const limits = getShiftTypeLimits(seg.shiftTypeId);
    minimum = Math.max(minimum, limits.min);
    if (serviceMin != null) minimum = Math.max(minimum, serviceMin);
    maximum = Math.min(maximum, getSegmentMaximum(seg.shiftTypeId, opts));
  }

  if (!Number.isFinite(maximum)) maximum = SHIFT_TYPES.weekday_day.max;

  const hasConflict = minimum > maximum + 1e-6;

  return { minimum, maximum, segments: list, hasConflict };
}

function formatAud(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '$0.00';
  return `$${n.toFixed(2)}`;
}

function formatShiftTypeLabel(shiftTypeId) {
  return String(shiftTypeId || '').replace(/_/g, ' ');
}

function describeSegmentRateBands(segments, opts = {}) {
  return segments
    .map((seg) => {
      const limits = getShiftTypeLimits(seg.shiftTypeId);
      const segMax = getSegmentMaximum(seg.shiftTypeId, opts);
      return `${formatShiftTypeLabel(seg.shiftTypeId)} (${seg.hours.toFixed(2)}h): ${formatAud(limits.min)}–${formatAud(segMax)}/hr`;
    })
    .join('; ');
}

function shiftWindowHasRateConflict(minimum, maximum) {
  return Number(minimum) > Number(maximum) + 1e-6;
}

/**
 * @example validateWorkerRate('weekday_evening', 57)
 */
function validateWorkerRate(shiftType, proposedRate) {
  const limits = getShiftTypeLimits(shiftType);
  const rate = Number(proposedRate);
  if (!Number.isFinite(rate)) {
    return { valid: false, message: 'Hourly rate must be a valid number.' };
  }
  if (rate + 1e-6 < limits.min) {
    return {
      valid: false,
      message: `To cover your 15% platform fee and stay profitable, the minimum rate for this shift type is ${formatAud(limits.min)}/hr.`,
    };
  }
  if (rate > limits.max + 1e-6) {
    return {
      valid: false,
      message: `This rate exceeds the legal NDIS maximum price cap of ${formatAud(limits.max)}/hr for this shift type.`,
    };
  }
  return { valid: true };
}

function getNdisMinimumHourlyRate(serviceType, startTimeIso, endTimeIso) {
  const { minimum } = getShiftWindowRateBounds(serviceType, startTimeIso, endTimeIso || startTimeIso, {});
  return minimum;
}

function getNdisMaximumHourlyRate(serviceType, startTimeIso, opts = {}) {
  const endIso = opts.endTimeIso || startTimeIso;
  const { maximum } = getShiftWindowRateBounds(serviceType, startTimeIso, endIso, opts);
  return maximum;
}

function getStandardSupportMinimumHourly(startIso) {
  return getShiftTypeLimits(getShiftTypeIdAt(startIso)).min;
}

function getStandardSupportMaximumHourly(startIso, opts = {}) {
  const id = getShiftTypeIdAt(startIso);
  return getSegmentMaximum(id, opts);
}

/**
 * @param opts {{ highIntensity?: boolean, endTimeIso?: string }}
 */
function validateParticipantOfferedHourlyRate(serviceType, startTimeIso, hourlyRate, opts = {}) {
  const rate = Number(hourlyRate);
  if (!Number.isFinite(rate) || rate < 0) {
    return { ok: false, error: 'Hourly rate must be a valid non-negative number.', minimum: 0, maximum: 0 };
  }
  if (rate === 0) {
    return { ok: true, minimum: 0, maximum: 0 };
  }

  const endIso = opts.endTimeIso || startTimeIso;
  const { minimum, maximum, segments, hasConflict } = getShiftWindowRateBounds(serviceType, startTimeIso, endIso, opts);

  if (hasConflict) {
    return {
      ok: false,
      minimum,
      maximum,
      segments,
      segmentsConflict: true,
      error:
        `This shift crosses incompatible NDIS rate bands — no single hourly rate covers every part of the shift. `
        + `Bands: ${describeSegmentRateBands(segments, opts)}. `
        + `Weekend or public-holiday shifts that run past midnight into a weekday use lower weekday caps. `
        + `End before midnight (11:59 PM) or post separate shifts for each day.`,
    };
  }

  for (const seg of segments) {
    const check = validateWorkerRate(seg.shiftTypeId, rate);
    if (!check.valid) {
      const label = seg.shiftTypeId.replace(/_/g, ' ');
      return {
        ok: false,
        minimum,
        maximum,
        segments,
        error: `${check.message} (applies to ${seg.hours.toFixed(2)}h in this shift — ${label}).`,
      };
    }
  }

  if (rate + 1e-6 < minimum) {
    return {
      ok: false,
      minimum,
      maximum,
      segments,
      error: `Hourly rate must be at least ${formatAud(minimum)}/hr for this shift (NDIS minimum across all time segments).`,
    };
  }
  if (rate > maximum + 1e-6) {
    return {
      ok: false,
      minimum,
      maximum,
      segments,
      error: `Hourly rate cannot exceed ${formatAud(maximum)}/hr (NDIS maximum across all time segments${opts.highIntensity ? '; high intensity weekday daytime' : ''}).`,
    };
  }

  return { ok: true, minimum, maximum, segments };
}

function computeTravelCharge(km, perKm = TRAVEL_NON_LABOUR_PER_KM) {
  const k = Math.max(0, Number(km) || 0);
  const r = Math.max(0, Number(perKm) || 0);
  return Number((k * r).toFixed(2));
}

const MAX_TRAVEL_KM = 2000;

function validateTravelDistanceKm(km) {
  const k = Number(km);
  if (km == null || km === '') return { ok: true };
  if (!Number.isFinite(k) || k < 0) {
    return { ok: false, error: 'Travel distance (km) must be a valid non-negative number.' };
  }
  if (k > MAX_TRAVEL_KM) {
    return { ok: false, error: `Travel distance cannot exceed ${MAX_TRAVEL_KM} km.` };
  }
  return { ok: true };
}

function validateSleepoverFlatAmount(amount) {
  if (amount == null || amount === '' || Number(amount) === 0) return { ok: true };
  const a = Number(amount);
  if (!Number.isFinite(a)) return { ok: false, error: 'Invalid sleepover amount.' };
  if (Math.abs(a - SLEEPOVER_FLAT_NIGHTLY) > 0.005) {
    return { ok: false, error: `Sleepover flat fee must be ${formatAud(SLEEPOVER_FLAT_NIGHTLY)} per NDIS price guide.` };
  }
  return { ok: true };
}

export {
  TRAVEL_NON_LABOUR_PER_KM,
  SLEEPOVER_FLAT_NIGHTLY,
  GENERAL_MIN_HOURLY,
  HIGH_INTENSITY_WEEKDAY_DAYTIME_MAX,
  SHIFT_TYPES,
  RATES,
  getShiftTypeIdAt,
  getShiftTypeLimits,
  splitShiftIntoRateSegments,
  getShiftWindowRateBounds,
  describeSegmentRateBands,
  shiftWindowHasRateConflict,
  validateWorkerRate,
  getNdisMinimumHourlyRate,
  getNdisMaximumHourlyRate,
  getStandardSupportMinimumHourly,
  getStandardSupportMaximumHourly,
  validateParticipantOfferedHourlyRate,
  computeTravelCharge,
  validateTravelDistanceKm,
  validateSleepoverFlatAmount,
  getSydneyYmdAndHour,
};

export default {
  TRAVEL_NON_LABOUR_PER_KM,
  SLEEPOVER_FLAT_NIGHTLY,
  GENERAL_MIN_HOURLY,
  HIGH_INTENSITY_WEEKDAY_DAYTIME_MAX,
  SHIFT_TYPES,
  RATES,
  getShiftTypeIdAt,
  splitShiftIntoRateSegments,
  validateWorkerRate,
  getNdisMinimumHourlyRate,
  getNdisMaximumHourlyRate,
  validateParticipantOfferedHourlyRate,
  computeTravelCharge,
  validateTravelDistanceKm,
  validateSleepoverFlatAmount,
  getSydneyYmdAndHour,
};
