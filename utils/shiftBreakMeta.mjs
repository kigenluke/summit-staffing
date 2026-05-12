/** e.g. 7.5 → "7h 30m", 8 → "8h" (for clear paid-time display). */
function formatDecimalHoursAsHhMm(decimalHours) {
  if (!Number.isFinite(decimalHours) || decimalHours <= 0) return '0h';
  const totalMins = Math.round(decimalHours * 60);
  const hh = Math.floor(totalMins / 60);
  const mm = totalMins % 60;
  if (mm === 0) return `${hh}h`;
  return `${hh}h ${mm}m`;
}

/**
 * Parse break metadata stored in shift.description when posting a shift.
 * Format: "Break: 30 min | Paid break: Yes | Break pay: $12.00"
 */
function parseBreakFromShiftDescription(description) {
  const m = String(description || '').match(
    /Break:\s*(\d+)\s*min\s*\|\s*Paid break:\s*(Yes|No)(?:\s*\|\s*Break pay:\s*\$([0-9.]+))?/i
  );
  if (!m) {
    return { breakMinutes: 0, breakIsPaid: false, breakPay: 0 };
  }
  return {
    breakMinutes: Math.max(0, parseInt(m[1], 10) || 0),
    breakIsPaid: (m[2] || '').toLowerCase() === 'yes',
    breakPay: m[3] ? Math.max(0, parseFloat(m[3]) || 0) : 0,
  };
}

/**
 * Shift wall-clock hours; paid hours at hourly_rate; estimated total $.
 * Unpaid break minutes reduce paid hours. Paid break keeps full shift hours at rate; optional break pay is added.
 * Optional extras: NDIS sleepover flat (per night) and travel (non-labour, $/km) as separate components.
 *
 * @param billing {{ sleepoverFlatAmount?: number, travelKm?: number, travelRatePerKm?: number }}
 */
function getShiftPayEstimate(startTime, endTime, hourlyRate, description, billing = {}) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const shiftHours = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
  const rate = Math.max(0, Number(hourlyRate) || 0);
  const { breakMinutes, breakIsPaid, breakPay } = parseBreakFromShiftDescription(description);

  let paidHoursAtRate = shiftHours;
  if (breakMinutes > 0 && !breakIsPaid) {
    paidHoursAtRate = Math.max(0, shiftHours - breakMinutes / 60);
  }

  let labourSubtotal = paidHoursAtRate * rate;
  if (breakIsPaid && breakPay > 0) {
    labourSubtotal += breakPay;
  }

  const sleepoverFlatAmount = Math.max(0, Number(billing.sleepoverFlatAmount) || 0);
  const travelKm = Math.max(0, Number(billing.travelKm) || 0);
  const travelRatePerKm = Number(billing.travelRatePerKm);
  const perKm = Number.isFinite(travelRatePerKm) && travelRatePerKm >= 0 ? travelRatePerKm : 0.99;
  const travelCharge = Number((travelKm * perKm).toFixed(2));

  const estimatedTotal = Number((labourSubtotal + sleepoverFlatAmount + travelCharge).toFixed(2));

  return {
    shiftHours,
    paidHoursAtRate,
    /** Human-readable wall-clock span (roster length). */
    shiftDurationLabel: formatDecimalHoursAsHhMm(shiftHours),
    /** Human-readable paid time at hourly_rate (unpaid break excluded). */
    paidDurationLabel: formatDecimalHoursAsHhMm(paidHoursAtRate),
    breakMinutes,
    breakIsPaid,
    breakPay,
    labourSubtotal,
    sleepoverFlatAmount,
    travelKm,
    travelCharge,
    estimatedTotal,
  };
}

export { parseBreakFromShiftDescription, formatDecimalHoursAsHhMm, getShiftPayEstimate };

const shiftBreakMetaDefault = {
  parseBreakFromShiftDescription,
  formatDecimalHoursAsHhMm,
  getShiftPayEstimate,
};
export default shiftBreakMetaDefault;
