import { parseBreakFromShiftDescription } from './shiftBreakMeta.mjs';

const MS_PER_HOUR = 3600000;
/** Clock-in within 15 minutes of scheduled start counts as covering full shift for break logic. */
const SHIFT_START_TOLERANCE_MS = 15 * 60 * 1000;

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
 * Billable window: max(clock-in, shift start) → min(clock-out, scheduled shift end).
 * Early clock-out pays only until actual clock-out.
 * Late clock-out never pays beyond scheduled shift end.
 *
 * Unpaid break is deducted in proportion to time worked (same share of the shift
 * as wall-clock time), capped at the full-shift break. Early clock-out therefore
 * never pays more than completing the full scheduled shift.
 */
function proportionalUnpaidBreakHours(billableHours, scheduledHours, breakMinutes) {
  if (!breakMinutes || breakMinutes <= 0 || billableHours <= 0) return 0;
  const fullBreakHours = breakMinutes / 60;
  if (scheduledHours <= 0) return Math.min(fullBreakHours, billableHours);
  const workedFraction = Math.min(1, billableHours / scheduledHours);
  return fullBreakHours * workedFraction;
}

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

  if (breakMinutes > 0 && !breakIsPaid) {
    const breakDeduction = proportionalUnpaidBreakHours(
      billableHours,
      scheduledHours,
      breakMinutes,
    );
    paidHoursAtRate = Math.max(0, billableHours - breakDeduction);
    if (scheduledHours > 0) {
      const fullShiftPaidCap = Math.max(0, scheduledHours - breakMinutes / 60);
      paidHoursAtRate = Math.min(paidHoursAtRate, fullShiftPaidCap);
    }
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

export { computeBillableShiftHours, computeLabourPayout, proportionalUnpaidBreakHours };
