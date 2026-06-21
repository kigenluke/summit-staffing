import { parseBreakFromShiftDescription } from './shiftBreakMeta.mjs';

const MS_PER_HOUR = 3600000;
/** Clock-in may be up to 1 minute after scheduled start and still count as full shift coverage. */
const SHIFT_START_TOLERANCE_MS = 60000;

function toMs(value) {
  if (value == null || value === '') return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function hoursBetweenMs(startMs, endMs) {
  return Math.max(0, (endMs - startMs) / MS_PER_HOUR);
}

/**
 * Paid shift hours for timesheet / payout.
 *
 * Billable window: clock-in → min(clock-out, scheduled shift end).
 * Early clock-out pays only until actual clock-out.
 * Late clock-out never pays beyond scheduled shift end.
 *
 * Unpaid break reduces paid hours when the worker covers the full scheduled shift
 * (clock-in at/before shift start, billable end at shift end).
 */
function computeBillableShiftHours({
  clockInTime,
  clockOutTime,
  shiftStartTime,
  shiftEndTime,
  shiftDescription,
}) {
  const clockInMs = toMs(clockInTime);
  const clockOutMs = toMs(clockOutTime);
  const shiftStartMs = toMs(shiftStartTime);
  const shiftEndMs = toMs(shiftEndTime);

  if (clockInMs == null || clockOutMs == null || clockOutMs <= clockInMs) {
    return {
      billableHours: 0,
      paidHoursAtRate: 0,
      breakMinutes: 0,
      breakIsPaid: false,
      breakPay: 0,
    };
  }

  let billableStartMs = clockInMs;
  if (shiftStartMs != null && billableStartMs < shiftStartMs) {
    billableStartMs = shiftStartMs;
  }

  let billableEndMs = clockOutMs;
  if (shiftEndMs != null && billableEndMs > shiftEndMs) {
    billableEndMs = shiftEndMs;
  }

  if (billableEndMs <= billableStartMs) {
    return {
      billableHours: 0,
      paidHoursAtRate: 0,
      breakMinutes: 0,
      breakIsPaid: false,
      breakPay: 0,
    };
  }

  const billableHours = hoursBetweenMs(billableStartMs, billableEndMs);
  const scheduledHours =
    shiftStartMs != null && shiftEndMs != null && shiftEndMs > shiftStartMs
      ? hoursBetweenMs(shiftStartMs, shiftEndMs)
      : billableHours;

  const { breakMinutes, breakIsPaid, breakPay } = parseBreakFromShiftDescription(shiftDescription);

  const coveredFullScheduledShift =
    shiftStartMs != null
    && shiftEndMs != null
    && billableStartMs <= shiftStartMs + SHIFT_START_TOLERANCE_MS
    && billableEndMs >= shiftEndMs - 1000;

  let paidHoursAtRate = billableHours;
  let appliedBreakPay = 0;

  if (coveredFullScheduledShift && breakMinutes > 0 && !breakIsPaid) {
    paidHoursAtRate = Math.max(0, scheduledHours - breakMinutes / 60);
  } else if (coveredFullScheduledShift && breakIsPaid) {
    paidHoursAtRate = scheduledHours;
    appliedBreakPay = breakPay;
  }

  return {
    billableHours: Number(billableHours.toFixed(4)),
    paidHoursAtRate: Number(paidHoursAtRate.toFixed(4)),
    breakMinutes,
    breakIsPaid,
    breakPay: appliedBreakPay,
  };
}

function computeLabourPayout({ hourlyRate, ...shiftInput }) {
  const rate = Math.max(0, Number(hourlyRate) || 0);
  const { paidHoursAtRate, breakPay } = computeBillableShiftHours(shiftInput);
  const labourSubtotal = Number((paidHoursAtRate * rate + breakPay).toFixed(2));
  return { paidHoursAtRate, breakPay, labourSubtotal };
}

export { computeBillableShiftHours, computeLabourPayout };
