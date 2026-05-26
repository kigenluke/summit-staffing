/**
 * Summit Staffing – Find a worker (workers browse shifts) / My shifts (participants).
 */
import React, { useEffect, useState, useCallback, useLayoutEffect, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, Pressable, RefreshControl, Alert, Modal,
  TextInput, ScrollView, ActivityIndicator, Platform, Image, Switch,
} from 'react-native';
import * as PlacesPkg from 'react-native-google-places-autocomplete';
import NativeDatePicker from '../components/NativeDatePicker.js';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../store/authStore.js';
import { useWorkerGate } from '../context/WorkerGateContext.js';
import { showVerificationRequiredAlert } from '../utils/verificationPrompt.js';
import { api, ApiConfig } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';
import { SERVICE_TYPES } from '../constants/serviceTypes.js';
import { NavChevron } from '../components/NavChevron.js';
import { formatDateDMY, formatYmdToDMY, sameLocalCalendarDay } from '../utils/dateFormat.js';
import * as shiftBreakMetaMod from '../utils/shiftBreakMeta.js';
import * as ndisParticipantRatesMod from '../utils/ndisParticipantRates.js';

const shiftBreakMeta = shiftBreakMetaMod.default ?? shiftBreakMetaMod;
const { getShiftPayEstimate } = shiftBreakMeta;
const ndisParticipantRates = ndisParticipantRatesMod.default ?? ndisParticipantRatesMod;
const {
  validateParticipantOfferedHourlyRate,
  getNdisMinimumHourlyRate,
  getNdisMaximumHourlyRate,
  validateTravelDistanceKm,
  validateSleepoverFlatAmount,
  SLEEPOVER_FLAT_NIGHTLY,
} = ndisParticipantRates;

function nativeAlertOnly(title, message = '') {
  const body = typeof message === 'string' && message.trim() ? message.trim() : '';
  Alert.alert(title, body || undefined);
}

const SERVICE_ICONS = {
  // 'Personal Care': '🧴',
  // 'Domestic Assistance': '🧹',
  // 'Community Access': '🌍',
  // 'Respite Care': '🏠',
  // 'Assistance with Daily Life': '🤝',
  // 'Transport': '🚗',
  // 'Improved Health and Wellbeing': '💊',
  // 'Improved Daily Living': '⭐',
};

const getServiceColor = (type) => {
  const map = {
    'Personal Care': '#8B5CF6',
    'Domestic Assistance': '#F59E0B',
    'Community Access': '#10B981',
    'Respite Care': '#EC4899',
    'Assistance with Daily Life': '#06B6D4',
    'Transport': '#6366F1',
    'Improved Health and Wellbeing': '#14B8A6',
    'Improved Daily Living': '#F97316',
  };
  return map[type] || Colors.primary;
};

function getGooglePlacesBrowserKey() {
  if (typeof process !== 'undefined' && process.env) {
    return (
      process.env.GOOGLE_MAPS_BROWSER_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ||
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
      ''
    );
  }
  return '';
}

// ── Mini Calendar Component ────────────────────────────────────────────────────
function MiniCalendar({ selectedDate, onSelect }) {
  const CAL_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const goBack = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const goForward = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };
  const canGoBack = viewYear > today.getFullYear() || (viewYear === today.getFullYear() && viewMonth > today.getMonth());
  const pad = (n) => String(n).padStart(2, '0');
  const days = [];
  for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  return (
    <View style={{ backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm }}>
        <Pressable onPress={goBack} disabled={!canGoBack} style={{ padding: Spacing.sm, opacity: canGoBack ? 1 : 0.3 }}>
          <NavChevron direction="left" color={Colors.primary} size={18} />
        </Pressable>
        <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>
          {CAL_MONTH_NAMES[viewMonth]} {viewYear}
        </Text>
        <Pressable onPress={goForward} style={{ padding: Spacing.sm }}>
          <NavChevron direction="right" color={Colors.primary} size={18} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {dayNames.map((d) => (
          <View key={d} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
            <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, fontWeight: Typography.fontWeight.semibold }}>{d}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {days.map((day, i) => {
          if (day === null) return <View key={`blank-${i}`} style={{ width: '14.28%', height: 38 }} />;
          const dateObj = new Date(viewYear, viewMonth, day);
          const isPast = dateObj < today;
          const dateStr = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
          const isSelected = dateStr === selectedDate;
          return (
            <Pressable
              key={day}
              disabled={isPast}
              onPress={() => onSelect(dateStr)}
              style={{
                width: '14.28%', height: 38, alignItems: 'center', justifyContent: 'center',
                backgroundColor: isSelected ? Colors.primary : 'transparent',
                borderRadius: 19,
              }}
            >
              <Text style={{
                fontSize: Typography.fontSize.sm,
                color: isPast ? Colors.text.muted : isSelected ? Colors.text.white : Colors.text.primary,
                fontWeight: isSelected ? Typography.fontWeight.bold : Typography.fontWeight.normal,
              }}>{day}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ── Service Type Card ─────────────────────────────────────────────────────────
function ServiceTypeCard({ type, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: selected ? Colors.primary : Colors.surface,
        borderWidth: 2,
        borderColor: selected ? Colors.primary : Colors.border,
        borderRadius: Radius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.sm,
        opacity: pressed ? 0.85 : 1,
        ...Shadows.sm,
      })}
    >
      {/* <Text style={{ fontSize: 22, marginRight: Spacing.sm }}>{SERVICE_ICONS[type] || '🔧'}</Text> */}
      <Text style={{
        flex: 1,
        fontSize: Typography.fontSize.sm,
        fontWeight: Typography.fontWeight.semibold,
        color: selected ? Colors.text.white : Colors.text.primary,
      }}>
        {type}
      </Text>
      <View style={{
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: selected ? Colors.text.white : Colors.surfaceSecondary,
        borderWidth: selected ? 0 : 1,
        borderColor: Colors.border,
        alignItems: 'center', justifyContent: 'center',
      }}>
        {selected && <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: Typography.fontWeight.bold }}>✓</Text>}
      </View>
    </Pressable>
  );
}

/** NDIS price guide figures used as minimum offers (Sydney time / NSW public holidays). */
const NDIS_OTHER_RATE_HINTS = [
  { label: 'Domestic / Home & Community', rate: 'from $56.98/hr' },
  { label: 'Assistance with Daily Life', rate: 'from $59.06/hr' },
  { label: 'RN therapeutic (weekday day)', rate: 'from $123.65/hr' },
  { label: 'Travel (non-labour)', rate: '$0.99/km' },
];

const NDIS_PERSONAL_CARE_RATE_HINTS = [
  { label: 'Weekday 6am–8pm', rate: '$70.23/hr' },
  { label: 'Weekday after 8pm–midnight', rate: '$77.38/hr' },
  { label: 'Weekday midnight–6am', rate: '$78.81/hr' },
  { label: 'Saturday', rate: '$98.83/hr' },
  { label: 'Sunday', rate: '$127.43/hr' },
  { label: 'NSW public holiday', rate: '$156.03/hr' },
  { label: 'Sleepover (flat / night)', rate: '$297.60' },
];

// ── Create Shift Modal ────────────────────────────────────────────────────────
function CreateShiftModal({ visible, onClose, onCreated, onAppInfo }) {
  const say = typeof onAppInfo === 'function' ? onAppInfo : nativeAlertOnly;
  const MAX_SHIFT_HOURS = 24;
  const SHIFT_TIME_PRESETS = [
    { key: 'morning', label: 'Morning', start: '6:00 AM', end: '2:00 PM' },
    { key: 'evening', label: 'Evening', start: '2:00 PM', end: '10:00 PM' },
    { key: 'night', label: 'Night', start: '10:00 PM', end: '6:00 AM' },
  ];

  const [title, setTitle] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [showServicePicker, setShowServicePicker] = useState(false);
  const [hourlyRate, setHourlyRate] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [commonShiftPreset, setCommonShiftPreset] = useState('');
  const [location, setLocation] = useState('');
  const [locationLat, setLocationLat] = useState(null);
  const [locationLng, setLocationLng] = useState(null);
  const [locationFocused, setLocationFocused] = useState(false);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [participantProfileId, setParticipantProfileId] = useState(null);

  const [workersCount, setWorkersCount] = useState('1');
  const [sameShift, setSameShift] = useState(true);
  const [workerShifts, setWorkerShifts] = useState([{ start: '', end: '' }]);
  const [workerShiftPresets, setWorkerShiftPresets] = useState(['']);
  const [showNativeTimePicker, setShowNativeTimePicker] = useState(false);
  const [nativePickerValue, setNativePickerValue] = useState(() => {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    return d;
  });
  const [timeTarget, setTimeTarget] = useState({ scope: 'common', field: 'start', index: 0 });
  const [webPickerHour, setWebPickerHour] = useState('9');
  const [webPickerMinute, setWebPickerMinute] = useState('00');
  const [webPickerPeriod, setWebPickerPeriod] = useState('AM');
  const [step, setStep] = useState('workers');
  const [activeWorkerIndex, setActiveWorkerIndex] = useState(0);
  const commonStartWebRef = useRef(null);
  const [addBreak, setAddBreak] = useState(false);
  const [breakMinutes, setBreakMinutes] = useState('');
  const [paidBreak, setPaidBreak] = useState(false);
  const [breakPay, setBreakPay] = useState('');

  const [rateGuideOpen, setRateGuideOpen] = useState(false);
  const [highIntensitySupport, setHighIntensitySupport] = useState(false);
  const [includeSleepover, setIncludeSleepover] = useState(false);
  const [travelKmInput, setTravelKmInput] = useState('');

  const placesRef = useRef(null);
  const PlacesAutocompleteComponent = (
    PlacesPkg?.GooglePlacesAutocomplete ||
    PlacesPkg?.default?.GooglePlacesAutocomplete ||
    PlacesPkg?.default ||
    null
  );
  const googleKey = getGooglePlacesBrowserKey();
  const isWeb = Platform.OS === 'web';
  const placesProxyBaseUrl = isWeb
    ? (typeof window !== 'undefined' ? window.location.origin : '')
    : String(ApiConfig?.baseURL || 'https://athletic-heart-backend-production.up.railway.app').replace(/\/$/, '');
  const canUsePlacesAutocomplete = !!PlacesAutocompleteComponent && !!placesProxyBaseUrl;
  const placesQueryKey = googleKey || 'places-proxy-key';
  const placesRequestUrl = canUsePlacesAutocomplete
    ? { url: `${placesProxyBaseUrl}/__places-proxy`, useOnPlatform: 'all' }
    : undefined;

  useEffect(() => {
    if (!visible) return;
    // Load participant profile id so we can store lat/lng (needed for worker distance filter).
    (async () => {
      try {
        const { data } = await api.get('/api/participants/me');
        if (data?.ok && data?.participant?.id) setParticipantProfileId(data.participant.id);
      } catch (_) {}
    })();
  }, [visible]);

  const reset = () => {
    setTitle(''); setServiceType(''); setHourlyRate(''); setDate('');
    setStartTime(''); setEndTime(''); setLocation(''); setDescription('');
    setLocationLat(null); setLocationLng(null);
    setCommonShiftPreset('');
    setShowServicePicker(false); setShowCalendar(false);
    setWorkersCount('1');
    setSameShift(true);
    setWorkerShifts([{ start: '', end: '' }]);
    setWorkerShiftPresets(['']);
    setAddBreak(false);
    setBreakMinutes('');
    setPaidBreak(false);
    setBreakPay('');
    setStep('workers');
    setActiveWorkerIndex(0);
    setRateGuideOpen(false);
    setHighIntensitySupport(false);
    setIncludeSleepover(false);
    setTravelKmInput('');
  };

  const parseTimeToMinutes = (timeStr) => {
    const match = (timeStr || '').trim().match(/^(\d{1,2}):([0-5]\d)\s?(AM|PM)$/i);
    if (!match) return null;
    let hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    const period = match[3].toUpperCase();

    if (hour < 1 || hour > 12) return null;

    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    return hour * 60 + minute;
  };

  const getShiftDurationMinutes = (start, end) => {
    const s = parseTimeToMinutes(start);
    const e = parseTimeToMinutes(end);
    if (s == null || e == null) return null;
    let diff = e - s;
    if (diff <= 0) diff += 24 * 60; // overnight shift allowed
    return diff;
  };

  const from24hToAmPm = (time24) => {
    const match = (time24 || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!match) return '';
    let hour = parseInt(match[1], 10);
    const minute = match[2];
    const period = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour}:${minute} ${period}`;
  };

  const to24hString = (timeStr) => {
    const totalMinutes = parseTimeToMinutes(timeStr);
    if (totalMinutes == null) return '';
    const hour = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const minute = String(totalMinutes % 60).padStart(2, '0');
    return `${hour}:${minute}`;
  };

  const to24Hour = (hour12, minute, period) => {
    const h = Math.max(1, Math.min(12, Number(hour12) || 12));
    const m = Math.max(0, Math.min(59, Number(minute) || 0));
    let hour24 = h % 12;
    if (String(period).toUpperCase() === 'PM') hour24 += 12;
    return `${String(hour24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const toPickerParts = (timeStr) => {
    const m = (timeStr || '').trim().match(/^(\d{1,2}):([0-5]\d)\s?(AM|PM)$/i);
    if (!m) return { hour: '09', minute: '00', period: 'AM' };
    return {
      hour: String(parseInt(m[1], 10)).padStart(2, '0'),
      minute: m[2],
      period: m[3].toUpperCase(),
    };
  };

  const isValidTime = (timeStr) => {
    const totalMinutes = parseTimeToMinutes(timeStr);
    return totalMinutes != null;
  };

  const toApiTime = (timeStr) => {
    const totalMinutes = parseTimeToMinutes(timeStr);
    if (totalMinutes == null) return null;
    const hour = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const minute = String(totalMinutes % 60).padStart(2, '0');
    return `${hour}:${minute}:00`;
  };

  const toPickerDate = (timeStr) => {
    const mins = parseTimeToMinutes(timeStr);
    const d = new Date();
    if (mins == null) {
      d.setHours(9, 0, 0, 0);
      return d;
    }
    d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    return d;
  };

  const toPickerValue = (timeStr) => {
    return toPickerDate(timeStr);
  };

  const getShiftPresetFromStartTime = (timeStr) => {
    const mins = parseTimeToMinutes(timeStr);
    if (mins == null) return '';
    // Morning: 6:00 AM - 1:59 PM
    if (mins >= 6 * 60 && mins < 14 * 60) return 'morning';
    // Evening: 2:00 PM - 7:59 PM
    if (mins >= 14 * 60 && mins < 20 * 60) return 'evening';
    // Night: 8:00 PM - 5:59 AM
    return 'night';
  };

  const openTimePickerFor = (scope, field, index = 0) => {
    let current = '';
    if (scope === 'common') {
      current = field === 'start' ? startTime : endTime;
    } else {
      current = field === 'start' ? (workerShifts[index]?.start || '') : (workerShifts[index]?.end || '');
    }
    setTimeTarget({ scope, field, index });
    // Debug logs: helps verify picker flow before APK build tests.
    // eslint-disable-next-line no-console
    console.log('[ShiftTimePicker] open requested', { platform: Platform.OS, scope, field, index, current });
    if (Platform.OS === 'web') {
      const parsed = toPickerParts(current || '9:00 AM');
      setWebPickerHour(String(Number(parsed.hour) || 9));
      setWebPickerMinute(parsed.minute || '00');
      setWebPickerPeriod(parsed.period || 'AM');
      // eslint-disable-next-line no-console
      console.log('[ShiftTimePicker] web picker target set', { scope, field, index, parsed });
      return;
    }
    setNativePickerValue(toPickerDate(current));
    // eslint-disable-next-line no-console
    console.log('[ShiftTimePicker] native modal open', { scope, field, index });
    setShowNativeTimePicker(true);
  };

  const applyPickedTimeValue = (value) => {
    if (timeTarget.scope === 'common') {
      if (timeTarget.field === 'start') setStartTime(value);
      else setEndTime(value);
      return;
    }
    setWorkerShifts((prev) => prev.map((item, idx) => (
      idx === timeTarget.index
        ? { ...item, [timeTarget.field]: value }
        : item
    )));
  };

  const applyWebPickedTimeValue = () => {
    const pickedValue = from24hToAmPm(to24Hour(webPickerHour, webPickerMinute, webPickerPeriod));
    applyPickedTimeValue(pickedValue);
    if (timeTarget.scope === 'common') {
      if (timeTarget.field === 'start') {
        setCommonShiftPreset(getShiftPresetFromStartTime(pickedValue));
      }
    } else if (timeTarget.field === 'start') {
      const autoPreset = getShiftPresetFromStartTime(pickedValue);
      setWorkerShiftPresets((prev) => prev.map((item, idx) => (idx === timeTarget.index ? autoPreset : item)));
    }
    setTimeTarget({ scope: '', field: '', index: -1 });
  };

  const applyShiftPreset = (presetKey, scope = 'common', index = 0) => {
    const preset = SHIFT_TIME_PRESETS.find((item) => item.key === presetKey);
    if (!preset) return;
    if (scope === 'common') {
      setCommonShiftPreset(presetKey);
      setStartTime(preset.start);
      setEndTime(preset.end);
      return;
    }
    setWorkerShiftPresets((prev) => prev.map((item, idx) => (idx === index ? presetKey : item)));
    setWorkerShifts((prev) => prev.map((item, idx) => (
      idx === index ? { ...item, start: preset.start, end: preset.end } : item
    )));
  };

  const validateShifts = () => {
    const count = parseInt(workersCount, 10) || 0;
    if (count < 1) {
      say('Missing Fields', 'Please enter how many workers you want.');
      return false;
    }

    if (count === 1 || sameShift) {
      if (!startTime || !endTime) {
        say('Missing Fields', 'Please enter start and end time.');
        return false;
      }
      if (!isValidTime(startTime) || !isValidTime(endTime)) {
        say('Invalid Time', 'Please enter valid start and end times.');
        return false;
      }
      const durationMin = getShiftDurationMinutes(startTime, endTime);
      if (!durationMin || durationMin > MAX_SHIFT_HOURS * 60) {
        say('Invalid Time', `Shift must be between 1 minute and ${MAX_SHIFT_HOURS} hours.`);
        return false;
      }
      return true;
    }

    for (let i = 0; i < workerShifts.length; i++) {
      const shift = workerShifts[i];
      if (!shift.start || !shift.end) {
        say('Missing Fields', `Please enter start and end time for Worker ${i + 1}.`);
        return false;
      }
      if (!isValidTime(shift.start) || !isValidTime(shift.end)) {
        say('Invalid Time', `Please enter valid start/end times for Worker ${i + 1}.`);
        return false;
      }
      const durationMin = getShiftDurationMinutes(shift.start, shift.end);
      if (!durationMin || durationMin > MAX_SHIFT_HOURS * 60) {
        say('Invalid Time', `Worker ${i + 1} shift must be between 1 minute and ${MAX_SHIFT_HOURS} hours.`);
        return false;
      }
    }
    return true;
  };

  const validateBreakFields = (shiftStart = startTime, shiftEnd = endTime) => {
    if (!addBreak) return true;
    const minutes = parseInt(breakMinutes, 10);
    if (!minutes || minutes < 1) {
      say('Invalid Break', 'Please enter break duration in minutes.');
      return false;
    }
    const shiftDurationMin = getShiftDurationMinutes(shiftStart, shiftEnd);
    if (shiftDurationMin && minutes >= shiftDurationMin) {
      say('Invalid Break', 'Break duration must be less than total shift duration.');
      return false;
    }
    if (paidBreak) {
      const pay = parseFloat(breakPay);
      if (Number.isNaN(pay) || pay < 0) {
        say('Invalid Break Pay', 'Please enter a valid paid break amount.');
        return false;
      }
    }
    return true;
  };

  const combineDateAndTimeIso = (dateStr, timeStr, addDays = 0) => {
    const base = new Date(`${dateStr}T00:00:00`);
    if (isNaN(base.getTime())) return null;
    const mins = parseTimeToMinutes(timeStr);
    if (mins == null) return null;
    base.setDate(base.getDate() + addDays);
    base.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    return base.toISOString();
  };

  const validateCommonFields = () => {
    if (!title || !serviceType || !date || !location) {
      say('Missing Fields', 'Please fill in all required fields.');
      return false;
    }
    const offered = parseFloat(String(hourlyRate || '').replace(/,/g, '')) || 0;
    if (offered <= 0 && !includeSleepover) {
      say('Missing rate', 'Enter an hourly labour rate (or 0) and/or turn on NDIS sleepover flat fee.');
      return false;
    }
    return true;
  };

  const handleCreate = async () => {
    const count = parseInt(workersCount, 10) || 0;
    if (count < 1) {
      say('Missing Fields', 'Please select workers count.');
      return;
    }
    if (!validateCommonFields()) return;
    if (!validateShifts()) return;
    const primaryShift = (count >= 2 && !sameShift)
      ? workerShifts[0]
      : { start: startTime, end: endTime };
    const startMinutes = parseTimeToMinutes(primaryShift.start);
    const endMinutes = parseTimeToMinutes(primaryShift.end);
    if (startMinutes == null || endMinutes == null) {
      say('Invalid Time', 'Please enter valid times in AM/PM format.');
      return;
    }
    if (!validateBreakFields(primaryShift.start, primaryShift.end)) return;
    const breakMin = parseInt(breakMinutes, 10) || 0;
    const durationMin = getShiftDurationMinutes(primaryShift.start, primaryShift.end) || 0;
    if (addBreak && breakMin >= durationMin) {
      say('Invalid Break', 'Break duration must be less than total shift duration.');
      return;
    }
    const endDayOffset = endMinutes <= startMinutes ? 1 : 0;
    const start_time = combineDateAndTimeIso(date, primaryShift.start, 0);
    const end_time = combineDateAndTimeIso(date, primaryShift.end, endDayOffset);
    if (!start_time || !end_time) {
      say('Invalid Time', 'Please enter a valid shift start time.');
      return;
    }

    const offered = parseFloat(String(hourlyRate || '').replace(/,/g, '')) || 0;
    const travelParsed = parseFloat(String(travelKmInput || '').replace(/,/g, ''));
    const travelDistanceKm = Number.isFinite(travelParsed) && travelParsed > 0 ? travelParsed : null;
    const tv = validateTravelDistanceKm(travelDistanceKm == null ? '' : travelDistanceKm);
    if (!tv.ok) {
      say('Travel', tv.error || 'Invalid travel distance.');
      return;
    }
    const sleepoverFlat = includeSleepover ? SLEEPOVER_FLAT_NIGHTLY : null;
    const sv = validateSleepoverFlatAmount(sleepoverFlat);
    if (!sv.ok) {
      say('Sleepover', sv.error || 'Invalid sleepover.');
      return;
    }
    if (offered <= 0 && !(sleepoverFlat > 0)) {
      say('Rate required', 'Enter an hourly labour rate and/or turn on NDIS sleepover flat fee.');
      return;
    }
    if (offered > 0) {
      const rateCheck = validateParticipantOfferedHourlyRate(serviceType, start_time, offered, { highIntensity: highIntensitySupport });
      if (!rateCheck.ok) {
        const rateMsg = rateCheck.error || `Allowed range $${Number(rateCheck.minimum).toFixed(2)} – $${Number(rateCheck.maximum).toFixed(2)}/hr.`;
        const belowMax = rateCheck.maximum != null && offered > Number(rateCheck.maximum) + 1e-6;
        say(
          belowMax ? 'Rate above maximum' : 'Rate below minimum',
          rateMsg,
        );
        return;
      }
    }

    const breakMetaText = addBreak
      ? `Break: ${breakMinutes} min | Paid break: ${paidBreak ? 'Yes' : 'No'}${paidBreak ? ` | Break pay: $${parseFloat(breakPay || 0).toFixed(2)}` : ''}`
      : '';
    const fullDescription = [description, breakMetaText].filter(Boolean).join('\n');

    setSaving(true);
    try {
      // Best-effort: store participant coords so workers can filter by distance.
      if (participantProfileId && locationLat != null && locationLng != null) {
        try {
          await api.put(`/api/participants/${participantProfileId}`, {
            address: location,
            latitude: locationLat,
            longitude: locationLng,
          });
        } catch (_) {}
      }
      const { error } = await api.post('/api/shifts', {
        title,
        service_type: serviceType,
        hourly_rate: offered,
        start_time,
        end_time,
        location,
        description: fullDescription,
        high_intensity_support: highIntensitySupport,
        travel_distance_km: travelDistanceKm,
        sleepover_flat_amount: sleepoverFlat,
        workers_count: count,
        same_shift: count >= 2 ? sameShift : true,
        has_break: addBreak,
        break_minutes: addBreak ? parseInt(breakMinutes, 10) : 0,
        paid_break: addBreak ? paidBreak : false,
        break_pay: addBreak && paidBreak ? parseFloat(breakPay || 0) : 0,
        worker_shifts: count >= 2 && !sameShift
          ? workerShifts.map((shift, idx) => ({
            worker_number: idx + 1,
            start_time: toApiTime(shift.start),
            end_time: toApiTime(shift.end),
          }))
          : [],
      });
      if (error) {
        say('Error', error.message || 'Failed to create shift');
      } else {
        say('Success', 'Shift posted successfully!');
        reset();
        onClose();
        onCreated?.();
      }
    } catch (e) {
      say('Error', e?.message || 'Failed to create shift');
    }
    setSaving(false);
  };

  const workerCountNumber = parseInt(workersCount, 10) || 0;
  const setWorkersByStepper = (nextCount) => {
    const safeCount = Math.max(1, Math.min(10, nextCount));
    setWorkersCount(String(safeCount));
    setWorkerShifts(Array.from({ length: safeCount }, () => ({ start: '', end: '' })));
    setWorkerShiftPresets(Array.from({ length: safeCount }, () => ''));
    if (safeCount < 2) setSameShift(true);
  };

  const handleNextFromWorkers = () => {
    if (workerCountNumber < 1) {
      say('Missing Fields', 'Please choose how many workers you want to hire.');
      return;
    }
    if (workerCountNumber === 1) {
      setSameShift(true);
      setStep('details');
      return;
    }
    setStep('mode');
  };

  const handleNextFromMode = () => {
    if (sameShift) {
      setStep('details');
    } else {
      setActiveWorkerIndex(0);
      setStep('workerDetails');
    }
  };

  const handleWorkerNext = () => {
    const worker = workerShifts[activeWorkerIndex];
    if (!worker?.start || !worker?.end) {
      say('Missing Fields', `Please set start time and shift hours for Worker ${activeWorkerIndex + 1}.`);
      return;
    }
    if (activeWorkerIndex < workerCountNumber - 1) {
      setActiveWorkerIndex((prev) => prev + 1);
      return;
    }
    handleCreate();
  };

  const liveHourlyRateHint = useMemo(() => {
    const offered = parseFloat(String(hourlyRate || '').replace(/,/g, ''));
    if (!Number.isFinite(offered)) {
      return { borderColor: Colors.border, status: 'neutral', main: null, detail: null };
    }
    if (offered === 0) {
      return {
        borderColor: Colors.border,
        status: 'zero',
        main: includeSleepover ? '$0/hr labour with sleepover — OK if that matches your booking.' : 'Enter a rate above $0 or enable sleepover flat.',
        detail: null,
      };
    }
    try {
      const iso = combineDateAndTimeIso(date, startTime || '9:00 AM', 0);
      if (!iso || !serviceType) {
        return {
          borderColor: Colors.border,
          status: 'neutral',
          main: 'Select service, date, and shift start to check your rate.',
          detail: null,
        };
      }
      const min = getNdisMinimumHourlyRate(serviceType, iso);
      const max = getNdisMaximumHourlyRate(serviceType, iso, { highIntensity: highIntensitySupport });
      if (offered + 1e-6 < min) {
        return {
          borderColor: Colors.status.error,
          status: 'low',
          main: `Below minimum ($${min.toFixed(2)}/hr)`,
          detail: `Increase to at least $${min.toFixed(2)}/hr to post this shift.`,
        };
      }
      if (offered > max + 1e-6) {
        return {
          borderColor: Colors.status.warning,
          status: 'high',
          main: `Above maximum ($${max.toFixed(2)}/hr)`,
          detail: `Lower to $${max.toFixed(2)}/hr or less (or adjust high-intensity if weekday daytime).`,
        };
      }
      return {
        borderColor: Colors.border,
        status: 'ok',
        main: `In range for this start time`,
        detail: `$${min.toFixed(2)} – $${max.toFixed(2)}/hr${Math.abs(min - max) < 0.005 ? ' (single cap)' : ''}`,
      };
    } catch (_) {
      return { borderColor: Colors.border, status: 'neutral', main: null, detail: null };
    }
  }, [hourlyRate, date, startTime, serviceType, highIntensitySupport, includeSleepover]);

  const renderCommonDetailsFields = () => (
    <>
      <Text style={labelStyle}>Title *</Text>
      <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginTop: -Spacing.xs, marginBottom: Spacing.xs }}>
        Suggested: Morning Shift, Afternoon Shift, Sleep Over
      </Text>
      <TextInput
        style={inputStyle}
        value={title}
        onChangeText={setTitle}
        placeholder="e.g. Morning Shift or Sleep Over"
        placeholderTextColor={Colors.text.muted}
      />

      <Text style={labelStyle}>Service Type *</Text>
      <Pressable
        onPress={() => setShowServicePicker(!showServicePicker)}
        style={[inputStyle, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderColor: showServicePicker ? Colors.primary : Colors.border }]}
      >
        <Text style={{ color: serviceType ? Colors.text.primary : Colors.text.muted, fontSize: Typography.fontSize.base }}>
          {serviceType ? ` ${serviceType}` : 'Select a service type...'}
        </Text>
        <Text style={{ color: Colors.text.muted, fontSize: 12 }}>{showServicePicker ? '▲' : '▼'}</Text>
      </Pressable>
      {showServicePicker && (
        <View style={{ backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border }}>
          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginBottom: Spacing.sm }}>Tap to select</Text>
          {SERVICE_TYPES.map((type) => (
            <ServiceTypeCard key={type} type={type} selected={serviceType === type} onPress={() => { setServiceType(type); setShowServicePicker(false); }} />
          ))}
        </View>
      )}

      <Text style={labelStyle}>Hourly labour rate ($) *</Text>
      <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginTop: -Spacing.xs, marginBottom: Spacing.sm }}>
        NDIS min/max apply from your service type and shift start (Sydney). Use $0 only for sleepover + travel only; high-intensity raises weekday daytime cap.
      </Text>
      <TextInput
        style={[
          inputStyle,
          {
            borderColor: liveHourlyRateHint.borderColor,
            borderWidth: liveHourlyRateHint.status === 'low' || liveHourlyRateHint.status === 'high' ? 2 : 1,
          },
        ]}
        value={hourlyRate}
        onChangeText={setHourlyRate}
        keyboardType="decimal-pad"
        placeholder="e.g. 70"
        placeholderTextColor={Colors.text.muted}
      />
      {liveHourlyRateHint.main ? (
        <View style={{ marginTop: -Spacing.xs, marginBottom: Spacing.sm }}>
          <Text
            style={{
              fontSize: Typography.fontSize.sm,
              fontWeight: Typography.fontWeight.semibold,
              color:
                liveHourlyRateHint.status === 'low'
                  ? Colors.status.error
                  : liveHourlyRateHint.status === 'high'
                    ? Colors.status.warning
                    : liveHourlyRateHint.status === 'zero'
                      ? Colors.text.secondary
                      : Colors.status.success,
            }}
          >
            {liveHourlyRateHint.main}
          </Text>
          {liveHourlyRateHint.detail ? (
            <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginTop: 4 }}>
              {liveHourlyRateHint.detail}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md }}>
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.primary, flex: 1, paddingRight: Spacing.sm }}>
          High intensity (weekday daytime, cap $75.98/hr)
        </Text>
        <Switch value={highIntensitySupport} onValueChange={setHighIntensitySupport} trackColor={{ false: Colors.border, true: Colors.primary }} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md }}>
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.primary, flex: 1, paddingRight: Spacing.sm }}>
          Include NDIS sleepover flat (${SLEEPOVER_FLAT_NIGHTLY.toFixed(2)} / night)
        </Text>
        <Switch value={includeSleepover} onValueChange={setIncludeSleepover} trackColor={{ false: Colors.border, true: Colors.primary }} />
      </View>

      <Text style={labelStyle}>Travel (km, optional)</Text>
      <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginBottom: Spacing.xs }}>
        Billed at $0.99/km (non-labour), added to the shift total.
      </Text>
      <TextInput
        style={inputStyle}
        value={travelKmInput}
        onChangeText={setTravelKmInput}
        keyboardType="decimal-pad"
        placeholder="e.g. 12.5"
        placeholderTextColor={Colors.text.muted}
      />

      <Pressable
        onPress={() => setRateGuideOpen((o) => !o)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: Colors.surfaceSecondary,
          borderWidth: 1,
          borderColor: Colors.border,
          borderRadius: Radius.md,
          paddingVertical: Spacing.sm,
          paddingHorizontal: Spacing.md,
          marginBottom: rateGuideOpen ? Spacing.sm : Spacing.md,
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.primary, fontWeight: Typography.fontWeight.semibold, flex: 1, paddingRight: Spacing.sm }}>
          Rate guide (reference only)
        </Text>
        <Text style={{ color: Colors.text.muted, fontSize: 12 }}>{rateGuideOpen ? '▲' : '▼'}</Text>
      </Pressable>
      {rateGuideOpen && (
        <View style={{
          backgroundColor: Colors.surfaceSecondary,
          borderRadius: Radius.md,
          borderWidth: 1,
          borderColor: Colors.border,
          padding: Spacing.md,
          marginBottom: Spacing.md,
        }}
        >
          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginBottom: Spacing.sm }}>
            Snapshot figures — confirm with your plan manager. Enforced limits use the checker above.
          </Text>
          <Text style={{ fontSize: 11, fontWeight: Typography.fontWeight.semibold, color: Colors.text.secondary, marginBottom: 4 }}>Other services</Text>
          {NDIS_OTHER_RATE_HINTS.map((row) => (
            <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.borderLight }}>
              <Text style={{ fontSize: 12, color: Colors.text.primary, flex: 1, paddingRight: Spacing.sm }}>{row.label}</Text>
              <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: Typography.fontWeight.semibold }}>{row.rate}</Text>
            </View>
          ))}
          <Text style={{ fontSize: 11, fontWeight: Typography.fontWeight.semibold, color: Colors.text.secondary, marginTop: Spacing.sm, marginBottom: 4 }}>Standard support (by time)</Text>
          {NDIS_PERSONAL_CARE_RATE_HINTS.map((row) => (
            <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.borderLight }}>
              <Text style={{ fontSize: 12, color: Colors.text.primary, flex: 1, paddingRight: Spacing.sm }}>{row.label}</Text>
              <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: Typography.fontWeight.semibold }}>{row.rate}</Text>
            </View>
          ))}
        </View>
      )}

      <Text style={labelStyle}>Date *</Text>
      <Pressable onPress={() => setShowCalendar(!showCalendar)} style={[inputStyle, { justifyContent: 'center' }]}>
        <Text style={{ color: date ? Colors.text.primary : Colors.text.muted }}>{date ? formatYmdToDMY(date) : 'Select a date...'}</Text>
      </Pressable>
      {showCalendar && <MiniCalendar selectedDate={date} onSelect={(d) => { setDate(d); setShowCalendar(false); }} />}

      <Text style={labelStyle}>Location *</Text>
      {!canUsePlacesAutocomplete ? (
        <TextInput style={inputStyle} value={location} onChangeText={setLocation} />
      ) : (
        <View
          style={[
            inputStyle,
            {
              paddingVertical: 0,
              paddingHorizontal: 0,
              overflow: 'visible',
              zIndex: 4000,
              ...(Platform.OS === 'web' ? { position: 'relative', marginBottom: locationFocused ? 8 : 0 } : null),
            },
          ]}
        >
          <PlacesAutocompleteComponent
            ref={placesRef}
            placeholder="Start typing address in Australia"
            fetchDetails={false}
            minLength={3}
            debounce={450}
            onPress={async (data, details) => {
              const desc = data?.description || data?.formatted_address || '';
              setLocation(desc);
              let lat = details?.geometry?.location?.lat;
              let lng = details?.geometry?.location?.lng;

              if ((typeof lat !== 'number' || typeof lng !== 'number') && data?.place_id) {
                try {
                  const detailsPath = `/api/places/details?place_id=${encodeURIComponent(
                    data.place_id
                  )}&language=en`;
                  const { data: detailsRes } = await api.get(detailsPath);
                  lat = detailsRes?.result?.geometry?.location?.lat;
                  lng = detailsRes?.result?.geometry?.location?.lng;
                } catch (_) {}
              }

              if (typeof lat === 'number' && typeof lng === 'number') {
                setLocationLat(lat);
                setLocationLng(lng);
              } else {
                setLocationLat(null);
                setLocationLng(null);
              }
              if (placesRef.current?.blur) placesRef.current.blur();
            }}
            query={{
              key: placesQueryKey,
              language: 'en',
              components: 'country:au',
            }}
            requestUrl={placesRequestUrl}
            styles={{
              container: { flex: 1 },
              textInput: {
                backgroundColor: 'transparent',
                borderWidth: 0,
                paddingVertical: Spacing.sm,
                paddingHorizontal: Spacing.md,
                fontSize: Typography.fontSize.base,
                color: Colors.text.primary,
                marginBottom: 0,
              },
              listView: {
                ...(Platform.OS === 'web'
                  ? { position: 'relative', top: 0, left: 0, right: 0, marginTop: 0 }
                  : { position: 'absolute', top: 44, left: 0, right: 0 }),
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: Colors.border,
                borderRadius: Radius.md,
                maxHeight: 220,
                overflow: 'auto',
                zIndex: 3000,
                ...Shadows.sm,
              },
              row: {
                padding: Spacing.md,
                backgroundColor: '#FFFFFF',
              },
              description: { color: Colors.text.primary, fontSize: Typography.fontSize.sm },
              separator: { height: 1, backgroundColor: Colors.borderLight },
            }}
            listViewDisplayed={locationFocused ? 'auto' : false}
            keyboardShouldPersistTaps="handled"
            isRowScrollable
            enablePoweredByContainer={false}
            textInputProps={{
              value: location,
              onFocus: () => setLocationFocused(true),
              onBlur: () => {
                // Delay so click/tap on a suggestion still works.
                setTimeout(() => setLocationFocused(false), 120);
              },
              onChangeText: (t) => {
                setLocation(t);
                setLocationLat(null);
                setLocationLng(null);
                if (!locationFocused) setLocationFocused(true);
              },
              placeholderTextColor: Colors.text.muted,
            }}
          />
        </View>
      )}

      <Text style={labelStyle}>Task note / description</Text>
      <TextInput
        style={[inputStyle, { height: 80, textAlignVertical: 'top' }]}
        value={description}
        onChangeText={setDescription}
        placeholder="Add task details for workers..."
        placeholderTextColor={Colors.text.muted}
        multiline
      />

      <Text style={labelStyle}>Do you want to add break?</Text>
      <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
        <Pressable onPress={() => setAddBreak(true)} style={[toggleBtn, addBreak ? toggleBtnActive : null]}>
          <Text style={[toggleBtnText, addBreak ? toggleBtnTextActive : null]}>Yes</Text>
        </Pressable>
        <Pressable onPress={() => { setAddBreak(false); setPaidBreak(false); setBreakMinutes(''); setBreakPay(''); }} style={[toggleBtn, !addBreak ? toggleBtnActive : null]}>
          <Text style={[toggleBtnText, !addBreak ? toggleBtnTextActive : null]}>No</Text>
        </Pressable>
      </View>

      {addBreak && (
        <>
          <Text style={labelStyle}>Break duration (minutes)</Text>
          {Platform.OS === 'web' ? (
            <View style={[inputStyle, webInputWrap]}>
              <input
                type="number"
                min="0"
                step="1"
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(e.target.value)}
                style={webNumberInput}
              />
            </View>
          ) : (
            <TextInput
              style={inputStyle}
              value={breakMinutes}
              onChangeText={setBreakMinutes}
              keyboardType="numeric"
            />
          )}

          <Text style={labelStyle}>Do you want to pay for break?</Text>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <Pressable onPress={() => setPaidBreak(true)} style={[toggleBtn, paidBreak ? toggleBtnActive : null]}>
              <Text style={[toggleBtnText, paidBreak ? toggleBtnTextActive : null]}>Yes</Text>
            </Pressable>
            <Pressable onPress={() => { setPaidBreak(false); setBreakPay(''); }} style={[toggleBtn, !paidBreak ? toggleBtnActive : null]}>
              <Text style={[toggleBtnText, !paidBreak ? toggleBtnTextActive : null]}>No</Text>
            </Pressable>
          </View>
          {paidBreak && (
            <>
              <Text style={labelStyle}>Break pay amount ($)</Text>
              {Platform.OS === 'web' ? (
                <View style={[inputStyle, webInputWrap]}>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={breakPay}
                    onChange={(e) => setBreakPay(e.target.value)}
                    style={webNumberInput}
                  />
                </View>
              ) : (
                <TextInput
                  style={inputStyle}
                  value={breakPay}
                  onChangeText={setBreakPay}
                  keyboardType="numeric"
                />
              )}
            </>
          )}
        </>
      )}
    </>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' }}>
          <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }} keyboardShouldPersistTaps="handled">

            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg }}>
              <Text style={{ fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>
                Post a New Shift
              </Text>
              <Pressable onPress={() => { reset(); onClose(); }}>
                <Text style={{ fontSize: 24, color: Colors.text.muted }}>✕</Text>
              </Pressable>
            </View>

            {step === 'workers' && (
              <View style={workersSectionCard}>
                <Text style={sectionHintText}>How many workers do you want to hire?</Text>
                <View style={stepperWrap}>
                  <Pressable style={stepperBtn} onPress={() => setWorkersByStepper((workerCountNumber || 1) - 1)}>
                    <Text style={stepperBtnText}>-</Text>
                  </Pressable>
                  <Text style={stepperCount}>{workerCountNumber || 1}</Text>
                  <Pressable style={stepperBtn} onPress={() => setWorkersByStepper((workerCountNumber || 1) + 1)}>
                    <Text style={stepperBtnText}>+</Text>
                  </Pressable>
                </View>
                <Pressable style={nextBtn} onPress={handleNextFromWorkers}>
                  <Text style={nextBtnText}>Next</Text>
                </Pressable>
              </View>
            )}

            {step === 'mode' && (
              <View style={workersSectionCard}>
                <Text style={sectionHintText}>Will workers work on same shift?</Text>
                <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: 4 }}>
                  <Pressable onPress={() => setSameShift(true)} style={[toggleBtn, sameShift ? toggleBtnActive : null]}>
                    <Text style={[toggleBtnText, sameShift ? toggleBtnTextActive : null]}>Same Shift</Text>
                  </Pressable>
                  <Pressable onPress={() => setSameShift(false)} style={[toggleBtn, !sameShift ? toggleBtnActive : null]}>
                    <Text style={[toggleBtnText, !sameShift ? toggleBtnTextActive : null]}>Individual</Text>
                  </Pressable>
                </View>
                <View style={stepActions}>
                  <Pressable style={ghostBtn} onPress={() => setStep('workers')}>
                    <Text style={ghostBtnText}>Back</Text>
                  </Pressable>
                  <Pressable style={nextBtn} onPress={handleNextFromMode}>
                    <Text style={nextBtnText}>Next</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {step === 'workerDetails' && (
              <View style={workersSectionCard}>
                <Text style={sectionHintText}>Worker {activeWorkerIndex + 1} Details</Text>
                <Text style={helperText}>Set shift start and end time (up to 24 hours, overnight allowed).</Text>
                <Text style={labelStyle}>Shift Type *</Text>
                <View style={{ flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.sm }}>
                  {SHIFT_TIME_PRESETS.map((preset) => (
                    <Pressable
                      key={preset.key}
                      onPress={() => applyShiftPreset(preset.key, 'worker', activeWorkerIndex)}
                      style={[toggleBtn, workerShiftPresets[activeWorkerIndex] === preset.key ? toggleBtnActive : null]}
                    >
                      <Text style={[toggleBtnText, workerShiftPresets[activeWorkerIndex] === preset.key ? toggleBtnTextActive : null]}>
                        {preset.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={labelStyle}>Shift Start Time * (AM/PM)</Text>
                <Pressable style={[inputStyle, timePickerField]} onPress={() => openTimePickerFor('worker', 'start', activeWorkerIndex)}>
                  <Text style={{ color: workerShifts[activeWorkerIndex]?.start ? Colors.text.primary : Colors.text.muted }}>
                    {workerShifts[activeWorkerIndex]?.start || 'Select start time'}
                  </Text>
                </Pressable>
                <Text style={labelStyle}>Shift End Time * (AM/PM)</Text>
                <Pressable style={[inputStyle, timePickerField]} onPress={() => openTimePickerFor('worker', 'end', activeWorkerIndex)}>
                  <Text style={{ color: workerShifts[activeWorkerIndex]?.end ? Colors.text.primary : Colors.text.muted }}>
                    {workerShifts[activeWorkerIndex]?.end || 'Select end time'}
                  </Text>
                </Pressable>
                {Platform.OS === 'web'
                  && timeTarget.scope === 'worker'
                  && timeTarget.index === activeWorkerIndex
                  && ['start', 'end'].includes(timeTarget.field) && (
                    <View style={{ marginTop: Spacing.xs, padding: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.surfaceSecondary }}>
                      <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.xs, marginBottom: 6 }}>Select time</Text>
                      <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                        <View style={{ flex: 1 }}>
                          <select value={webPickerHour} onChange={(e) => setWebPickerHour(e.target.value)} style={webSelectStyle}>
                            {Array.from({ length: 12 }, (_, idx) => String(idx + 1)).map((h) => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </View>
                        <View style={{ flex: 1 }}>
                          <select value={webPickerMinute} onChange={(e) => setWebPickerMinute(e.target.value)} style={webSelectStyle}>
                            {Array.from({ length: 60 }, (_, idx) => String(idx).padStart(2, '0')).map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </View>
                        <View style={{ flex: 1 }}>
                          <select value={webPickerPeriod} onChange={(e) => setWebPickerPeriod(e.target.value)} style={webSelectStyle}>
                            {['AM', 'PM'].map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.sm }}>
                        <Pressable onPress={() => setTimeTarget({ scope: '', field: '', index: -1 })}>
                          <Text style={{ color: Colors.text.muted }}>Cancel</Text>
                        </Pressable>
                        <Pressable onPress={applyWebPickedTimeValue}>
                          <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.semibold }}>Set Time</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                <Text style={helperText}>Up to 24 hours. Overnight shift is allowed.</Text>
                {renderCommonDetailsFields()}
                <View style={stepActions}>
                  <Pressable style={ghostBtn} onPress={() => (activeWorkerIndex === 0 ? setStep('mode') : setActiveWorkerIndex((p) => p - 1))}>
                    <Text style={ghostBtnText}>Back</Text>
                  </Pressable>
                  <Pressable style={nextBtn} onPress={handleWorkerNext} disabled={saving}>
                    <Text style={nextBtnText}>
                      {activeWorkerIndex === workerCountNumber - 1 ? (saving ? 'Posting...' : 'Post Shift') : 'Next Worker'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {step === 'details' && (
              <>
                {(workerCountNumber === 1 || sameShift) && (
                  <View style={workersSectionCard}>
                    <Text style={sectionHintText}>Shift Timing</Text>
                    <Text style={labelStyle}>Shift Type *</Text>
                    <View style={{ flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.sm }}>
                      {SHIFT_TIME_PRESETS.map((preset) => (
                        <Pressable
                          key={preset.key}
                          onPress={() => applyShiftPreset(preset.key, 'common')}
                          style={[toggleBtn, commonShiftPreset === preset.key ? toggleBtnActive : null]}
                        >
                          <Text style={[toggleBtnText, commonShiftPreset === preset.key ? toggleBtnTextActive : null]}>
                            {preset.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={labelStyle}>Shift Start Time * (AM/PM)</Text>
                    <Pressable style={[inputStyle, timePickerField]} onPress={() => openTimePickerFor('common', 'start')}>
                      <Text style={{ color: startTime ? Colors.text.primary : Colors.text.muted }}>
                        {startTime || 'Select start time'}
                      </Text>
                    </Pressable>
                    <Text style={labelStyle}>Shift End Time * (AM/PM)</Text>
                    <Pressable style={[inputStyle, timePickerField]} onPress={() => openTimePickerFor('common', 'end')}>
                      <Text style={{ color: endTime ? Colors.text.primary : Colors.text.muted }}>
                        {endTime || 'Select end time'}
                      </Text>
                    </Pressable>
                    {Platform.OS === 'web'
                      && timeTarget.scope === 'common'
                      && ['start', 'end'].includes(timeTarget.field) && (
                        <View style={{ marginTop: Spacing.xs, padding: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.surfaceSecondary }}>
                          <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.xs, marginBottom: 6 }}>Select time</Text>
                          <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                            <View style={{ flex: 1 }}>
                              <select value={webPickerHour} onChange={(e) => setWebPickerHour(e.target.value)} style={webSelectStyle}>
                                {Array.from({ length: 12 }, (_, idx) => String(idx + 1)).map((h) => <option key={h} value={h}>{h}</option>)}
                              </select>
                            </View>
                            <View style={{ flex: 1 }}>
                              <select value={webPickerMinute} onChange={(e) => setWebPickerMinute(e.target.value)} style={webSelectStyle}>
                                {Array.from({ length: 60 }, (_, idx) => String(idx).padStart(2, '0')).map((m) => <option key={m} value={m}>{m}</option>)}
                              </select>
                            </View>
                            <View style={{ flex: 1 }}>
                              <select value={webPickerPeriod} onChange={(e) => setWebPickerPeriod(e.target.value)} style={webSelectStyle}>
                                {['AM', 'PM'].map((p) => <option key={p} value={p}>{p}</option>)}
                              </select>
                            </View>
                          </View>
                          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.sm }}>
                            <Pressable onPress={() => setTimeTarget({ scope: '', field: '', index: -1 })}>
                              <Text style={{ color: Colors.text.muted }}>Cancel</Text>
                            </Pressable>
                            <Pressable onPress={applyWebPickedTimeValue}>
                              <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.semibold }}>Set Time</Text>
                            </Pressable>
                          </View>
                        </View>
                      )}
                    <Text style={helperText}>Up to 24 hours. Overnight shift is allowed.</Text>
                  </View>
                )}

                {renderCommonDetailsFields()}

                <View style={stepActions}>
                  <Pressable style={ghostBtn} onPress={() => setStep(workerCountNumber >= 2 ? (sameShift ? 'mode' : 'workerDetails') : 'workers')}>
                    <Text style={ghostBtnText}>Back</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleCreate}
                    disabled={saving}
                    style={({ pressed }) => [nextBtn, { opacity: pressed ? 0.8 : 1, backgroundColor: saving ? Colors.text.muted : Colors.primary }]}
                  >
                    <Text style={nextBtnText}>{saving ? 'Posting...' : 'Post Shift'}</Text>
                  </Pressable>
                </View>
              </>
            )}

            {Platform.OS !== 'web' && NativeDatePicker && (
              <NativeDatePicker
                modal
                open={showNativeTimePicker}
                date={nativePickerValue}
                mode="time"
                onConfirm={(pickedDate) => {
                  setShowNativeTimePicker(false);
                  const pickedValue = from24hToAmPm(
                    `${String(pickedDate.getHours()).padStart(2, '0')}:${String(pickedDate.getMinutes()).padStart(2, '0')}`
                  );
                  applyPickedTimeValue(pickedValue);
                  if (timeTarget.scope === 'common') {
                    if (timeTarget.field === 'start') {
                      setCommonShiftPreset(getShiftPresetFromStartTime(pickedValue));
                    }
                  } else if (timeTarget.field === 'start') {
                    const autoPreset = getShiftPresetFromStartTime(pickedValue);
                    setWorkerShiftPresets((prev) => prev.map((item, idx) => (idx === timeTarget.index ? autoPreset : item)));
                  }
                }}
                onCancel={() => setShowNativeTimePicker(false)}
              />
            )}

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const labelStyle = {
  fontSize: Typography.fontSize.sm,
  color: Colors.text.secondary,
  marginBottom: 4,
  marginTop: Spacing.sm,
};
const inputStyle = {
  backgroundColor: Colors.surfaceSecondary,
  borderWidth: 1,
  borderColor: Colors.border,
  borderRadius: Radius.md,
  paddingVertical: Spacing.sm,
  paddingHorizontal: Spacing.md,
  fontSize: Typography.fontSize.base,
  color: Colors.text.primary,
  marginBottom: Spacing.sm,
};
const timePickerField = {
  justifyContent: 'center',
  minHeight: 44,
};
const stepperWrap = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: Spacing.md,
  marginVertical: Spacing.md,
};
const stepperBtn = {
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: Colors.primary,
  alignItems: 'center',
  justifyContent: 'center',
};
const stepperBtnText = {
  color: Colors.text.white,
  fontSize: 22,
  fontWeight: Typography.fontWeight.bold,
};
const stepperCount = {
  minWidth: 48,
  textAlign: 'center',
  fontSize: Typography.fontSize.xl,
  color: Colors.text.primary,
  fontWeight: Typography.fontWeight.bold,
};
const stepActions = {
  flexDirection: 'row',
  gap: Spacing.sm,
  marginTop: Spacing.md,
};
const nextBtn = {
  flex: 1,
  backgroundColor: Colors.primary,
  borderRadius: Radius.md,
  alignItems: 'center',
  justifyContent: 'center',
  paddingVertical: Spacing.sm,
  marginTop: Spacing.md,
};
const nextBtnText = {
  color: Colors.text.white,
  fontWeight: Typography.fontWeight.semibold,
};
const ghostBtn = {
  flex: 1,
  backgroundColor: Colors.surfaceSecondary,
  borderWidth: 1,
  borderColor: Colors.border,
  borderRadius: Radius.md,
  alignItems: 'center',
  justifyContent: 'center',
  paddingVertical: Spacing.sm,
  marginTop: Spacing.md,
};
const ghostBtnText = {
  color: Colors.text.secondary,
  fontWeight: Typography.fontWeight.semibold,
};
const hourChip = {
  flex: 1,
  borderWidth: 1,
  borderColor: Colors.border,
  borderRadius: Radius.md,
  paddingVertical: Spacing.sm,
  alignItems: 'center',
  backgroundColor: Colors.surface,
};
const hourChipActive = {
  borderColor: Colors.primary,
  backgroundColor: 'rgba(16, 185, 129, 0.12)',
};
const webInputWrap = {
  justifyContent: 'center',
  minHeight: 44,
  paddingVertical: 6,
};
const webTimeInput = {
  width: '100%',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: '#0f172a',
  fontSize: 16,
};
const webNumberInput = {
  width: '100%',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: '#0f172a',
  fontSize: 16,
};
/** Native `<select>` style for web time pickers inside `CreateShiftModal` */
const webSelectStyle = {
  width: '100%',
  minHeight: 44,
  paddingVertical: Spacing.sm,
  paddingHorizontal: Spacing.sm,
  backgroundColor: Colors.surface,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: Colors.border,
  borderRadius: Radius.md,
  fontSize: Typography.fontSize.base,
  color: Colors.text.primary,
  boxSizing: 'border-box',
};
const workersSectionCard = {
  backgroundColor: 'transparent',
  borderRadius: Radius.md,
  borderWidth: 0,
  borderColor: 'transparent',
  padding: Spacing.md,
  marginBottom: Spacing.sm,
};
const workerShiftCard = {
  backgroundColor: 'transparent',
  borderRadius: Radius.md,
  borderWidth: 0,
  borderColor: 'transparent',
  padding: Spacing.sm,
  marginBottom: Spacing.sm,
};
const toggleBtn = {
  flex: 1,
  borderWidth: 1,
  borderColor: Colors.border,
  borderRadius: Radius.md,
  alignItems: 'center',
  justifyContent: 'center',
  paddingVertical: Spacing.sm,
  backgroundColor: Colors.surface,
};
const toggleBtnActive = {
  borderColor: Colors.primary,
  backgroundColor: 'rgba(16, 185, 129, 0.12)',
};
const toggleBtnText = {
  color: Colors.text.secondary,
  fontSize: Typography.fontSize.sm,
  fontWeight: Typography.fontWeight.semibold,
};
const toggleBtnTextActive = {
  color: Colors.primary,
};
const sectionHintText = {
  fontSize: Typography.fontSize.sm,
  color: Colors.text.primary,
  fontWeight: Typography.fontWeight.semibold,
  marginBottom: 2,
};
const miniLabelStyle = {
  fontSize: Typography.fontSize.xs,
  color: Colors.text.secondary,
  marginBottom: 4,
};
const helperText = {
  fontSize: Typography.fontSize.xs,
  color: Colors.text.muted,
};
const fallbackOverlay = {
  flex: 1,
  backgroundColor: 'rgba(0,0,0,0.4)',
  justifyContent: 'center',
  alignItems: 'center',
  padding: Spacing.lg,
};
const fallbackCard = {
  width: '100%',
  backgroundColor: Colors.surface,
  borderRadius: Radius.lg,
  padding: Spacing.md,
  borderWidth: 1,
  borderColor: Colors.border,
};

/** Participant: worker assigned to this shift (after you accept an application). */
function AssignedWorkerSummary({ shift, variant = 'card' }) {
  if (shift.status !== 'filled' || !shift.filled_by_worker_id) return null;
  const name = `${shift.assigned_worker_first_name || ''} ${shift.assigned_worker_last_name || ''}`.trim()
    || shift.assigned_worker_email
    || 'Assigned worker';
  const initial = (name || '?')[0].toUpperCase();
  const uri = shift.assigned_worker_profile_image_url ? String(shift.assigned_worker_profile_image_url).trim() : '';
  const rating = shift.assigned_worker_rating != null ? Number(shift.assigned_worker_rating) : 0;
  const reviews = shift.assigned_worker_total_reviews != null ? Number(shift.assigned_worker_total_reviews) : 0;
  const isCompact = variant === 'compact';
  const bioNumberOfLines = isCompact ? 4 : 6;

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: `${Colors.primary}12`,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: `${Colors.primary}44`,
      padding: isCompact ? Spacing.sm : Spacing.md,
      marginBottom: Spacing.sm,
    }}
    >
      <View style={{
        width: isCompact ? 52 : 64,
        height: isCompact ? 52 : 64,
        borderRadius: isCompact ? 26 : 32,
        backgroundColor: Colors.primary,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: Spacing.md,
      }}
      >
        {uri ? (
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <Text style={{ fontSize: isCompact ? 22 : 26, color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>{initial}</Text>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.primary, fontWeight: Typography.fontWeight.semibold, marginBottom: 2 }}>
          Worker for this shift
        </Text>
        <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>
          {name}
        </Text>
        {!!shift.assigned_worker_email && (
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 2 }} selectable>
            {shift.assigned_worker_email}
          </Text>
        )}
        {!!shift.assigned_worker_phone && (
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 2 }} selectable>
            {shift.assigned_worker_phone}
          </Text>
        )}
        {rating > 0 && (
          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginTop: 4 }}>
            {`Rating ${rating.toFixed(1)}${reviews > 0 ? ` (${reviews} review${reviews === 1 ? '' : 's'})` : ''}`}
          </Text>
        )}
        {shift.assigned_worker_public_hourly_rate != null && Number(shift.assigned_worker_public_hourly_rate) > 0 && (
          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginTop: 2 }}>
            {`Profile rate: $${Number(shift.assigned_worker_public_hourly_rate).toFixed(2)}/hr`}
          </Text>
        )}
        {!!shift.assigned_worker_bio && (
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.xs }} numberOfLines={bioNumberOfLines}>
            {shift.assigned_worker_bio}
          </Text>
        )}
      </View>
    </View>
  );
}

// ── Shift Card ────────────────────────────────────────────────────────────────
function ShiftCard({ shift, onApply, isWorker, isParticipant, onOpenApplications }) {
  const startDate = new Date(shift.start_time);
  const endDate = new Date(shift.end_time);
  const isShiftExpired = startDate.getTime() <= Date.now();
  const payEst = getShiftPayEstimate(shift.start_time, shift.end_time, shift.hourly_rate, shift.description, {
    sleepoverFlatAmount: shift.sleepover_flat_amount != null ? Number(shift.sleepover_flat_amount) : 0,
    travelKm: shift.travel_distance_km != null ? Number(shift.travel_distance_km) : 0,
    travelRatePerKm: shift.travel_rate_per_km != null ? Number(shift.travel_rate_per_km) : undefined,
  });
  const hasUnpaidBreakDeduction = payEst.breakMinutes > 0 && !payEst.breakIsPaid && payEst.paidHoursAtRate < payEst.shiftHours - 1e-6;
  const hoursLabel = hasUnpaidBreakDeduction
    ? `${payEst.shiftDurationLabel} on site • ${payEst.paidDurationLabel} paid`
    : payEst.shiftDurationLabel;
  const workerAssigned = Boolean(shift?.is_assigned_to_me);
  const participantName =
    (shift?.participant_first_name || shift?.participant_last_name)
      ? `${shift.participant_first_name || ''} ${shift.participant_last_name || ''}`.trim()
      : (shift?.participant_email ? String(shift.participant_email).split('@')[0] : 'Participant');
  const shouldShowFullForWorker = workerAssigned;
  const canWorkerApply = isWorker
    && shift.status === 'open'
    && !isShiftExpired
    && (shift.within_travel_range !== false);

  const startTimeStr = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const endTimeStr = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateTimeLine = sameLocalCalendarDay(startDate, endDate)
    ? `${formatDateDMY(startDate)} • ${startTimeStr} – ${endTimeStr} (${hoursLabel})`
    : `${formatDateDMY(startDate)} ${startTimeStr} – ${formatDateDMY(endDate)} ${endTimeStr} (${hoursLabel})`;

  const cardContent = (
    <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.sm, ...Shadows.md }}>
      {!isWorker && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm }}>
          <View style={{ backgroundColor: getServiceColor(shift.service_type), paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full }}>
            <Text style={{ color: Colors.text.white, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold }}>
              {shift.service_type}
            </Text>
          </View>
          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted }}>{shift.application_count || 0} applicant(s)</Text>
        </View>
      )}

      <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.xs }}>
        {shift.title}
      </Text>

      {/* Worker: show only key info until selected/assigned */}
      {isWorker && !shouldShowFullForWorker ? (
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.sm }}>
          {participantName}
        </Text>
      ) : (
        <>
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: 4 }}>
            {dateTimeLine}
          </Text>

          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: 4 }}>
            ${Number(shift.hourly_rate || 0).toFixed(2)}/hr • ~${payEst.estimatedTotal.toFixed(2)} total
            {payEst.breakIsPaid && payEst.breakPay > 0 ? ' (includes break pay)' : ''}
          </Text>
        </>
      )}
      {payEst.breakMinutes > 0 && (!isWorker || shouldShowFullForWorker) && (
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: 4 }}>
          Break: {payEst.breakMinutes} min • Paid: {payEst.breakIsPaid ? `Yes${payEst.breakPay > 0 ? ` ($${payEst.breakPay.toFixed(2)})` : ''}` : 'No'}
        </Text>
      )}

      <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.sm }}>
        📍 {shift.location}
      </Text>

      {isParticipant && <AssignedWorkerSummary shift={shift} variant="card" />}

      {!isWorker && shift.participant_first_name && (
        <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginBottom: Spacing.sm }}>
          Posted by {shift.participant_first_name} {shift.participant_last_name}
        </Text>
      )}

      {isWorker && shift.status === 'open' && (
        <Pressable
          onPress={() => {
            if (!canWorkerApply) return;
            onApply(shift);
          }}
          disabled={!canWorkerApply}
          style={({ pressed }) => ({
            backgroundColor: canWorkerApply ? Colors.primary : Colors.surfaceSecondary,
            paddingVertical: Spacing.sm,
            borderRadius: Radius.md,
            alignItems: 'center',
            opacity: !canWorkerApply ? 0.6 : (pressed ? 0.8 : 1),
          })}
        >
          <Text style={{ color: canWorkerApply ? Colors.text.white : Colors.text.secondary, fontWeight: Typography.fontWeight.semibold }}>
            {canWorkerApply ? 'Apply for Shift' : (isShiftExpired ? 'Expired shift' : 'Out of range')}
          </Text>
        </Pressable>
      )}
      {isWorker && workerAssigned && (
        <View style={{ marginTop: Spacing.xs }}>
          <View style={{ backgroundColor: `${Colors.status.success}22`, borderRadius: Radius.full, paddingVertical: 6, paddingHorizontal: Spacing.sm, alignSelf: 'flex-start' }}>
            <Text style={{ color: Colors.status.success, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold }}>
              Assigned to you
            </Text>
          </View>
        </View>
      )}
      {isParticipant && (
        <Pressable
          onPress={() => onOpenApplications(shift)}
          style={({ pressed }) => ({
            backgroundColor: shift.status === 'open' ? Colors.primary : Colors.surfaceSecondary,
            paddingVertical: Spacing.sm,
            borderRadius: Radius.md,
            alignItems: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: shift.status === 'open' ? Colors.text.white : Colors.text.secondary, fontWeight: Typography.fontWeight.semibold }}>
            {shift.status === 'open' ? 'View Applicants' : 'View Shift Details'}
          </Text>
        </Pressable>
      )}
    </View>
  );

  if (!isParticipant) return cardContent;
  return (
    <Pressable onPress={() => onOpenApplications(shift)} style={({ pressed }) => ({ opacity: pressed ? 0.97 : 1 })}>
      {cardContent}
    </Pressable>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export function AvailableShiftsScreen({ navigation }) {
  const { user } = useAuthStore();
  const { restricted } = useWorkerGate();
  const isWorker = user?.role === 'worker';
  const isParticipant = user?.role === 'participant';

  useFocusEffect(
    useCallback(() => {
      if (restricted) {
        showVerificationRequiredAlert();
        if (navigation.canGoBack()) navigation.goBack();
        else navigation.navigate('MainTabs', { screen: 'Profile' });
      }
    }, [restricted, navigation])
  );

  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [earningsTotal, setEarningsTotal] = useState(0);
  const [earningsPending, setEarningsPending] = useState(0);
  const [showApplicantsModal, setShowApplicantsModal] = useState(false);
  const [selectedShift, setSelectedShift] = useState(null);
  const [applications, setApplications] = useState([]);
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [acceptingApplicationId, setAcceptingApplicationId] = useState(null);
  const [workerShiftTypeFilter, setWorkerShiftTypeFilter] = useState('all');
  const [showAwayShifts, setShowAwayShifts] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    visible: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
  });
  const [infoModal, setInfoModal] = useState({ visible: false, title: '', message: '' });
  const confirmActionRef = useRef(null);

  const openInfo = useCallback((title, message = '') => {
    const body = typeof message === 'string' && message.trim() ? message.trim() : '';
    if (Platform.OS === 'web') {
      setInfoModal({ visible: true, title: title || 'Notice', message: body });
    } else {
      nativeAlertOnly(title, body);
    }
  }, []);

  const closeInfo = useCallback(() => {
    setInfoModal((p) => ({ ...p, visible: false }));
  }, []);

  const openConfirm = useCallback(({ title, message, confirmText = 'Confirm', onConfirm }) => {
    confirmActionRef.current = typeof onConfirm === 'function' ? onConfirm : null;
    setConfirmModal({ visible: true, title, message, confirmText });
  }, []);

  const closeConfirm = useCallback(() => {
    confirmActionRef.current = null;
    setConfirmModal((p) => ({ ...p, visible: false }));
  }, []);

  const getShiftTypeForLocalTime = useCallback((isoTime) => {
    const d = new Date(isoTime);
    if (Number.isNaN(d.getTime())) return 'all';
    const h = d.getHours();
    if (h >= 5 && h < 12) return 'am';
    if (h >= 12 && h < 20) return 'pm';
    return 'night';
  }, []);

  useLayoutEffect(() => {
    const screenTitle = isWorker ? 'Available shifts' : isParticipant ? 'My shifts' : 'Shifts';
    navigation.setOptions({
      title: screenTitle,
      headerLeft: () => (
        <Pressable
          onPress={() => {
            if (typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
              navigation.goBack();
            } else {
              navigation.navigate('MainTabs');
            }
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ paddingLeft: 4, paddingVertical: 8, flexDirection: 'row', alignItems: 'center' }}
        >
          <NavChevron direction="left" color={Colors.text.white} size={22} />
        </Pressable>
      ),
      headerRight: isParticipant
        ? () => (
          <Pressable
            onPress={() => setShowCreateModal(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ paddingRight: 4, paddingVertical: 8, justifyContent: 'center', alignItems: 'center', minWidth: 44 }}
          >
            <Text style={{ color: Colors.text.white, fontSize: 28, fontWeight: '300', lineHeight: 30 }}>+</Text>
          </Pressable>
        )
        : undefined,
    });
  }, [navigation, isParticipant]);

  const loadShifts = useCallback(async () => {
    try {
      if (isWorker) {
        const [shiftsRes, paymentsRes] = await Promise.all([
          api.get('/api/shifts'),
          api.get('/api/payments/history'),
        ]);
        if (shiftsRes.data?.ok) setShifts(shiftsRes.data.shifts || []);
        if (paymentsRes.data?.ok) {
          const payments = paymentsRes.data.payments || [];
          const succeeded = payments.filter((p) => p.status === 'succeeded');
          const pending = payments.filter((p) => p.status === 'pending');
          setEarningsTotal(succeeded.reduce((s, p) => s + parseFloat(p.amount || 0), 0));
          setEarningsPending(pending.reduce((s, p) => s + parseFloat(p.amount || 0), 0));
        }
      } else if (isParticipant) {
        const { data } = await api.get('/api/shifts/mine');
        if (data?.ok) setShifts(data.shifts || []);
      }
    } catch (e) { }
    setLoading(false);
  }, [isWorker, isParticipant, workerShiftTypeFilter]);

  const { nearShifts, awayShifts, visibleShifts } = useMemo(() => {
    if (!isWorker) {
      const list = workerShiftTypeFilter === 'all'
        ? shifts
        : shifts.filter((s) => getShiftTypeForLocalTime(s.start_time) === workerShiftTypeFilter);
      return { nearShifts: list, awayShifts: [], visibleShifts: list };
    }

    const travelEnabled = shifts.some((s) => s?.travel_filter_enabled);
    const base = workerShiftTypeFilter === 'all'
      ? shifts
      : shifts.filter((s) => getShiftTypeForLocalTime(s.start_time) === workerShiftTypeFilter);

    if (!travelEnabled) {
      return { nearShifts: base, awayShifts: [], visibleShifts: base };
    }

    const near = base.filter((s) => s?.within_travel_range !== false);
    const away = base.filter((s) => s?.within_travel_range === false);
    return { nearShifts: near, awayShifts: away, visibleShifts: showAwayShifts ? [...near, ...away] : near };
  }, [shifts, isWorker, workerShiftTypeFilter, getShiftTypeForLocalTime, showAwayShifts]);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadShifts();
    setRefreshing(false);
  }, [loadShifts]);

  const handleApply = (shift) => {
    const confirmAction = () => applyForShift(shift.id);
    const pay = getShiftPayEstimate(shift.start_time, shift.end_time, shift.hourly_rate, shift.description, {
      sleepoverFlatAmount: shift.sleepover_flat_amount != null ? Number(shift.sleepover_flat_amount) : 0,
      travelKm: shift.travel_distance_km != null ? Number(shift.travel_distance_km) : 0,
      travelRatePerKm: shift.travel_rate_per_km != null ? Number(shift.travel_rate_per_km) : undefined,
    });
    const unpaidDed = pay.breakMinutes > 0 && !pay.breakIsPaid && pay.paidHoursAtRate < pay.shiftHours - 1e-6;
    const payLine = unpaidDed
      ? `\nOn site: ${pay.shiftDurationLabel} • Paid time: ${pay.paidDurationLabel}\nApprox. total: ~$${pay.estimatedTotal.toFixed(2)} (hourly rate × paid time only)`
      : `\nApprox. total: ~$${pay.estimatedTotal.toFixed(2)}`;
    const body = `Apply for "${shift.title}"?\n\nLabour: $${Number(shift.hourly_rate || 0).toFixed(2)}/hr${payLine}\nTime: ${new Date(shift.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(shift.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\nLocation: ${shift.location}`;
    if (Platform.OS === 'web') {
      openConfirm({
        title: 'Apply for shift',
        message: body,
        confirmText: 'Apply',
        onConfirm: confirmAction,
      });
    } else {
      Alert.alert(
        'Apply for Shift',
        body,
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Apply', onPress: confirmAction }]
      );
    }
  };

  const applyForShift = async (shiftId) => {
    const { error } = await api.post(`/api/shifts/${shiftId}/apply`, { message: 'I am interested in this shift.' });
    if (error) openInfo('Error', error.message || 'Failed to apply');
    else {
      openInfo(
        'Application Pending',
        'Your shift application is pending. It will be assigned to you once the employer accepts it.'
      );
      loadShifts();
    }
  };

  const openApplicants = async (shift) => {
    setSelectedShift(shift);
    setShowApplicantsModal(true);
    setApplications([]);
    setApplicationsLoading(true);
    const { data, error } = await api.get(`/api/shifts/${shift.id}`);
    if (error) {
      openInfo('Error', error.message || 'Failed to load applicants');
      setApplicationsLoading(false);
      return;
    }
    setSelectedShift(data?.shift || shift);
    setApplications(data?.applications || []);
    setApplicationsLoading(false);
  };

  const acceptApplicant = async (application) => {
    if (!selectedShift?.id || acceptingApplicationId) return;
    const doAccept = async () => {
      setAcceptingApplicationId(application.id);
      const { error } = await api.put(`/api/shifts/${selectedShift.id}/applications/${application.id}/accept`, {});
      setAcceptingApplicationId(null);
      if (error) {
        openInfo('Error', error.message || 'Failed to accept applicant');
        return;
      }
      openInfo('Worker selected', 'Booking confirmation was sent to the selected worker.');
      setShowApplicantsModal(false);
      setSelectedShift(null);
      setApplications([]);
      loadShifts();
    };

    if (Platform.OS === 'web') {
      openConfirm({
        title: 'Select worker',
        message: `Select ${application.worker_first_name || application.worker_email || 'this worker'} for "${selectedShift.title}"?`,
        confirmText: 'Select',
        onConfirm: doAccept,
      });
      return;
    }

    Alert.alert(
      'Select Worker',
      `Confirm ${application.worker_first_name || application.worker_email || 'this worker'} for this shift?`,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Confirm', onPress: doAccept }]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <FlatList
        data={visibleShifts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        renderItem={({ item }) => (
          <ShiftCard
            shift={item}
            onApply={handleApply}
            isWorker={isWorker}
            isParticipant={isParticipant}
            onOpenApplications={openApplicants}
          />
        )}
        ListHeaderComponent={
          <View style={{ marginBottom: Spacing.md }}>
            {isParticipant && (
              <Pressable
                onPress={() => setShowCreateModal(true)}
                style={({ pressed }) => ({
                  backgroundColor: Colors.primary,
                  borderRadius: Radius.lg,
                  paddingVertical: Spacing.md,
                  paddingHorizontal: Spacing.lg,
                  marginBottom: Spacing.md,
                  alignItems: 'center',
                  ...Shadows.md,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: Colors.text.white, fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold }}>
                  Add Shift
                </Text>
              </Pressable>
            )}
            {isWorker && (
              <View style={{ flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.md }}>
                {[
                  { key: 'all', label: 'All' },
                  { key: 'am', label: 'AM' },
                  { key: 'pm', label: 'PM' },
                  { key: 'night', label: 'Night' },
                ].map((option) => (
                  <Pressable
                    key={option.key}
                    onPress={() => setWorkerShiftTypeFilter(option.key)}
                    style={{
                      flex: 1,
                      paddingVertical: Spacing.xs,
                      borderRadius: Radius.full,
                      borderWidth: 1,
                      borderColor: workerShiftTypeFilter === option.key ? Colors.primary : Colors.border,
                      backgroundColor: workerShiftTypeFilter === option.key ? `${Colors.primary}22` : Colors.surface,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{
                      color: workerShiftTypeFilter === option.key ? Colors.primary : Colors.text.secondary,
                      fontSize: Typography.fontSize.xs,
                      fontWeight: Typography.fontWeight.semibold,
                    }}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            {isWorker && (
              <Pressable
                onPress={() => navigation.navigate('Earnings')}
                style={({ pressed }) => ({
                  backgroundColor: Colors.primary,
                  borderRadius: Radius.lg,
                  padding: Spacing.lg,
                  marginBottom: Spacing.md,
                  ...Shadows.md,
                  opacity: pressed ? 0.92 : 1,
                })}
              >
                <Text style={{ fontSize: Typography.fontSize.sm, color: 'rgba(255,255,255,0.85)', marginBottom: 4 }}>
                  Your earnings
                </Text>
                <Text style={{ fontSize: 34, fontWeight: Typography.fontWeight.bold, color: Colors.text.white }}>
                  ${earningsTotal.toFixed(2)}
                </Text>
                {earningsPending > 0 && (
                  <Text style={{ fontSize: Typography.fontSize.sm, color: 'rgba(255,255,255,0.75)', marginTop: 4 }}>
                    ${earningsPending.toFixed(2)} pending
                  </Text>
                )}
                <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.white, marginTop: Spacing.sm, fontWeight: Typography.fontWeight.semibold }}>
                  View breakdown →
                </Text>
              </Pressable>
            )}
            {isWorker && awayShifts.length > 0 && !showAwayShifts && (
              <View style={{ marginBottom: Spacing.md, marginTop: Spacing.sm, padding: Spacing.md, borderRadius: Radius.lg, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border }}>
                <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.semibold, marginBottom: 4 }}>
                  Some shifts are away from you
                </Text>
                <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm }}>
                  {awayShifts.length} shift(s) are outside your travel distance. You can view them, but you can’t apply.
                </Text>
                <Pressable
                  onPress={() => setShowAwayShifts(true)}
                  style={({ pressed }) => ({
                    alignSelf: 'flex-start',
                    marginTop: Spacing.sm,
                    paddingHorizontal: Spacing.md,
                    paddingVertical: 8,
                    borderRadius: Radius.full,
                    backgroundColor: `${Colors.primary}22`,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.semibold }}>
                    See anyway
                  </Text>
                </Pressable>
              </View>
            )}
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary }}>
              {isParticipant
                ? 'Your posted shifts are listed below. Use + in the header to add another shift anytime.'
                : 'Browse shifts by AM, PM, or Night and apply quickly.'}
            </Text>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: Spacing.xl }} />
          ) : (
            <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
              <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>
                {isParticipant ? 'No shifts posted yet' : 'No open shifts yet'}
              </Text>
              <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.xs, textAlign: 'center' }}>
                {isParticipant ? 'Use + in the header to post a shift.' : 'Check back later for new opportunities.'}
              </Text>
            </View>
          )
        }
      />

      <CreateShiftModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={loadShifts}
        onAppInfo={openInfo}
      />

      <Modal visible={showApplicantsModal} transparent animationType="slide" onRequestClose={() => setShowApplicantsModal(false)}>
        <View style={fallbackOverlay}>
          <View style={[fallbackCard, { maxHeight: '85%' }]}>
            <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>
              {selectedShift?.title || 'Shift Applicants'}
            </Text>
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.xs, marginBottom: Spacing.md }}>
              {selectedShift?.application_count || applications.length || 0} applicant(s)
            </Text>

            {applicationsLoading ? (
              <ActivityIndicator size="large" color={Colors.primary} style={{ marginVertical: Spacing.lg }} />
            ) : (
              <ScrollView style={{ maxHeight: 420 }}>
                {selectedShift?.status === 'filled' && (
                  <AssignedWorkerSummary shift={selectedShift} variant="compact" />
                )}
                {applications.length === 0 ? (
                  <Text style={{ color: Colors.text.secondary }}>
                    {selectedShift?.status === 'filled'
                      ? 'Assigned worker is shown above.'
                      : 'No applicants yet for this shift.'}
                  </Text>
                ) : (
                  applications.map((app) => (
                    <View
                      key={app.id}
                      style={{
                        borderWidth: 1,
                        borderColor: Colors.border,
                        borderRadius: Radius.md,
                        padding: Spacing.md,
                        marginBottom: Spacing.sm,
                        backgroundColor: Colors.surface,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                        <View style={{
                          width: 48,
                          height: 48,
                          borderRadius: 24,
                          backgroundColor: Colors.primary,
                          overflow: 'hidden',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: Spacing.sm,
                        }}
                        >
                          {app.worker_profile_image_url ? (
                            <Image source={{ uri: String(app.worker_profile_image_url) }} style={{ width: 48, height: 48 }} resizeMode="cover" />
                          ) : (
                            <Text style={{ fontSize: 20, color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>
                              {(app.worker_first_name || app.worker_email || '?')[0].toUpperCase()}
                            </Text>
                          )}
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>
                            {(app.worker_first_name || app.worker_last_name) ? `${app.worker_first_name || ''} ${app.worker_last_name || ''}`.trim() : (app.worker_email || 'Worker')}
                          </Text>
                          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginTop: 2 }}>
                            {app.worker_email || 'No email'}
                            {app.worker_rating ? ` • Rating ${Number(app.worker_rating).toFixed(1)}` : ''}
                            {app.worker_total_reviews ? ` (${app.worker_total_reviews} reviews)` : ''}
                          </Text>
                          {!!app.worker_phone && (
                            <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginTop: 2 }} selectable>{app.worker_phone}</Text>
                          )}
                        </View>
                      </View>
                      {!!app.worker_bio && (
                        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.xs }} numberOfLines={3}>
                          {app.worker_bio}
                        </Text>
                      )}
                      {!!app.message && (
                        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.xs }}>
                          "{app.message}"
                        </Text>
                      )}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm }}>
                        <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, textTransform: 'capitalize' }}>
                          Status: {app.status || 'pending'}
                        </Text>
                        {selectedShift?.status === 'open' && (app.status || 'pending') === 'pending' && (
                          <Pressable
                            onPress={() => acceptApplicant(app)}
                            disabled={!!acceptingApplicationId}
                            style={({ pressed }) => ({
                              backgroundColor: Colors.primary,
                              paddingHorizontal: Spacing.md,
                              paddingVertical: 8,
                              borderRadius: Radius.md,
                              opacity: acceptingApplicationId ? 0.7 : (pressed ? 0.85 : 1),
                            })}
                          >
                            <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>
                              {acceptingApplicationId === app.id ? 'Selecting...' : 'Select Worker'}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            )}

            <Pressable
              onPress={() => setShowApplicantsModal(false)}
              style={({ pressed }) => ({
                marginTop: Spacing.md,
                borderWidth: 1,
                borderColor: Colors.border,
                borderRadius: Radius.md,
                paddingVertical: Spacing.sm,
                alignItems: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: Colors.text.secondary, fontWeight: Typography.fontWeight.semibold }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Web-only confirm modal (avoid browser alert/confirm) */}
      {Platform.OS === 'web' && (
        <Modal visible={confirmModal.visible} transparent animationType="fade" onRequestClose={closeConfirm}>
          <View style={fallbackOverlay}>
            <View style={[fallbackCard, { maxWidth: 520 }]}>
              <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>
                {confirmModal.title || 'Confirm'}
              </Text>
              <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.sm, whiteSpace: 'pre-wrap' }}>
                {confirmModal.message || ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md }}>
                <Pressable
                  onPress={closeConfirm}
                  style={({ pressed }) => ({
                    flex: 1,
                    backgroundColor: Colors.surfaceSecondary,
                    borderWidth: 1,
                    borderColor: Colors.border,
                    borderRadius: Radius.md,
                    paddingVertical: Spacing.sm,
                    alignItems: 'center',
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text style={{ color: Colors.text.secondary, fontWeight: Typography.fontWeight.semibold }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const fn = confirmActionRef.current;
                    closeConfirm();
                    try { fn?.(); } catch (_) {}
                  }}
                  style={({ pressed }) => ({
                    flex: 1,
                    backgroundColor: Colors.primary,
                    borderRadius: Radius.md,
                    paddingVertical: Spacing.sm,
                    alignItems: 'center',
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>
                    {confirmModal.confirmText || 'Confirm'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {Platform.OS === 'web' && (
        <Modal visible={infoModal.visible} transparent animationType="fade" onRequestClose={closeInfo}>
          <View style={fallbackOverlay}>
            <View style={[fallbackCard, { maxWidth: 420 }]}>
              <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>
                {infoModal.title || 'Notice'}
              </Text>
              <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.sm, whiteSpace: 'pre-wrap' }}>
                {infoModal.message || ''}
              </Text>
              <Pressable
                onPress={closeInfo}
                style={({ pressed }) => ({
                  marginTop: Spacing.lg,
                  backgroundColor: Colors.primary,
                  borderRadius: Radius.md,
                  paddingVertical: Spacing.sm,
                  alignItems: 'center',
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>OK</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}