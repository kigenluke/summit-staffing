/** Worker may clock in up to 15 minutes before scheduled start. Site GPS check is worldwide (100 m radius). */
export const EARLY_CLOCK_IN_GRACE_MS = 15 * 60 * 1000;
/** Worker may manually clock out any time after clock-in until this long after scheduled end. */
export const LATE_CLOCK_OUT_GRACE_MS = 15 * 60 * 1000;
/** System auto-closes forgotten sessions this long after scheduled end (cron backup). */
export const AUTO_FORCE_CLOSE_AFTER_END_MS = 2 * 60 * 60 * 1000;

function toMs(value) {
  if (value == null || value === '') return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function canClockInAt(now, shiftStartTime, shiftEndTime) {
  const nowMs = toMs(now);
  const startMs = toMs(shiftStartTime);
  const endMs = toMs(shiftEndTime);
  if (nowMs == null) return { ok: false, error: 'Invalid time' };
  if (endMs != null && nowMs > endMs) {
    return { ok: false, error: 'Shift window has ended. Clock-in is no longer available.' };
  }
  if (startMs != null && nowMs < startMs - EARLY_CLOCK_IN_GRACE_MS) {
    return {
      ok: false,
      error: 'You can only check into your shift 15 minutes prior to start time.',
      code: 'TOO_EARLY',
    };
  }
  return { ok: true };
}

export function canManualClockOutAt(now, shiftEndTime) {
  const nowMs = toMs(now);
  const endMs = toMs(shiftEndTime);
  if (nowMs == null) return { ok: false, error: 'Invalid time' };
  if (endMs == null) return { ok: true };
  if (nowMs > endMs + LATE_CLOCK_OUT_GRACE_MS) {
    return {
      ok: false,
      error:
        'Manual clock-out is only available until 15 minutes after your shift ends. '
        + 'Contact support if you still need to close this shift.',
      code: 'LATE_CLOCKOUT_WINDOW_CLOSED',
    };
  }
  return { ok: true };
}

/** Worker manual clock-out: any time after clock-in, including before scheduled shift end. */
export function canWorkerManualClockOut(now, shiftEndTime, clockInTime) {
  const windowCheck = canManualClockOutAt(now, shiftEndTime);
  if (!windowCheck.ok) return windowCheck;

  const nowMs = toMs(now);
  const inMs = toMs(clockInTime);
  if (inMs != null && nowMs != null && nowMs < inMs) {
    return { ok: false, error: 'Cannot clock out before you clocked in.', code: 'BEFORE_CLOCK_IN' };
  }

  return { ok: true };
}

export function shouldReconcileStaleShift(now, shiftEndTime) {
  const nowMs = toMs(now);
  const endMs = toMs(shiftEndTime);
  if (nowMs == null || endMs == null) return false;
  return nowMs > endMs;
}

export function shouldForceCloseForgottenShift(now, shiftEndTime) {
  const nowMs = toMs(now);
  const endMs = toMs(shiftEndTime);
  if (nowMs == null || endMs == null) return false;
  return nowMs >= endMs + AUTO_FORCE_CLOSE_AFTER_END_MS;
}

export function getPayrollClockOutTime(clockOutTime, shiftEndTime) {
  const clockOutMs = toMs(clockOutTime);
  const endMs = toMs(shiftEndTime);
  if (clockOutMs == null) return null;
  if (endMs == null) return new Date(clockOutMs);
  if (clockOutMs > endMs) return new Date(endMs);
  return new Date(clockOutMs);
}
