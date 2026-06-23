/**
 * Summit Staffing – Booking Detail Screen
 * Shows full booking info, clock in/out (worker), leave review (participant), invoice/payment
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, Alert, TextInput, ActivityIndicator, Platform, Modal } from 'react-native';
import { useAuthStore } from '../store/authStore.js';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';
import { formatDateDMY, formatTime12h, formatDateTimeDMY } from '../utils/dateFormat.js';
import { workerPayoutFromTotal } from '../utils/platformFee.js';
import { getDeviceLocation, getDeviceLocationForClock, requestLocationPermission, promptOpenLocationSettings, startLocationWatch, stopLocationWatch } from '../utils/deviceGeolocation';
import { StripePayBookingButton } from '../components/StripePayBookingButton';
import { LoadErrorBanner } from '../components/LoadErrorBanner.js';
import { saveShiftGps, readShiftGps, clearShiftGps } from '../utils/shiftGpsCache.js';
import { alertApiError, confirmUserAction, showUserAlert } from '../utils/userAlert.js';
import { CLOCK_SITE_RADIUS_METERS } from '../utils/gpsHelper.js';

const CLOCK_API_OPTS = { timeoutMs: 60000, retries: 2 };
const EARLY_CLOCK_IN_MS = 15 * 60 * 1000;
const LATE_CLOCK_OUT_MS = 15 * 60 * 1000;

const STATUS_THEME = {
  pending: { bg: '#FFFBEB', text: '#B45309', border: '#FDE68A', dot: Colors.status.warning },
  confirmed: { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0', dot: Colors.status.success },
  in_progress: { bg: '#ECFEFF', text: '#0E7490', border: '#A5F3FC', dot: Colors.primary },
  completed: { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', dot: Colors.primaryDark },
  cancelled: { bg: '#FEF2F2', text: '#B91C1C', border: '#FECACA', dot: Colors.status.error },
};

const formatStatusLabel = (status) =>
  (status || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const formatWorkerDistance = (meters) => {
  if (meters == null || !Number.isFinite(meters)) return null;
  if (meters > 500000) {
    return {
      short: 'Location not detected',
      detail: 'Enable GPS on this device — distance cannot be calculated accurately.',
      withinRange: false,
      unreliable: true,
    };
  }
  const withinRange = meters <= CLOCK_SITE_RADIUS_METERS;
  const radiusLabel = `${CLOCK_SITE_RADIUS_METERS} m`;
  if (meters >= 1000) {
    return {
      short: `${(meters / 1000).toFixed(1)} km from site`,
      detail: withinRange ? 'Within clock-in range' : `Move within ${radiusLabel} of the shift site to clock in`,
      withinRange,
      unreliable: false,
    };
  }
  return {
    short: `${Math.round(meters)} m from site`,
    detail: withinRange ? 'Within clock-in range' : `Move within ${radiusLabel} of the shift site to clock in`,
    withinRange,
    unreliable: false,
  };
};

const StatusBadge = ({ status }) => {
  const theme = STATUS_THEME[status] || {
    bg: Colors.surfaceSecondary,
    text: Colors.text.secondary,
    border: Colors.border,
    dot: Colors.text.muted,
  };
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: theme.bg,
        borderWidth: 1,
        borderColor: theme.border,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: Radius.full,
        gap: 6,
      }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: theme.dot }} />
      <Text style={{
        color: theme.text,
        fontWeight: Typography.fontWeight.semibold,
        fontSize: Typography.fontSize.xs,
        letterSpacing: 0.3,
      }}>
        {formatStatusLabel(status)}
      </Text>
    </View>
  );
};

const DetailRow = ({ label, value, highlight, last, selectable }) => (
  <View style={{
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: 11,
    borderBottomWidth: last ? 0 : 1,
    borderBottomColor: Colors.borderLight,
  }}>
    <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, flex: 0.9 }}>{label}</Text>
    <Text
      selectable={Boolean(selectable)}
      style={{
        fontSize: Typography.fontSize.sm,
        color: highlight ? Colors.primaryDark : Colors.text.primary,
        flex: 1.1,
        textAlign: 'right',
        fontWeight: highlight ? Typography.fontWeight.semibold : Typography.fontWeight.normal,
        lineHeight: 20,
      }}
    >
      {value || '—'}
    </Text>
  </View>
);

const AlertBanner = ({ tone = 'info', title, message }) => {
  const tones = {
    info: { bg: '#EFF6FF', border: '#BFDBFE', title: '#1E40AF', body: '#1D4ED8' },
    warning: { bg: '#FFFBEB', border: '#FDE68A', title: '#92400E', body: '#B45309' },
    success: { bg: '#ECFDF5', border: '#A7F3D0', title: '#065F46', body: '#047857' },
    error: { bg: '#FEF2F2', border: '#FECACA', title: '#991B1B', body: '#B91C1C' },
  };
  const t = tones[tone] || tones.info;
  return (
    <View style={{
      backgroundColor: t.bg,
      borderRadius: Radius.md,
      padding: Spacing.md,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: t.border,
    }}>
      {!!title && (
        <Text style={{ color: t.title, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.sm, marginBottom: 4 }}>
          {title}
        </Text>
      )}
      {!!message && (
        <Text style={{ color: t.body, fontSize: Typography.fontSize.sm, lineHeight: 20 }}>
          {message}
        </Text>
      )}
    </View>
  );
};

const Section = ({ title, children, style, subtitle }) => (
  <View style={[{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadows.sm, borderWidth: 1, borderColor: Colors.borderLight }, style]}>
    <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>
      {title}
    </Text>
    {!!subtitle && (
      <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginTop: 2, marginBottom: Spacing.sm }}>
        {subtitle}
      </Text>
    )}
    {!subtitle && <View style={{ height: Spacing.sm }} />}
    {children}
  </View>
);
const distanceMeters = (lat1, lon1, lat2, lon2) => {
  const toRad = (deg) => (Number(deg) * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(Number(lat2) - Number(lat1));
  const dLon = toRad(Number(lon2) - Number(lon1));
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export function BookingDetailScreen({ route, navigation }) {
  const { bookingId } = route.params;
  const { user } = useAuthStore();
  const isWorker = user?.role === 'worker';
  const isCoordinator = user?.role === 'coordinator';
  const isParticipant = user?.role === 'participant';
  const canPayForBooking = isParticipant;
  const [timesheetActionBusy, setTimesheetActionBusy] = useState(false);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [reloadBusy, setReloadBusy] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [incidentReported, setIncidentReported] = useState(false);
  const [incidentDetails, setIncidentDetails] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [geoStatus, setGeoStatus] = useState('');
  const [currentGps, setCurrentGps] = useState(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [clockActionBusy, setClockActionBusy] = useState(false);
  const [clockActionLabel, setClockActionLabel] = useState('');
  const [bookingActionBusy, setBookingActionBusy] = useState(false);
  const [disputeModalVisible, setDisputeModalVisible] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');

  const clockInBusyRef = useRef(false);
  const clockOutBusyRef = useRef(false);
  const gpsFetchedAtRef = useRef(0);
  const currentGpsRef = useRef(null);
  const locationWatchIdRef = useRef(null);

  const rememberGps = useCallback((gps) => {
    setCurrentGps(gps);
    currentGpsRef.current = gps;
    gpsFetchedAtRef.current = Date.now();
    if (bookingId && gps?.lat != null && gps?.lng != null) {
      saveShiftGps(bookingId, gps);
    }
  }, [bookingId]);

  const loadBooking = useCallback(async () => {
    setLoadError(null);
    try {
      const { data, error } = await api.get(`/api/bookings/${bookingId}`, { retries: 2 });
      if (error) {
        setLoadError(error.message || 'Could not load this booking. Check your connection and try again.');
        setLoading(false);
        return;
      }
      if (data?.ok) {
        const b = data.booking;
        if (data.timesheet) b.timesheet = data.timesheet;
        if (data.payment) b.payment = data.payment;
        if (data.user_review) b.user_review = data.user_review;
        setBooking(b);
      } else {
        setLoadError('Could not load this booking.');
      }
    } catch (e) {
      setLoadError(e?.message || 'Could not load this booking.');
    }
    setLoading(false);
  }, [bookingId]);

  const retryLoadBooking = useCallback(async () => {
    setReloadBusy(true);
    setLoading(true);
    await loadBooking();
    setReloadBusy(false);
  }, [loadBooking]);

  useEffect(() => { loadBooking(); }, [loadBooking]);

  useEffect(() => {
    let alive = true;
    readShiftGps(bookingId).then((stored) => {
      if (!alive || !stored || currentGpsRef.current) return;
      rememberGps({ lat: stored.lat, lng: stored.lng });
    });
    return () => { alive = false; };
  }, [bookingId, rememberGps]);

  // Wake Railway before clock actions so the first tap is less likely to time out.
  useEffect(() => {
    if (!isWorker) return;
    if (!booking?.status || !['confirmed', 'in_progress'].includes(booking.status)) return;
    api.get('/health', { timeoutMs: 15000, retries: 1 }).catch(() => {});
  }, [isWorker, booking?.status]);

  // After Stripe Checkout redirect (?payment=success), sync payment + worker transfer.
  useEffect(() => {
    const paymentFlag =
      route.params?.payment ||
      (Platform.OS === 'web' && typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('payment')
        : null);
    if (paymentFlag !== 'success' || !canPayForBooking) return;

    let cancelled = false;
    (async () => {
      const { data, error } = await api.post('/api/payments/sync-booking', { bookingId });
      if (cancelled) return;
      if (data?.ok) {
        loadBooking();
      } else if (error?.message) {
        // Payment may still be processing — cron/webhook will retry transfer.
        console.warn('[payment-sync]', error.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId, canPayForBooking, loadBooking, route.params?.payment]);

  const handleAction = async (action) => {
    const map = {
      accept: { path: `/api/bookings/${bookingId}/accept`, method: 'put', label: 'Accept' },
      decline: { path: `/api/bookings/${bookingId}/decline`, method: 'put', label: 'Decline' },
      cancel: { path: `/api/bookings/${bookingId}/cancel`, method: 'put', label: 'Cancel' },
      complete: { path: `/api/bookings/${bookingId}/complete`, method: 'put', label: 'Complete' },
    };
    const a = map[action];
    const runAction = async (body) => {
      if (bookingActionBusy) return;
      setBookingActionBusy(true);
      try {
        const { error } = await api[a.method](a.path, body, { retries: 1 });
        if (error) {
          showUserAlert('Error', error.message);
          return;
        }
        if (action === 'cancel') {
          showUserAlert('Deleted', 'Old shift removed from your list.');
          if (typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.navigate('MainTabs', { screen: 'Bookings' });
          }
          return;
        }
        loadBooking();
      } finally {
        setBookingActionBusy(false);
      }
    };

    if (action === 'decline') {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const reason = window.prompt('Reason for decline (optional):', '') || '';
        await runAction({ reason: reason.trim() || undefined });
        return;
      }
      Alert.alert('Decline booking', 'Select a reason', [
        { text: 'Not available', onPress: () => runAction({ reason: 'Not available at requested time' }) },
        { text: 'Out of service area', onPress: () => runAction({ reason: 'Out of service area' }) },
        { text: 'Rate mismatch', onPress: () => runAction({ reason: 'Rate does not match required service level' }) },
        { text: 'No reason', style: 'destructive', onPress: () => runAction({}) },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }

    if (action === 'cancel') {
      confirmUserAction(
        'Delete old shift',
        'Remove this expired shift from your list?',
        () => { runAction(); },
        { confirmLabel: 'Delete' },
      );
      return;
    }

    confirmUserAction(
      'Confirm',
      `${a.label} this booking?`,
      () => { runAction(); },
      { confirmLabel: 'Yes' },
    );
  };

  const refreshWorkerGps = useCallback(async () => {
    setLocationBusy(true);
    try {
      const gps = await getDeviceLocation({ requestPermission: true });
      rememberGps(gps);
      setGeoStatus('');
      return gps;
    } catch (e) {
      setCurrentGps(null);
      currentGpsRef.current = null;
      gpsFetchedAtRef.current = 0;
      setGeoStatus(e?.message || 'Could not read your location.');
      return null;
    } finally {
      setLocationBusy(false);
    }
  }, [rememberGps]);

  const resolveClockGps = useCallback(async (statusLabel, { forClockOut = false, siteLat = null, siteLng = null } = {}) => {
    setClockActionLabel(statusLabel);
    const cached = currentGpsRef.current
      ? { ...currentGpsRef.current, fetchedAt: gpsFetchedAtRef.current }
      : null;

    try {
      const gps = await getDeviceLocationForClock({ cached, forClockOut });
      if (
        siteLat != null
        && siteLng != null
        && cached?.lat != null
        && cached?.lng != null
      ) {
        const freshDist = distanceMeters(gps.lat, gps.lng, siteLat, siteLng);
        const cachedDist = distanceMeters(cached.lat, cached.lng, siteLat, siteLng);
        // Browser can return a coarse/wrong fix on click while the UI already shows in-range coords.
        if (cachedDist <= CLOCK_SITE_RADIUS_METERS && freshDist > CLOCK_SITE_RADIUS_METERS) {
          const useCached = { lat: cached.lat, lng: cached.lng };
          rememberGps(useCached);
          return useCached;
        }
      }
      rememberGps(gps);
      return gps;
    } catch (err) {
      const stored = await readShiftGps(bookingId, forClockOut ? 8 * 60 * 60 * 1000 : 4 * 60 * 60 * 1000);
      if (stored) {
        const gps = { lat: stored.lat, lng: stored.lng, usedStoredShiftGps: true };
        rememberGps(gps);
        return gps;
      }
      throw err;
    }
  }, [bookingId, rememberGps]);

  const showLocationFailure = useCallback((actionLabel, retryFn) => {
    Alert.alert(
      'Location needed',
      `${actionLabel} needs your location. Turn on GPS in Settings, move near a window, then try again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => { try { promptOpenLocationSettings(); } catch (_) {} } },
        { text: 'Retry', onPress: () => { retryFn(); } },
      ],
    );
  }, []);

  const tryClockIn = useCallback(
    async (mode) => {
      if (clockInBusyRef.current) return;
      if (!bookingId) return;

      clockInBusyRef.current = true;
      if (mode !== 'auto') {
        setClockActionBusy(true);
        setClockActionLabel('Connecting…');
      }
      try {
        await api.get('/health', { timeoutMs: 15000, retries: 1 }).catch(() => {});
        const gps = await resolveClockGps(
          mode === 'auto' ? 'Waiting for GPS…' : 'Getting your location…',
          {
            forClockOut: false,
            siteLat: booking?.location_lat,
            siteLng: booking?.location_lng,
          },
        );
        setClockActionLabel('Clocking in…');
        const { data, error } = await api.post(
          `/api/bookings/${bookingId}/clock-in`,
          { lat: gps.lat, lng: gps.lng },
          CLOCK_API_OPTS,
        );
        if (error) {
          const msg = String(error.message || '');
          if (/already clocked in/i.test(msg)) {
            setGeoStatus('');
            await loadBooking();
            if (mode === 'manual') {
              showUserAlert('Already clocked in', 'Your shift is already running.');
            }
            return;
          }
          if (mode !== 'auto') showUserAlert('Error', error.message);
          else setGeoStatus(error.message);
          return;
        }

        setGeoStatus('');
        if (mode === 'manual') showUserAlert('Success', 'Clocked in!');
        await loadBooking();
      } catch (e) {
        const msg = String(e?.message || '');
        if (mode !== 'auto' && /timeout|location|gps|permission/i.test(msg)) {
          showLocationFailure('Clock in', () => tryClockIn('manual'));
        } else if (mode !== 'auto') {
          showUserAlert('Error', msg || 'Failed to clock in');
        } else {
          setGeoStatus(msg || 'Waiting for GPS…');
        }
      } finally {
        clockInBusyRef.current = false;
        if (mode !== 'auto') {
          setClockActionBusy(false);
          setClockActionLabel('');
        }
      }
    },
    [bookingId, booking?.location_lat, booking?.location_lng, loadBooking, resolveClockGps, showLocationFailure],
  );

  const tryClockOut = useCallback(
    async (mode) => {
      if (clockOutBusyRef.current) return;
      if (!bookingId) return;

      clockOutBusyRef.current = true;
      if (mode !== 'auto') {
        setClockActionBusy(true);
        setClockActionLabel('Connecting…');
      }
      try {
        await api.get('/health', { timeoutMs: 15000, retries: 1 }).catch(() => {});
        const gps = await resolveClockGps(
          mode === 'auto' ? 'Waiting for GPS…' : 'Getting your location…',
          {
            forClockOut: true,
            siteLat: booking?.location_lat,
            siteLng: booking?.location_lng,
          },
        );
        setClockActionLabel('Clocking out…');
        const useScheduledEndTime = mode === 'auto';
        const { data, error } = await api.post(
          `/api/bookings/${bookingId}/clock-out`,
          {
            lat: gps.lat,
            lng: gps.lng,
            useScheduledEndTime,
            mode,
          },
          CLOCK_API_OPTS,
        );

        if (error) {
          const msg = String(error.message || '');
          if (mode !== 'auto') showUserAlert('Could not clock out', error.message);
          else setGeoStatus(error.message);
          if (/already clocked out/i.test(msg)) {
            await loadBooking();
          }
          return;
        }

        setGeoStatus('');
        if (mode === 'manual') {
          showUserAlert(
            'Success',
            data?.already_clocked_out ? 'Shift was already clocked out.' : 'Clocked out! Shift marked complete.',
          );
        }
        await clearShiftGps(bookingId);
        await loadBooking();
      } catch (e) {
        const msg = String(e?.message || '');
        if (mode !== 'auto' && /timeout|location|gps|permission/i.test(msg)) {
          showLocationFailure('Clock out', () => tryClockOut('manual'));
        } else if (mode !== 'auto') {
          showUserAlert('Error', msg || 'Failed to clock out');
        } else {
          setGeoStatus(msg || 'Waiting for GPS…');
        }
      } finally {
        clockOutBusyRef.current = false;
        if (mode !== 'auto') {
          setClockActionBusy(false);
          setClockActionLabel('');
        }
      }
    },
    [bookingId, booking?.location_lat, booking?.location_lng, loadBooking, resolveClockGps, showLocationFailure],
  );

  const handleEnableLocation = async () => {
    const ok = await requestLocationPermission();
    if (!ok && Platform.OS === 'android') {
      promptOpenLocationSettings();
      return;
    }
    await refreshWorkerGps();
  };

  const handleClockIn = () => {
    if (clockActionBusy || clockInBusyRef.current) return;
    if (!canManualClockIn) {
      showUserAlert('Clock In unavailable', clockInDisabledReason || 'Clock-in is not available yet.');
      return;
    }
    confirmUserAction(
      'Clock In',
      'Clock in to this booking?',
      () => { tryClockIn('manual'); },
      { confirmLabel: 'Clock In' },
    );
  };

  const handleClockOut = () => {
    if (clockActionBusy || clockOutBusyRef.current) return;
    if (!canManualClockOut) {
      showUserAlert('Clock Out unavailable', clockOutDisabledReason || 'Clock-out is not available right now.');
      return;
    }
    confirmUserAction(
      'Clock Out',
      'End your shift now? You can clock out before the scheduled end time. Pay is based on hours from clock-in until you clock out.',
      () => { tryClockOut('manual'); },
      { confirmLabel: 'Clock Out' },
    );
  };

  // Keep refreshing worker GPS while booking is confirmed to decide whether Clock In can be enabled.
  useEffect(() => {
    if (!isWorker) return;
    const shouldTrack = booking?.status === 'confirmed'
      && !booking?.timesheet?.clock_in_time
      && (!booking?.end_time || Date.now() < new Date(booking.end_time).getTime());
    if (!shouldTrack) return;

    let alive = true;
    let timer = null;
    const tick = async () => {
      try {
        const gps = await getDeviceLocation({ requestPermission: false });
        if (alive) {
          rememberGps(gps);
          setGeoStatus('');
        }
      } catch (_) {
        if (alive) setGeoStatus('Waiting for GPS fix…');
      }
    };
    (async () => {
      await requestLocationPermission();
      tick();
    })();
    timer = setInterval(tick, 15000);

    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [isWorker, booking?.status, booking?.timesheet?.clock_in_time, rememberGps]);

  // Keep GPS warm during an active shift so clock-out does not wait for a cold GPS fix.
  useEffect(() => {
    if (!isWorker) return;
    const shouldWatch = booking?.status === 'in_progress' && !booking?.timesheet?.clock_out_time;
    if (!shouldWatch) {
      stopLocationWatch(locationWatchIdRef.current);
      locationWatchIdRef.current = null;
      return undefined;
    }

    (async () => {
      await requestLocationPermission();
    })();

    locationWatchIdRef.current = startLocationWatch(
      (coords) => {
        rememberGps(coords);
        setGeoStatus('');
      },
      () => {},
    );

    return () => {
      stopLocationWatch(locationWatchIdRef.current);
      locationWatchIdRef.current = null;
    };
  }, [isWorker, booking?.status, booking?.timesheet?.clock_out_time, rememberGps]);

  const handleReview = async () => {
    if (incidentReported && incidentDetails.trim().length < 5) {
      Alert.alert('Incident details required', 'Please add at least 5 characters in incident details.');
      return;
    }

    setSubmittingReview(true);
    const { error } = await api.post('/api/reviews', {
      bookingId,
      rating: reviewRating,
      comment: reviewComment.trim() || undefined,
      incidentReported,
      incidentDetails: incidentReported ? incidentDetails.trim() : undefined,
    });
    if (error) Alert.alert('Error', error.message);
    else {
      Alert.alert('Success', 'Review submitted!');
      setShowReview(false);
      setIncidentReported(false);
      setIncidentDetails('');
      setReviewComment('');
      loadBooking();
    }
    setSubmittingReview(false);
  };

  const handleGenerateInvoice = async () => {
    if (generatingInvoice) return;
    setGeneratingInvoice(true);
    try {
      const { data, error } = await api.post(`/api/invoices/generate/${bookingId}`, null, { timeoutMs: 120000, retries: 1 });
      if (error) alertApiError(error, 'Could not generate invoice');
      else Alert.alert('Success', `Invoice ${data?.invoice?.invoice_number || ''} generated!`);
    } finally {
      setGeneratingInvoice(false);
    }
  };

  const handleAuthorizeCard = async () => {
    setTimesheetActionBusy(true);
    const { data, error } = await api.post('/api/payments/booking/authorize', { bookingId });
    setTimesheetActionBusy(false);
    if (error) Alert.alert('Card authorization', error.message);
    else if (data?.requires_card) {
      Alert.alert('Save a card first', 'Go to Profile → Payment Details and save a card via Stripe, then try again.');
    } else {
      Alert.alert('Authorized', 'Your card is on hold for this booking. Payment captures when the timesheet is approved.');
      loadBooking();
    }
  };

  const handleApproveTimesheet = async () => {
    Alert.alert('Approve timesheet', 'Approve hours and trigger payment / invoicing?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: async () => {
          setTimesheetActionBusy(true);
          const { error } = await api.post(`/api/bookings/${bookingId}/timesheet/approve`);
          setTimesheetActionBusy(false);
          if (error) Alert.alert('Error', error.message);
          else {
            Alert.alert('Approved', 'Timesheet approved. Payment or invoice processing has started.');
            loadBooking();
          }
        },
      },
    ]);
  };

  const submitDispute = async (reason) => {
    if (!reason || reason.trim().length < 3) {
      Alert.alert('Reason required', 'Please describe the issue (at least 3 characters).');
      return;
    }
    setTimesheetActionBusy(true);
    const { error } = await api.post(`/api/bookings/${bookingId}/timesheet/dispute`, { reason: reason.trim() });
    setTimesheetActionBusy(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setDisputeModalVisible(false);
    setDisputeReason('');
    Alert.alert('Dispute lodged', 'Auto-approval is paused while we review.');
    loadBooking();
  };

  const handleDisputeTimesheet = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const reason = window.prompt('Why are you disputing this timesheet?', '');
      submitDispute(reason || '');
      return;
    }
    if (Platform.OS === 'ios' && Alert.prompt) {
      Alert.prompt('Dispute timesheet', 'Describe the issue with logged hours', submitDispute);
      return;
    }
    setDisputeReason('');
    setDisputeModalVisible(true);
  };

  if (loading) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>;
  }

  if (!booking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background, padding: Spacing.lg }}>
        {loadError ? (
          <>
            <LoadErrorBanner message={loadError} onRetry={retryLoadBooking} retrying={reloadBusy} />
            <Text style={{ color: Colors.text.secondary, textAlign: 'center' }}>
              Pull down to refresh or tap Retry when your connection is stable.
            </Text>
          </>
        ) : (
          <Text style={{ color: Colors.text.secondary }}>Booking not found</Text>
        )}
      </View>
    );
  }

  const b = booking;
  const ts = b.timesheet;
  const hasClockedOut = Boolean(ts?.clock_out_time);

  const isPendingAcceptance = isWorker && (b.status === 'pending' || b.status === 'confirmed');
  const bookingHasGps = b.location_lat != null && b.location_lng != null;
  const startMs = b.start_time ? new Date(b.start_time).getTime() : null;
  const endMs = b.end_time ? new Date(b.end_time).getTime() : null;
  const nowMs = Date.now();
  const isClockInWindowOpen = startMs == null ? true : nowMs >= startMs - EARLY_CLOCK_IN_MS;
  const isShiftWindowOpen = endMs == null ? true : nowMs < endMs;
  const isShiftExpired = endMs != null && nowMs >= endMs;
  const isManualClockOutWindowOpen = endMs == null ? true : nowMs <= endMs + LATE_CLOCK_OUT_MS;

  const workerDistanceM = bookingHasGps && currentGps
    ? distanceMeters(currentGps.lat, currentGps.lng, b.location_lat, b.location_lng)
    : null;
  const isWithinClockInRadius = workerDistanceM != null ? workerDistanceM <= CLOCK_SITE_RADIUS_METERS : false;
  const isWithinClockOutRadius = workerDistanceM != null ? workerDistanceM <= CLOCK_SITE_RADIUS_METERS : false;

  const canClockOut = isWorker && b.status === 'in_progress' && !hasClockedOut && isManualClockOutWindowOpen;
  const canManualClockOut = canClockOut && bookingHasGps && isWithinClockOutRadius;

  const clockOutDisabledReason = (() => {
    if (!(isWorker && b.status === 'in_progress' && !hasClockedOut)) return '';
    if (!isManualClockOutWindowOpen) {
      return 'Manual clock-out is only available until 15 minutes after your shift ends. Contact support if you still need to close this shift.';
    }
    if (!bookingHasGps) return 'Booking location is not set.';
    if (workerDistanceM == null) return 'Enable location below to share GPS for clock-out.';
    if (!isWithinClockOutRadius) {
      const dist = formatWorkerDistance(workerDistanceM);
      if (dist?.unreliable) return 'GPS signal unavailable. Enable location on this device to clock out.';
      return `${dist?.short || 'Too far from site'}. Move within ${CLOCK_SITE_RADIUS_METERS} m of the shift site to clock out.`;
    }
    return '';
  })();
  const canMarkComplete = isWorker && b.status === 'in_progress' && hasClockedOut;
  const canManualClockIn = isWorker
    && b.status === 'confirmed'
    && isClockInWindowOpen
    && isShiftWindowOpen
    && bookingHasGps
    && isWithinClockInRadius;

  const clockInDisabledReason = (() => {
    if (!(isWorker && b.status === 'confirmed')) return '';
    if (isShiftExpired) return 'Shift window has ended. Clock-in is no longer available.';
    if (!bookingHasGps) return 'Booking location is not set.';
    if (!isClockInWindowOpen && startMs != null) {
      const earliest = new Date(startMs - EARLY_CLOCK_IN_MS);
      return `You can check in from ${earliest.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (15 minutes before start).`;
    }
    if (workerDistanceM == null) return 'Enable location below to share GPS for clock-in.';
    if (!isWithinClockInRadius) {
      const dist = formatWorkerDistance(workerDistanceM);
      if (dist?.unreliable) return 'GPS signal unavailable. Enable location on this device to clock in.';
      return `${dist?.short || 'Too far from site'}. Move within ${CLOCK_SITE_RADIUS_METERS} m of the shift site to clock in.`;
    }
    return '';
  })();
  const statusMessage = (isWorker && b.status === 'confirmed')
    ? clockInDisabledReason
    : geoStatus;
  const canWorkerCancelPast = isWorker
    && (b.status === 'pending' || b.status === 'confirmed')
    && b.end_time
    && (new Date(b.end_time).getTime() < nowMs);
  const canParticipantCancelPast = !isWorker
    && (b.status === 'pending' || b.status === 'confirmed')
    && b.end_time
    && (new Date(b.end_time).getTime() < nowMs);

  const isPrivatePayPipeline = b.payment_pipeline === 'private_pay';
  const isFundedPipeline = b.payment_pipeline === 'funded';
  const tsApproval = ts?.approval_status;
  const canReviewTimesheet = isParticipant && tsApproval === 'pending_review' && !!ts?.clock_out_time;
  const isBookingPaid =
    b.payment?.status === 'succeeded' || b.authorization_status === 'captured';
  const showLegacyPayButton =
    canPayForBooking
    && (b.status === 'confirmed' || b.status === 'completed')
    && !isPrivatePayPipeline
    && !isFundedPipeline
    && !isBookingPaid;
  const hasUserReview = Boolean(b.user_review);
  const canAddReview = b.status === 'completed' && !hasUserReview && !showReview;
  const needsCardAuthorization =
    isParticipant && isPrivatePayPipeline && b.authorization_status === 'required' && b.status === 'confirmed';

  const distanceInfo = workerDistanceM != null ? formatWorkerDistance(workerDistanceM) : null;
  const shiftDurationH = b.start_time && b.end_time
    ? ((new Date(b.end_time) - new Date(b.start_time)) / (1000 * 60 * 60)).toFixed(1)
    : null;
  const payoutLabel = isWorker ? workerPayoutFromTotal(b.total_amount) : Number(b.total_amount || 0);

  const alertTone = isShiftExpired && isWorker && b.status === 'confirmed'
    ? 'warning'
    : distanceInfo && !distanceInfo.withinRange && isWorker && b.status === 'confirmed' && !isShiftExpired
      ? 'warning'
      : distanceInfo?.withinRange
        ? 'success'
        : 'info';

  return (
    <>
    <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xxl }}>
      {/* Hero summary */}
      <View style={{
        backgroundColor: Colors.surface,
        borderRadius: Radius.lg,
        padding: Spacing.lg,
        marginBottom: Spacing.md,
        ...Shadows.sm,
        borderWidth: 1,
        borderColor: Colors.borderLight,
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, lineHeight: 26 }}>
              {b.service_type || 'Shift'}
            </Text>
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 4 }}>
              {formatDateDMY(b.start_time)}
              {b.start_time && b.end_time ? ` · ${formatTime12h(b.start_time)} – ${formatTime12h(b.end_time)}` : ''}
            </Text>
            {shiftDurationH && (
              <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginTop: 2 }}>
                {shiftDurationH} hr shift
              </Text>
            )}
          </View>
          <StatusBadge status={b.status} />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md }}>
          <View style={{ backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8, flex: 1, minWidth: '45%' }}>
            <Text style={{ fontSize: 11, color: Colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>Rate</Text>
            <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary, marginTop: 2 }}>
              {b.hourly_rate != null ? `$${Number(b.hourly_rate).toFixed(2)}/hr` : '—'}
            </Text>
          </View>
          <View style={{ backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 8, flex: 1, minWidth: '45%' }}>
            <Text style={{ fontSize: 11, color: Colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {isWorker ? 'Your payout' : 'Total'}
            </Text>
            <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: Colors.status.success, marginTop: 2 }}>
              {b.total_amount ? `$${Number(payoutLabel).toFixed(2)}` : '—'}
            </Text>
          </View>
        </View>
      </View>

      {!!statusMessage && (
        <AlertBanner
          tone={alertTone}
          title={
            isShiftExpired && isWorker && b.status === 'confirmed'
              ? 'Shift expired'
              : distanceInfo && !distanceInfo.withinRange && isWorker
                ? 'Clock-in location'
                : undefined
          }
          message={statusMessage}
        />
      )}

      {/* Booking Details */}
      <Section title="Booking details" subtitle="Schedule, location and payment">
        <DetailRow label="Booking ID" value={b.id} selectable last={false} />
        <DetailRow label="Date" value={formatDateDMY(b.start_time)} />
        <DetailRow
          label="Time"
          value={b.start_time && b.end_time ? `${formatTime12h(b.start_time)} – ${formatTime12h(b.end_time)}` : '—'}
        />
        <DetailRow
          label={isWorker && b.status === 'pending' ? "Participant's budget" : 'Agreed rate'}
          value={b.hourly_rate != null ? `$${Number(b.hourly_rate).toFixed(2)}/hr` : '—'}
        />
        {b.high_intensity ? <DetailRow label="High intensity" value="Yes" /> : null}
        {Number(b.travel_distance_km) > 0 ? (
          <DetailRow
            label="Travel"
            value={`${Number(b.travel_distance_km).toFixed(1)} km @ $${Number(b.travel_rate_per_km || 0.99).toFixed(2)}/km`}
          />
        ) : null}
        {Number(b.sleepover_flat_amount) > 0 ? (
          <DetailRow label="Sleepover" value={`$${Number(b.sleepover_flat_amount).toFixed(2)}`} />
        ) : null}
        <DetailRow label="Location" value={b.location_address} />
        {isWorker && distanceInfo && b.status === 'confirmed' && !ts?.clock_in_time && (
          <DetailRow
            label="Your distance"
            highlight={distanceInfo.withinRange}
            value={distanceInfo.unreliable ? distanceInfo.short : `${distanceInfo.short}${distanceInfo.withinRange ? ' ✓' : ''}`}
          />
        )}
        <DetailRow
          label={isWorker ? 'Platform fee' : 'Total (est.)'}
          value={
            isWorker && b.total_amount
              ? '15% (Summit Staffing)'
              : b.total_amount
                ? `$${Number(b.total_amount).toFixed(2)}`
                : '—'
          }
        />
        {isWorker && b.total_amount ? (
          <DetailRow
            label="Your payout (est.)"
            highlight
            last={!(!isPendingAcceptance && b.special_instructions) && !(b.status === 'cancelled' && b.decline_reason)}
            value={`$${workerPayoutFromTotal(b.total_amount).toFixed(2)}`}
          />
        ) : null}
        {!isPendingAcceptance && b.special_instructions ? (
          <DetailRow label="Notes" value={b.special_instructions} last={!(b.status === 'cancelled' && b.decline_reason)} />
        ) : null}
        {b.status === 'cancelled' && b.decline_reason ? (
          <DetailRow
            label={String(b.decline_reason).toLowerCase().includes('no-show') ? 'No-show reason' : 'Decline reason'}
            value={b.decline_reason}
            last
          />
        ) : null}
      </Section>

      {isWorker && (b.status === 'confirmed' || b.status === 'in_progress') && !hasClockedOut && workerDistanceM == null && (
        <Pressable
          onPress={handleEnableLocation}
          disabled={locationBusy}
          style={({ pressed }) => ({
            marginBottom: Spacing.md,
            backgroundColor: Colors.primary,
            paddingVertical: Spacing.sm,
            borderRadius: Radius.md,
            alignItems: 'center',
            opacity: locationBusy || pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>
            {locationBusy ? 'Getting location…' : b.status === 'in_progress' ? 'Enable location for clock-out' : 'Enable location for clock-in'}
          </Text>
        </Pressable>
      )}

      {isWorker && b.participant_about && (
        <Section title="Participant about" subtitle="Support plan and preferences">
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.primary, lineHeight: 22 }}>
            {b.participant_about}
          </Text>
        </Section>
      )}

      {ts && (
        <Section title="Timesheet" subtitle="Clock-in, clock-out and hours worked">
          <DetailRow label="Clock in" value={ts.clock_in_time ? formatDateTimeDMY(ts.clock_in_time) : 'Not clocked in'} />
          <DetailRow label="Clock out" value={ts.clock_out_time ? formatDateTimeDMY(ts.clock_out_time) : 'Not clocked out'} />
          <DetailRow label="Hours" value={ts.actual_hours ? `${Number(ts.actual_hours).toFixed(1)} hrs` : '—'} highlight={!!ts.actual_hours} />
          {ts.clock_out_source === 'system' ? (
            <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.status.warning, marginBottom: Spacing.sm }}>
              System logged out at scheduled shift end — pending admin review.
            </Text>
          ) : null}
          {ts.payroll_review_required ? (
            <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginBottom: Spacing.sm }}>
              Payroll flagged for review.
            </Text>
          ) : null}
          {ts.notes ? <DetailRow label="Notes" value={ts.notes} last /> : null}
        </Section>
      )}

      {(isWorker && (b.status === 'pending' || b.status === 'confirmed' || b.status === 'in_progress' || canMarkComplete || canWorkerCancelPast)) && (
        <Section title="Actions" subtitle="Shift controls">
          {b.status === 'pending' && (
            <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm }}>
              <Pressable
                disabled={bookingActionBusy}
                onPress={() => handleAction('accept')}
                style={({ pressed }) => ({ flex: 1, backgroundColor: Colors.status.success, paddingVertical: 12, borderRadius: Radius.md, alignItems: 'center', opacity: pressed || bookingActionBusy ? 0.85 : 1 })}
              >
                <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>
                  {bookingActionBusy ? 'Working…' : 'Accept'}
                </Text>
              </Pressable>
              <Pressable
                disabled={bookingActionBusy}
                onPress={() => handleAction('decline')}
                style={({ pressed }) => ({ flex: 1, backgroundColor: Colors.status.error, paddingVertical: 12, borderRadius: Radius.md, alignItems: 'center', opacity: pressed || bookingActionBusy ? 0.85 : 1 })}
              >
                <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>
                  {bookingActionBusy ? 'Working…' : 'Decline'}
                </Text>
              </Pressable>
            </View>
          )}

          {b.status === 'confirmed' && !isShiftExpired && (
            <Pressable
              onPress={handleClockIn}
              disabled={!canManualClockIn || clockActionBusy}
              style={({ pressed }) => ({
                backgroundColor: canManualClockIn && !clockActionBusy ? Colors.status.success : Colors.text.muted,
                paddingVertical: 14,
                borderRadius: Radius.md,
                alignItems: 'center',
                marginBottom: Spacing.sm,
                opacity: pressed || clockActionBusy ? 0.85 : 1,
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
              })}
            >
              {clockActionBusy ? <ActivityIndicator color={Colors.text.white} size="small" /> : null}
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.base }}>
                {clockActionBusy ? (clockActionLabel || 'Working…') : 'Clock in'}
              </Text>
            </Pressable>
          )}

          {canClockOut && (
            <Pressable
              onPress={handleClockOut}
              disabled={!canManualClockOut || clockActionBusy}
              style={({ pressed }) => ({
                backgroundColor: canManualClockOut && !clockActionBusy ? Colors.status.error : Colors.text.muted,
                paddingVertical: 14,
                borderRadius: Radius.md,
                alignItems: 'center',
                marginBottom: Spacing.sm,
                opacity: pressed || clockActionBusy ? 0.85 : 1,
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
              })}
            >
              {clockActionBusy ? <ActivityIndicator color={Colors.text.white} size="small" /> : null}
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.base }}>
                {clockActionBusy ? (clockActionLabel || 'Working…') : 'Clock out'}
              </Text>
            </Pressable>
          )}

          {canClockOut && clockOutDisabledReason ? (
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.status.warning, marginBottom: Spacing.sm, lineHeight: 20 }}>
              {clockOutDisabledReason}
            </Text>
          ) : null}

          {canClockOut && canManualClockOut && endMs != null && nowMs < endMs ? (
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.sm, lineHeight: 20 }}>
              You can clock out early. Pay is based on time from clock-in until you clock out.
            </Text>
          ) : null}

          {isWorker && b.status === 'in_progress' && !hasClockedOut && !isManualClockOutWindowOpen && (
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.status.warning, marginBottom: Spacing.sm, lineHeight: 20 }}>
              Manual clock-out window has closed. Contact support if you still need to close this shift.
            </Text>
          )}

          {hasClockedOut && isWorker && b.status === 'completed' && (
            <View style={{ backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm }}>
              <Text style={{ color: Colors.status.success, fontWeight: Typography.fontWeight.semibold, textAlign: 'center' }}>
                Shift complete — timesheet submitted for approval
              </Text>
            </View>
          )}

          {canMarkComplete && (
            <Pressable onPress={() => handleAction('complete')} style={({ pressed }) => ({ backgroundColor: Colors.primary, paddingVertical: 12, borderRadius: Radius.md, alignItems: 'center', marginBottom: Spacing.sm, opacity: pressed ? 0.85 : 1 })}>
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>Mark complete</Text>
            </Pressable>
          )}

          {canWorkerCancelPast && (
            <Pressable
              onPress={() => handleAction('cancel')}
              disabled={bookingActionBusy}
              style={({ pressed }) => ({
                backgroundColor: Colors.surfaceSecondary,
                borderWidth: 1,
                borderColor: Colors.status.error,
                paddingVertical: 12,
                borderRadius: Radius.md,
                alignItems: 'center',
                opacity: pressed || bookingActionBusy ? 0.85 : 1,
              })}
            >
              <Text style={{ color: Colors.status.error, fontWeight: Typography.fontWeight.semibold }}>
                {bookingActionBusy ? 'Deleting…' : 'Delete old shift'}
              </Text>
            </Pressable>
          )}
        </Section>
      )}

      {canParticipantCancelPast && (
        <Pressable
          onPress={() => handleAction('cancel')}
          disabled={bookingActionBusy}
          style={({ pressed }) => ({
            backgroundColor: Colors.status.error,
            paddingVertical: Spacing.md,
            borderRadius: Radius.md,
            alignItems: 'center',
            marginBottom: Spacing.md,
            opacity: pressed || bookingActionBusy ? 0.85 : 1,
          })}
        >
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>
            {bookingActionBusy ? 'Deleting…' : 'Delete old shift'}
          </Text>
        </Pressable>
      )}

      {isPrivatePayPipeline && (
        <Section title="Private pay">
          <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, lineHeight: 20 }}>
            {b.authorization_status === 'authorized'
              ? 'Card authorized for this booking. Payment captures when you approve the timesheet (or after 24 hours).'
              : b.authorization_status === 'captured'
                ? 'Payment captured for this shift.'
                : 'Save a card and authorize when the worker accepts. Funds are held until timesheet approval.'}
          </Text>
        </Section>
      )}

      {isFundedPipeline && (
        <Section title="Plan-managed (NDIS)">
          <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, lineHeight: 20 }}>
            After timesheet approval, a compliant PDF invoice is emailed to your plan manager with EFT payment details (7–14 day terms).
          </Text>
        </Section>
      )}

      {tsApproval && tsApproval !== 'not_submitted' && (
        <Section title="Timesheet approval">
          <Text style={{ color: Colors.text.secondary, marginBottom: Spacing.sm }}>
            Status: {(tsApproval || '').replace('_', ' ')}
            {ts?.auto_approve_at && tsApproval === 'pending_review'
              ? ` · Auto-approves ${formatDateTimeDMY(ts.auto_approve_at)}`
              : ''}
          </Text>
          {canReviewTimesheet && (
            <View style={{ gap: Spacing.sm }}>
              <Pressable
                disabled={timesheetActionBusy}
                onPress={handleApproveTimesheet}
                style={({ pressed }) => ({
                  backgroundColor: Colors.status.success,
                  paddingVertical: Spacing.md,
                  borderRadius: Radius.md,
                  alignItems: 'center',
                  opacity: pressed || timesheetActionBusy ? 0.8 : 1,
                })}
              >
                <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>Approve timesheet</Text>
              </Pressable>
              <Pressable
                disabled={timesheetActionBusy}
                onPress={handleDisputeTimesheet}
                style={({ pressed }) => ({
                  backgroundColor: Colors.surfaceSecondary,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  paddingVertical: Spacing.md,
                  borderRadius: Radius.md,
                  alignItems: 'center',
                  opacity: pressed || timesheetActionBusy ? 0.8 : 1,
                })}
              >
                <Text style={{ color: Colors.status.error, fontWeight: Typography.fontWeight.bold }}>Dispute timesheet</Text>
              </Pressable>
            </View>
          )}
        </Section>
      )}

      {needsCardAuthorization && (
        <Pressable
          disabled={timesheetActionBusy}
          onPress={handleAuthorizeCard}
          style={({ pressed }) => ({
            backgroundColor: Colors.primary,
            paddingVertical: Spacing.md,
            borderRadius: Radius.md,
            alignItems: 'center',
            marginBottom: Spacing.md,
            opacity: pressed || timesheetActionBusy ? 0.8 : 1,
          })}
        >
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>Authorize card for booking</Text>
        </Pressable>
      )}

      {isBookingPaid && isParticipant && !isPrivatePayPipeline && !isFundedPipeline && (
        <AlertBanner
          tone="success"
          title="Payment completed"
          message="This booking has already been paid. No further payment is required."
        />
      )}

      {showLegacyPayButton && (
        <StripePayBookingButton bookingId={bookingId} onPaid={loadBooking} />
      )}

      {isCoordinator && (b.status === 'confirmed' || b.status === 'completed') && (
        <View
          style={{
            backgroundColor: Colors.surfaceSecondary,
            borderRadius: Radius.md,
            padding: Spacing.md,
            marginBottom: Spacing.md,
            borderWidth: 1,
            borderColor: Colors.border,
          }}
        >
          <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.semibold, marginBottom: 4 }}>
            Payment
          </Text>
          <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, lineHeight: 20 }}>
            To pay for this shift, open the participant account from the Coordinator dashboard (Open participant account), then use Bookings and Pay with card on this booking.
          </Text>
        </View>
      )}

      {/* Generate Invoice (worker, funded / legacy) */}
      {isWorker && b.status === 'completed' && !isPrivatePayPipeline && (
        <Pressable
          onPress={handleGenerateInvoice}
          disabled={generatingInvoice}
          style={({ pressed }) => ({
            backgroundColor: Colors.primaryDark,
            paddingVertical: Spacing.md,
            borderRadius: Radius.md,
            alignItems: 'center',
            marginBottom: Spacing.md,
            opacity: pressed || generatingInvoice ? 0.8 : 1,
          })}
        >
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>
            {generatingInvoice ? 'Generating…' : 'Generate Invoice'}
          </Text>
        </Pressable>
      )}

      {/* Leave Review (worker + participant, completed) */}
      {canAddReview && (
        <Pressable onPress={() => setShowReview(true)} style={({ pressed }) => ({ backgroundColor: Colors.status.warning, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center', marginBottom: Spacing.md, opacity: pressed ? 0.8 : 1 })}>
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>⭐ Add a Review</Text>
        </Pressable>
      )}

      {hasUserReview && (
        <Section title="Your review">
          <Text style={{ fontSize: Typography.fontSize.lg, marginBottom: Spacing.xs }}>
            {'⭐'.repeat(Math.min(5, Math.max(1, Number(b.user_review.rating) || 0)))}
          </Text>
          {b.user_review.comment ? (
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.primary, lineHeight: 22 }}>
              {b.user_review.comment}
            </Text>
          ) : (
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.muted }}>No written comment</Text>
          )}
          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginTop: Spacing.sm }}>
            Submitted {formatDateDMY(b.user_review.created_at)}
          </Text>
        </Section>
      )}

      {showReview && (
        <Section title="⭐ Write a Review">
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.sm }}>Rating</Text>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md }}>
            {[1, 2, 3, 4, 5].map(n => (
              <Pressable key={n} onPress={() => setReviewRating(n)}>
                <Text style={{ fontSize: 32 }}>{n <= reviewRating ? '⭐' : ''}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={{ backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, minHeight: 80, textAlignVertical: 'top', color: Colors.text.primary, marginBottom: Spacing.md }}
            placeholder="Write your review..."
            placeholderTextColor={Colors.text.muted}
            value={reviewComment}
            onChangeText={setReviewComment}
            multiline
          />
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.xs }}>
            Any incident during this shift?
          </Text>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm }}>
            <Pressable
              onPress={() => setIncidentReported(false)}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: !incidentReported ? Colors.primary : Colors.surfaceSecondary,
                borderRadius: Radius.md,
                borderWidth: 1,
                borderColor: !incidentReported ? Colors.primary : Colors.border,
                paddingVertical: Spacing.sm,
                alignItems: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: !incidentReported ? Colors.text.white : Colors.text.secondary, fontWeight: Typography.fontWeight.semibold }}>
                No
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setIncidentReported(true)}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: incidentReported ? Colors.status.error : Colors.surfaceSecondary,
                borderRadius: Radius.md,
                borderWidth: 1,
                borderColor: incidentReported ? Colors.status.error : Colors.border,
                paddingVertical: Spacing.sm,
                alignItems: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: incidentReported ? Colors.text.white : Colors.text.secondary, fontWeight: Typography.fontWeight.semibold }}>
                Yes
              </Text>
            </Pressable>
          </View>
          {incidentReported && (
            <TextInput
              style={{ backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, minHeight: 80, textAlignVertical: 'top', color: Colors.text.primary, marginBottom: Spacing.md }}
              placeholder="Describe incident / remarks..."
              placeholderTextColor={Colors.text.muted}
              value={incidentDetails}
              onChangeText={setIncidentDetails}
              multiline
            />
          )}
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <Pressable onPress={() => setShowReview(false)} style={({ pressed }) => ({ flex: 1, backgroundColor: Colors.surfaceSecondary, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center', opacity: pressed ? 0.8 : 1 })}>
              <Text style={{ color: Colors.text.secondary }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleReview} disabled={submittingReview} style={({ pressed }) => ({ flex: 2, backgroundColor: Colors.status.warning, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center', opacity: pressed ? 0.8 : 1 })}>
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>{submittingReview ? 'Submitting...' : 'Submit Review'}</Text>
            </Pressable>
          </View>
        </Section>
      )}
    </ScrollView>

    <Modal
      visible={disputeModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => !timesheetActionBusy && setDisputeModalVisible(false)}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: Spacing.lg }}>
        <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, ...Shadows.md }}>
          <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.xs }}>
            Dispute timesheet
          </Text>
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.sm }}>
            Describe the issue with logged hours. Booking ID (for support): {bookingId}
          </Text>
          <TextInput
            style={{
              backgroundColor: Colors.surfaceSecondary,
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: Colors.border,
              padding: Spacing.md,
              minHeight: 100,
              textAlignVertical: 'top',
              color: Colors.text.primary,
              marginBottom: Spacing.md,
            }}
            placeholder="e.g. Worker clocked out early…"
            placeholderTextColor={Colors.text.muted}
            value={disputeReason}
            onChangeText={setDisputeReason}
            multiline
            editable={!timesheetActionBusy}
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm }}>
            <Pressable
              disabled={timesheetActionBusy}
              onPress={() => setDisputeModalVisible(false)}
              style={({ pressed }) => ({
                paddingVertical: Spacing.sm,
                paddingHorizontal: Spacing.md,
                borderRadius: Radius.md,
                backgroundColor: Colors.surfaceSecondary,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: Colors.text.secondary, fontWeight: Typography.fontWeight.semibold }}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={timesheetActionBusy}
              onPress={() => submitDispute(disputeReason)}
              style={({ pressed }) => ({
                paddingVertical: Spacing.sm,
                paddingHorizontal: Spacing.md,
                borderRadius: Radius.md,
                backgroundColor: Colors.status.error,
                opacity: pressed || timesheetActionBusy ? 0.85 : 1,
              })}
            >
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>
                {timesheetActionBusy ? 'Submitting…' : 'Submit dispute'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>

    <Modal visible={clockActionBusy} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: Spacing.lg }}>
        <View style={{
          backgroundColor: Colors.surface,
          borderRadius: Radius.lg,
          padding: Spacing.lg,
          minWidth: 240,
          alignItems: 'center',
          gap: Spacing.md,
          ...Shadows.md,
        }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.semibold, textAlign: 'center' }}>
            {clockActionLabel || 'Please wait…'}
          </Text>
          <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, textAlign: 'center' }}>
            Do not close the app — this may take up to a minute on slow connections.
          </Text>
        </View>
      </View>
    </Modal>
    </>
  );
}
