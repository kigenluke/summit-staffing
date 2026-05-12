/**
 * NDIS-aligned min/max hourly rates, sleepover flat, and travel (non-labour) for participant offers.
 * Uses Australia/Sydney calendar for day-of-week, time-of-day, and NSW public holidays.
 */

const TRAVEL_NON_LABOUR_PER_KM = 0.99;

/** NDIS sleepover allowance (per night, price guide snapshot). */
const SLEEPOVER_FLAT_NIGHTLY = 297.6;

/** Absolute floor when service type is unknown (safety buffer / general labour). */
const GENERAL_MIN_HOURLY = 55.0;

/** Weekday daytime “high intensity” cap (separate from standard $70.23 cap). */
const HIGH_INTENSITY_WEEKDAY_DAYTIME_MAX = 75.98;

const RATES = {
  standardWeekdayDaytime: 70.23,
  standardWeekdayEvening: 77.38,
  standardWeekdayNight: 78.81,
  standardSaturday: 98.83,
  standardSunday: 127.43,
  standardPublicHoliday: 156.03,
  houseCleaningYard: 56.98,
  personalDomesticActivities: 59.06,
  registeredNurseWeekdayDaytime: 123.65,
};

/** Verified NSW public holidays (inclusive). Extend periodically from NSW Government / Fair Work. */
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

/** @returns {{ ymd: string, hour: number, jsWeekday: number }} jsWeekday: 0=Sun … 6=Sat (Sydney calendar date) */
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
  const jsWeekday = map[wk] ?? 0;
  return { ymd, hour, jsWeekday };
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
  const t = dateUtcNoon.getTime() + delta * 86400000;
  return new Date(t);
}

function ymdFromUtcNoon(d) {
  const y = d.getUTCFullYear();
  const m = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  return `${y}-${m}-${day}`;
}

function sydneyJsWeekdayOnCalendarDate(year, month1to12, day) {
  const d = new Date(Date.UTC(year, month1to12 - 1, day, 14, 0, 0));
  const wk = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Australia/Sydney',
    weekday: 'short',
  }).format(d);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wk] ?? 0;
}

function buildDynamicNswHolidayYmds(year) {
  const out = new Set();
  const easterSun = gregorianEasterSundayUtcNoon(year);
  const goodFri = addUtcDays(easterSun, -2);
  const easterSat = addUtcDays(easterSun, -1);
  const easterMon = addUtcDays(easterSun, 1);
  [goodFri, easterSat, easterSun, easterMon].forEach((dt) => out.add(ymdFromUtcNoon(dt)));

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
  const dyn = buildDynamicNswHolidayYmds(year);
  return dyn.has(ymd);
}

/**
 * NDIS price-limit for standard support (same ladder as minimums; high-intensity bumps weekday daytime max only).
 */
function getStandardSupportMaximumHourly(startIso, opts = {}) {
  const parts = getSydneyYmdAndHour(startIso);
  if (!parts) return RATES.standardWeekdayDaytime;

  if (isNswPublicHolidayYmd(parts.ymd)) return RATES.standardPublicHoliday;

  const { hour, jsWeekday } = parts;
  if (jsWeekday === 0) return RATES.standardSunday;
  if (jsWeekday === 6) return RATES.standardSaturday;

  if (hour >= 6 && hour < 20) {
    if (opts.highIntensity) return HIGH_INTENSITY_WEEKDAY_DAYTIME_MAX;
    return RATES.standardWeekdayDaytime;
  }
  if (hour >= 20 && hour <= 23) return RATES.standardWeekdayEvening;
  return RATES.standardWeekdayNight;
}

function getStandardSupportMinimumHourly(startIso) {
  const parts = getSydneyYmdAndHour(startIso);
  if (!parts) return RATES.standardWeekdayDaytime;

  if (isNswPublicHolidayYmd(parts.ymd)) return RATES.standardPublicHoliday;

  const { hour, jsWeekday } = parts;
  if (jsWeekday === 0) return RATES.standardSunday;
  if (jsWeekday === 6) return RATES.standardSaturday;

  if (hour >= 6 && hour < 20) return RATES.standardWeekdayDaytime;
  if (hour >= 20 && hour <= 23) return RATES.standardWeekdayEvening;
  return RATES.standardWeekdayNight;
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

function getServiceCategoryMaximum(serviceType) {
  return getServiceCategoryMinimum(serviceType);
}

/**
 * Minimum hourly rate (AUD) a participant must offer for this service and shift start time.
 */
function getNdisMinimumHourlyRate(serviceType, startTimeIso) {
  const specific = getServiceCategoryMinimum(serviceType);
  const standard = getStandardSupportMinimumHourly(startTimeIso);
  if (specific != null) {
    return Math.max(specific, standard);
  }
  return Math.max(GENERAL_MIN_HOURLY, standard);
}

/**
 * Maximum hourly rate (NDIS price limit) for this service, time, and optional high-intensity weekday daytime.
 */
function getNdisMaximumHourlyRate(serviceType, startTimeIso, opts = {}) {
  const specific = getServiceCategoryMaximum(serviceType);
  const standard = getStandardSupportMaximumHourly(startTimeIso, opts);
  if (specific != null) {
    return Math.max(specific, standard);
  }
  return Math.max(GENERAL_MIN_HOURLY, standard);
}

function formatAud(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '$0.00';
  return `$${n.toFixed(2)}`;
}

function computeTravelCharge(km, perKm = TRAVEL_NON_LABOUR_PER_KM) {
  const k = Math.max(0, Number(km) || 0);
  const r = Math.max(0, Number(perKm) || 0);
  return Number((k * r).toFixed(2));
}

const MAX_TRAVEL_KM = 2000;

/**
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
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

/**
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function validateSleepoverFlatAmount(amount) {
  if (amount == null || amount === '' || Number(amount) === 0) return { ok: true };
  const a = Number(amount);
  if (!Number.isFinite(a)) return { ok: false, error: 'Invalid sleepover amount.' };
  if (Math.abs(a - SLEEPOVER_FLAT_NIGHTLY) > 0.005) {
    return { ok: false, error: `Sleepover flat fee must be ${formatAud(SLEEPOVER_FLAT_NIGHTLY)} per NDIS price guide.` };
  }
  return { ok: true };
}

/**
 * @param opts {{ highIntensity?: boolean }}
 * @returns {{ ok: true, minimum: number, maximum: number } | { ok: false, error: string, minimum?: number, maximum?: number }}
 */
function validateParticipantOfferedHourlyRate(serviceType, startTimeIso, hourlyRate, opts = {}) {
  const rate = Number(hourlyRate);
  if (!Number.isFinite(rate) || rate < 0) {
    return { ok: false, error: 'Hourly rate must be a valid non-negative number.', minimum: 0, maximum: 0 };
  }
  if (rate === 0) {
    return { ok: true, minimum: 0, maximum: 0 };
  }
  const highIntensity = Boolean(opts.highIntensity);
  const minimum = getNdisMinimumHourlyRate(serviceType, startTimeIso);
  const maximum = getNdisMaximumHourlyRate(serviceType, startTimeIso, { highIntensity });
  if (rate + 1e-6 < minimum) {
    return {
      ok: false,
      minimum,
      maximum,
      error: `Hourly rate must be at least ${formatAud(minimum)} (NDIS minimum for this service and start time).`,
    };
  }
  if (rate > maximum + 1e-6) {
    return {
      ok: false,
      minimum,
      maximum,
      error: `Hourly rate cannot exceed ${formatAud(maximum)} (NDIS maximum for this service and start time${highIntensity ? ', high intensity' : ''}).`,
    };
  }
  return { ok: true, minimum, maximum };
}

export {
  TRAVEL_NON_LABOUR_PER_KM,
  SLEEPOVER_FLAT_NIGHTLY,
  GENERAL_MIN_HOURLY,
  HIGH_INTENSITY_WEEKDAY_DAYTIME_MAX,
  RATES,
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

const ndisParticipantRatesDefault = {
  TRAVEL_NON_LABOUR_PER_KM,
  SLEEPOVER_FLAT_NIGHTLY,
  GENERAL_MIN_HOURLY,
  HIGH_INTENSITY_WEEKDAY_DAYTIME_MAX,
  RATES,
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
export default ndisParticipantRatesDefault;
