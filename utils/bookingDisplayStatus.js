/** Shared labels for booking / open-shift cards in participant & worker UI. */

export function getBookingEndMs(booking) {
  if (!booking?.end_time) return null;
  const ms = new Date(booking.end_time).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function isBookingPastEnd(booking) {
  const endMs = getBookingEndMs(booking);
  return endMs != null && endMs < Date.now();
}

export function getBookingDisplayStatus(booking) {
  const isOpenShift = Boolean(booking?.is_open_shift);
  const isPast = isBookingPastEnd(booking);
  const rawStatus = booking?.status || '';

  if (isOpenShift) {
    if (isPast) {
      return { key: 'expired', label: 'Expired', tone: 'muted' };
    }
    const apps = Number(booking.application_count) || 0;
    return {
      key: 'open',
      label: apps > 0 ? 'Awaiting worker' : 'Open shift',
      tone: 'warning',
    };
  }

  if (rawStatus === 'cancelled') {
    const isNoShow = String(booking.decline_reason || '').toLowerCase().includes('no-show');
    return { key: 'cancelled', label: isNoShow ? 'No-show' : 'Cancelled', tone: 'error' };
  }

  if (rawStatus === 'completed') {
    return { key: 'completed', label: 'Completed', tone: 'success' };
  }

  if (rawStatus === 'in_progress') {
    return { key: 'in_progress', label: 'In progress', tone: 'primary' };
  }

  if (isPast && rawStatus === 'confirmed') {
    return { key: 'expired', label: 'Expired', tone: 'warning' };
  }

  if (isPast && rawStatus === 'pending') {
    return { key: 'past', label: 'Past', tone: 'muted' };
  }

  if (rawStatus === 'confirmed') {
    return { key: 'confirmed', label: 'Confirmed', tone: 'success' };
  }

  if (rawStatus === 'pending') {
    return { key: 'pending', label: 'Pending', tone: 'warning' };
  }

  return { key: rawStatus || 'unknown', label: String(rawStatus || 'Unknown').replace(/_/g, ' '), tone: 'muted' };
}

/** Home screen: only upcoming / active items — not expired open shifts or old stale rows. */
export function isHomeUpcomingBooking(booking) {
  if (!booking) return false;
  if (booking.status === 'completed' || booking.status === 'cancelled') return false;
  if (isBookingPastEnd(booking)) return false;
  if (booking.is_open_shift) return true;
  return ['pending', 'confirmed', 'in_progress'].includes(booking.status);
}

export function navigateToBookingOrShift(navigation, booking) {
  if (!booking?.id) return;
  if (booking.is_open_shift) {
    navigation.navigate('AvailableShifts', { focusShiftId: booking.id });
    return;
  }
  navigation.navigate('BookingDetail', { bookingId: booking.id });
}

export const STATUS_TONE_COLORS = {
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  primary: '#06B6D4',
  muted: '#94A3B8',
};
