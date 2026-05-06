/**
 * Summit Staffing – Find a worker (workers browse shifts) / My shifts (participants).
 */
import React, { useEffect, useState, useCallback, useLayoutEffect, useRef, useMemo } from 'react';
import {
  View, Text, FlatList, Pressable, RefreshControl, Alert, Modal,
  TextInput, ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import * as PlacesPkg from 'react-native-google-places-autocomplete';
import { useAuthStore } from '../store/authStore.js';
import { api, ApiConfig } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';
import { SERVICE_TYPES } from '../constants/serviceTypes.js';
import { NavChevron } from '../components/NavChevron.js';
let DateTimePicker = null;
if (Platform.OS !== 'web') {
  try {
    DateTimePicker = require('@react-native-community/datetimepicker').default;
  } catch (_) {
    DateTimePicker = null;
  }
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
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
          {monthNames[viewMonth]} {viewYear}
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

// ── Create Shift Modal ────────────────────────────────────────────────────────
function CreateShiftModal({ visible, onClose, onCreated }) {
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
  const [step, setStep] = useState('workers');
  const [activeWorkerIndex, setActiveWorkerIndex] = useState(0);
  const commonStartWebRef = useRef(null);
  const [addBreak, setAddBreak] = useState(false);
  const [breakMinutes, setBreakMinutes] = useState('');
  const [paidBreak, setPaidBreak] = useState(false);
  const [breakPay, setBreakPay] = useState('');

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

  const openTimePickerFor = (scope, field, index = 0) => {
    let current = '';
    if (scope === 'common') {
      current = field === 'start' ? startTime : endTime;
    } else {
      current = field === 'start' ? (workerShifts[index]?.start || '') : (workerShifts[index]?.end || '');
    }
    setTimeTarget({ scope, field, index });
    if (Platform.OS === 'web') {
      if (scope === 'common' && field === 'start') {
        commonStartWebRef.current?.showPicker?.();
      }
      return;
    }
    if (DateTimePicker) {
      setNativePickerValue(toPickerDate(current));
      setShowNativeTimePicker(true);
      return;
    }
    Alert.alert(
      'Time picker unavailable',
      'Native date/time picker is missing in this build. Please reinstall the latest app build.'
    );
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
      Alert.alert('Missing Fields', 'Please enter how many workers you want.');
      return false;
    }

    if (count === 1 || sameShift) {
      if (!startTime || !endTime) {
        Alert.alert('Missing Fields', 'Please enter start and end time.');
        return false;
      }
      if (!isValidTime(startTime) || !isValidTime(endTime)) {
        Alert.alert('Invalid Time', 'Please enter valid start and end times.');
        return false;
      }
      const durationMin = getShiftDurationMinutes(startTime, endTime);
      if (!durationMin || durationMin > MAX_SHIFT_HOURS * 60) {
        Alert.alert('Invalid Time', `Shift must be between 1 minute and ${MAX_SHIFT_HOURS} hours.`);
        return false;
      }
      return true;
    }

    for (let i = 0; i < workerShifts.length; i++) {
      const shift = workerShifts[i];
      if (!shift.start || !shift.end) {
        Alert.alert('Missing Fields', `Please enter start and end time for Worker ${i + 1}.`);
        return false;
      }
      if (!isValidTime(shift.start) || !isValidTime(shift.end)) {
        Alert.alert('Invalid Time', `Please enter valid start/end times for Worker ${i + 1}.`);
        return false;
      }
      const durationMin = getShiftDurationMinutes(shift.start, shift.end);
      if (!durationMin || durationMin > MAX_SHIFT_HOURS * 60) {
        Alert.alert('Invalid Time', `Worker ${i + 1} shift must be between 1 minute and ${MAX_SHIFT_HOURS} hours.`);
        return false;
      }
    }
    return true;
  };

  const validateBreakFields = () => {
    if (!addBreak) return true;
    const minutes = parseInt(breakMinutes, 10);
    if (!minutes || minutes < 1) {
      Alert.alert('Invalid Break', 'Please enter break duration in minutes.');
      return false;
    }
    const shiftDurationMin = getShiftDurationMinutes(startTime, endTime);
    if (shiftDurationMin && minutes >= shiftDurationMin) {
      Alert.alert('Invalid Break', 'Break duration must be less than total shift duration.');
      return false;
    }
    if (paidBreak) {
      const pay = parseFloat(breakPay);
      if (Number.isNaN(pay) || pay < 0) {
        Alert.alert('Invalid Break Pay', 'Please enter a valid paid break amount.');
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
    if (!title || !serviceType || !hourlyRate || !date || !location) {
      Alert.alert('Missing Fields', 'Please fill in all required fields.');
      return false;
    }
    return true;
  };

  const handleCreate = async () => {
    const count = parseInt(workersCount, 10) || 0;
    if (count < 1) {
      Alert.alert('Missing Fields', 'Please select workers count.');
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
      Alert.alert('Invalid Time', 'Please enter valid times in AM/PM format.');
      return;
    }
    if (!validateBreakFields()) return;
    const breakMin = parseInt(breakMinutes, 10) || 0;
    const durationMin = getShiftDurationMinutes(primaryShift.start, primaryShift.end) || 0;
    if (addBreak && breakMin >= durationMin) {
      Alert.alert('Invalid Break', 'Break duration must be less than total shift duration.');
      return;
    }
    const endDayOffset = endMinutes <= startMinutes ? 1 : 0;
    const start_time = combineDateAndTimeIso(date, primaryShift.start, 0);
    const end_time = combineDateAndTimeIso(date, primaryShift.end, endDayOffset);
    if (!start_time || !end_time) {
      Alert.alert('Invalid Time', 'Please enter a valid shift start time.');
      return;
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
        hourly_rate: parseFloat(hourlyRate),
        start_time,
        end_time,
        location,
        description: fullDescription,
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
        Alert.alert('Error', error.message || 'Failed to create shift');
      } else {
        Alert.alert('Success', 'Shift posted successfully!');
        reset();
        onClose();
        onCreated?.();
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to create shift');
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
      Alert.alert('Missing Fields', 'Please choose how many workers you want to hire.');
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
      Alert.alert('Missing Fields', `Please set start time and shift hours for Worker ${activeWorkerIndex + 1}.`);
      return;
    }
    if (activeWorkerIndex < workerCountNumber - 1) {
      setActiveWorkerIndex((prev) => prev + 1);
      return;
    }
    handleCreate();
  };

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

      <Text style={labelStyle}>Hourly Rate ($) *</Text>
      <TextInput style={inputStyle} value={hourlyRate} onChangeText={setHourlyRate} keyboardType="numeric" />

      <Text style={labelStyle}>Date *</Text>
      <Pressable onPress={() => setShowCalendar(!showCalendar)} style={[inputStyle, { justifyContent: 'center' }]}>
        <Text style={{ color: date ? Colors.text.primary : Colors.text.muted }}>{date || 'Select a date...'}</Text>
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
            placeholder="Start typing street, suburb, or city"
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

      <Text style={labelStyle}>Description</Text>
      <TextInput style={[inputStyle, { height: 80, textAlignVertical: 'top' }]} value={description} onChangeText={setDescription} multiline />

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
                {Platform.OS === 'web' ? (
                  <View style={[inputStyle, webInputWrap]}>
                    <input
                      type="time"
                      step={900}
                      value={to24hString(workerShifts[activeWorkerIndex]?.start)}
                      onChange={(e) => {
                        const picked = from24hToAmPm(e.target.value);
                        setWorkerShiftPresets((prev) => prev.map((item, idx) => (idx === activeWorkerIndex ? '' : item)));
                        setWorkerShifts((prev) => prev.map((item, idx) => (
                          idx === activeWorkerIndex ? { ...item, start: picked } : item
                        )));
                      }}
                      style={webTimeInput}
                    />
                  </View>
                ) : (
                  <Pressable style={[inputStyle, timePickerField]} onPress={() => openTimePickerFor('worker', 'start', activeWorkerIndex)}>
                    <Text style={{ color: workerShifts[activeWorkerIndex]?.start ? Colors.text.primary : Colors.text.muted }}>
                      {workerShifts[activeWorkerIndex]?.start || 'Select start time'}
                    </Text>
                  </Pressable>
                )}
                <Text style={labelStyle}>Shift End Time * (AM/PM)</Text>
                {Platform.OS === 'web' ? (
                  <View style={[inputStyle, webInputWrap]}>
                    <input
                      type="time"
                      step={900}
                      value={to24hString(workerShifts[activeWorkerIndex]?.end)}
                      onChange={(e) => {
                        const picked = from24hToAmPm(e.target.value);
                        setWorkerShiftPresets((prev) => prev.map((item, idx) => (idx === activeWorkerIndex ? '' : item)));
                        setWorkerShifts((prev) => prev.map((item, idx) => (
                          idx === activeWorkerIndex ? { ...item, end: picked } : item
                        )));
                      }}
                      style={webTimeInput}
                    />
                  </View>
                ) : (
                  <Pressable style={[inputStyle, timePickerField]} onPress={() => openTimePickerFor('worker', 'end', activeWorkerIndex)}>
                    <Text style={{ color: workerShifts[activeWorkerIndex]?.end ? Colors.text.primary : Colors.text.muted }}>
                      {workerShifts[activeWorkerIndex]?.end || 'Select end time'}
                    </Text>
                  </Pressable>
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
                    {Platform.OS === 'web' ? (
                      <View style={[inputStyle, webInputWrap]}>
                        <input
                          ref={commonStartWebRef}
                          type="time"
                          step={900}
                          value={to24hString(startTime)}
                          onChange={(e) => {
                            const picked = from24hToAmPm(e.target.value);
                            setCommonShiftPreset('');
                            setStartTime(picked);
                          }}
                          style={webTimeInput}
                        />
                      </View>
                    ) : (
                      <Pressable style={[inputStyle, timePickerField]} onPress={() => openTimePickerFor('common', 'start')}>
                        <Text style={{ color: startTime ? Colors.text.primary : Colors.text.muted }}>
                          {startTime || 'Select start time'}
                        </Text>
                      </Pressable>
                    )}
                    <Text style={labelStyle}>Shift End Time * (AM/PM)</Text>
                    {Platform.OS === 'web' ? (
                      <View style={[inputStyle, webInputWrap]}>
                        <input
                          type="time"
                          step={900}
                          value={to24hString(endTime)}
                          onChange={(e) => {
                            setCommonShiftPreset('');
                            setEndTime(from24hToAmPm(e.target.value));
                          }}
                          style={webTimeInput}
                        />
                      </View>
                    ) : (
                      <Pressable style={[inputStyle, timePickerField]} onPress={() => openTimePickerFor('common', 'end')}>
                        <Text style={{ color: endTime ? Colors.text.primary : Colors.text.muted }}>
                          {endTime || 'Select end time'}
                        </Text>
                      </Pressable>
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

            {Platform.OS !== 'web' && showNativeTimePicker && DateTimePicker && (
              <DateTimePicker
                value={nativePickerValue}
                mode="time"
                is24Hour={false}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, selectedTime) => {
                  setShowNativeTimePicker(false);
                  if (!selectedTime) return;
                  applyPickedTimeValue(from24hToAmPm(
                    `${String(selectedTime.getHours()).padStart(2, '0')}:${String(selectedTime.getMinutes()).padStart(2, '0')}`,
                  ));
                  if (timeTarget.scope === 'common') {
                    setCommonShiftPreset('');
                  } else {
                    setWorkerShiftPresets((prev) => prev.map((item, idx) => (idx === timeTarget.index ? '' : item)));
                  }
                }}
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

// ── Shift Card ────────────────────────────────────────────────────────────────
function ShiftCard({ shift, onApply, isWorker, isParticipant, onOpenApplications }) {
  const startDate = new Date(shift.start_time);
  const endDate = new Date(shift.end_time);
  const isShiftExpired = startDate.getTime() <= Date.now();
  const hours = ((endDate - startDate) / (1000 * 60 * 60)).toFixed(1);
  const breakMeta = (shift.description || '').match(/Break:\s*(\d+)\s*min\s*\|\s*Paid break:\s*(Yes|No)(?:\s*\|\s*Break pay:\s*\$([0-9.]+))?/i);
  const breakMinutes = breakMeta ? breakMeta[1] : null;
  const breakIsPaid = breakMeta ? (breakMeta[2] || '').toLowerCase() === 'yes' : false;
  const breakPay = breakMeta && breakMeta[3] ? parseFloat(breakMeta[3]) : 0;
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
            {startDate.toLocaleDateString()} • {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({hours}h)
          </Text>

          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: 4 }}>
            ${parseFloat(shift.hourly_rate).toFixed(2)}/hr • ~${(parseFloat(shift.hourly_rate) * parseFloat(hours)).toFixed(2)} total
          </Text>
        </>
      )}
      {!isWorker && breakMinutes && (
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: 4 }}>
          Break: {breakMinutes} min • Paid: {breakIsPaid ? `Yes ($${breakPay.toFixed(2)})` : 'No'}
        </Text>
      )}

      <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.sm }}>
        📍 {shift.location}
      </Text>

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
  const isWorker = user?.role === 'worker';
  const isParticipant = user?.role === 'participant';

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
  const confirmActionRef = useRef(null);

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
    if (Platform.OS === 'web') {
      openConfirm({
        title: 'Apply for shift',
        message: `Apply for "${shift.title}"?\n\nRate: $${parseFloat(shift.hourly_rate).toFixed(2)}/hr\nTime: ${new Date(shift.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(shift.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\nLocation: ${shift.location}`,
        confirmText: 'Apply',
        onConfirm: confirmAction,
      });
    } else {
      Alert.alert(
        'Apply for Shift',
        `Apply for "${shift.title}"?\n\nRate: $${parseFloat(shift.hourly_rate).toFixed(2)}/hr\nTime: ${new Date(shift.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(shift.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}\nLocation: ${shift.location}`,
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Apply', onPress: confirmAction }]
      );
    }
  };

  const applyForShift = async (shiftId) => {
    const { error } = await api.post(`/api/shifts/${shiftId}/apply`, { message: 'I am interested in this shift.' });
    if (error) Alert.alert('Error', error.message || 'Failed to apply');
    else {
      Alert.alert(
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
      Alert.alert('Error', error.message || 'Failed to load applicants');
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
        Alert.alert('Error', error.message || 'Failed to accept applicant');
        return;
      }
      Alert.alert('Worker selected', 'Booking confirmation was sent to the selected worker.');
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
                {applications.length === 0 ? (
                  <Text style={{ color: Colors.text.secondary }}>No applicants yet for this shift.</Text>
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
                      <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>
                        {(app.worker_first_name || app.worker_last_name) ? `${app.worker_first_name || ''} ${app.worker_last_name || ''}`.trim() : (app.worker_email || 'Worker')}
                      </Text>
                      <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginTop: 2 }}>
                        {app.worker_email || 'No email'}{app.worker_rating ? ` • Rating ${app.worker_rating}` : ''}
                      </Text>
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
    </View>
  );
}