/**
 * Summit Staffing – Worker Management Screen
 * Skills, Documents, Availability, all from Profile tab
 */
import React, { useEffect, useState, useCallback, useMemo, useRef, createElement } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, ActivityIndicator, RefreshControl, Platform, Modal } from 'react-native';
import { api } from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';
import { useAccountAccess } from '../context/WorkerGateContext.js';
import { ComplianceDocumentsPanel } from '../components/ComplianceDocumentsPanel.js';
import { WorkerSkillsPanel } from '../components/WorkerSkillsPanel.js';
import { REQUIRED_WORKER_COMPLIANCE_DOCS, getLatestDocumentForType } from '../utils/complianceProgress.js';
import { WORKER_DOCUMENT_CATALOG } from '../utils/workerDocumentCatalog.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';
import { formatDateDMY } from '../utils/dateFormat.js';
import { VENDOR_CATEGORIES } from '../constants/vendorCategories.js';
import NativeDatePicker from '../components/NativeDatePicker.js';

const DAY_OPTIONS = [
  { key: 'monday', label: 'Monday', dayIndex: 1 },
  { key: 'tuesday', label: 'Tuesday', dayIndex: 2 },
  { key: 'wednesday', label: 'Wednesday', dayIndex: 3 },
  { key: 'thursday', label: 'Thursday', dayIndex: 4 },
  { key: 'friday', label: 'Friday', dayIndex: 5 },
  { key: 'saturday', label: 'Saturday', dayIndex: 6 },
  { key: 'sunday', label: 'Sunday', dayIndex: 0 },
];
const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/;
const WEB_SELECT_STYLE = {
  width: '100%',
  boxSizing: 'border-box',
  backgroundColor: Colors.surface,
  borderColor: Colors.border,
  borderRadius: 8,
  borderWidth: 1,
  padding: '8px',
  color: Colors.text.primary,
};
const DOC_TYPES = WORKER_DOCUMENT_CATALOG;
const STATUS = {
  not_started: { label: 'Not started', color: Colors.text.muted, icon: '⚪' },
  pending: { label: 'Pending review', color: Colors.status.warning, icon: '🟡' },
  action_required: { label: 'Action required', color: Colors.status.error, icon: '🔴' },
  verified: { label: 'Verified', color: Colors.status.success, icon: '🟢' },
};
const STATUS_ORDER = { not_started: 0, pending: 1, action_required: 2, verified: 3 };
const CORE_VENDOR_OPTIONS = VENDOR_CATEGORIES;

const Section = ({ title, children }) => (
  <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadows.sm }}>
    <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.md }}>{title}</Text>
    {children}
  </View>
);

const to12Hour = (time24 = '09:00') => {
  const [hRaw = '09', m = '00'] = String(time24).split(':');
  const h = Math.max(0, Math.min(23, Number(hRaw) || 0));
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { hour: String(hour12), minute: m.padStart(2, '0'), period };
};

const to24Hour = (hour12, minute, period) => {
  const h = Math.max(1, Math.min(12, Number(hour12) || 12));
  const m = Math.max(0, Math.min(59, Number(minute) || 0));
  let hour24 = h % 12;
  if (String(period).toUpperCase() === 'PM') hour24 += 12;
  return `${String(hour24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const format12HourLabel = (time24 = '09:00') => {
  const { hour, minute, period } = to12Hour(time24);
  return `${hour}:${minute} ${period}`;
};

const format12HourRange = (startTime = '09:00', endTime = '17:00') =>
  `${format12HourLabel(startTime)} - ${format12HourLabel(endTime)}`;

const getMinutesFromTime24 = (time24 = '00:00') => {
  const [h, m] = String(time24).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return (h * 60) + m;
};

const normalizeTime24 = (value, fallback = '09:00') => {
  const raw = String(value || '').trim();
  const match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) return fallback;
  const hh = String(Number(match[1])).padStart(2, '0');
  const mm = match[2];
  return `${hh}:${mm}`;
};

export function WorkerManageScreen({ route, navigation }) {
  const { refresh, syncFromWorkerProfile } = useAccountAccess();
  const passedWorkerId = route?.params?.workerId;
  const availabilityOnly = route?.params?.availabilityOnly === true;
  const [workerId, setWorkerId] = useState(passedWorkerId || null);
  const [worker, setWorker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addingSkill, setAddingSkill] = useState(false);
  /** e.g. "add:taxi driver" | "remove:taxi driver" | "remove:<uuid>" — skill API in flight */
  const [skillBusyKey, setSkillBusyKey] = useState(null);
  const [availability, setAvailability] = useState([]);
  const [savingAvail, setSavingAvail] = useState(false);
  const [setupFirstName, setSetupFirstName] = useState('');
  const [setupLastName, setSetupLastName] = useState('');
  const [settingUp, setSettingUp] = useState(false);
  const [connectStatus, setConnectStatus] = useState(null);
  const [expandedCard, setExpandedCard] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [timePickerTarget, setTimePickerTarget] = useState(null);
  const [nativePickerValue, setNativePickerValue] = useState(() => {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    return d;
  });
  const [showNativeTimePicker, setShowNativeTimePicker] = useState(false);
  const [showFallbackTimeModal, setShowFallbackTimeModal] = useState(false);
  const [fallbackHour, setFallbackHour] = useState('9');
  const [fallbackMinute, setFallbackMinute] = useState('00');
  const [fallbackPeriod, setFallbackPeriod] = useState('AM');
  const [webPickerHour, setWebPickerHour] = useState('9');
  const [webPickerMinute, setWebPickerMinute] = useState('00');
  const [webPickerPeriod, setWebPickerPeriod] = useState('AM');
  const scrollRef = useRef(null);
  const documentsSectionY = useRef(0);
  const [focusDocumentType, setFocusDocumentType] = useState(route?.params?.focusDocument || null);

  const scrollToDocuments = useCallback((documentType) => {
    if (documentType) setFocusDocumentType(documentType);
    requestAnimationFrame(() => {
      const y = Math.max(0, documentsSectionY.current - 12);
      scrollRef.current?.scrollTo?.({ y, animated: true });
    });
  }, []);

  useEffect(() => {
    const focus = route?.params?.focusDocument;
    if (focus && worker) {
      setFocusDocumentType(focus);
      const t = setTimeout(() => scrollToDocuments(focus), 400);
      return () => clearTimeout(t);
    }
  }, [route?.params?.focusDocument, worker, scrollToDocuments]);

  const load = useCallback(async () => {
    try {
      // If no workerId passed, fetch from /me first
      let wId = workerId;
      if (!wId) {
        const meRes = await api.get('/api/workers/me');
        if (meRes.data?.ok && meRes.data?.worker) {
          const w = meRes.data.worker;
          // /me returns skills, availability, documents as separate fields
          w.skills = meRes.data.skills || w.skills || [];
          w.availability = meRes.data.availability || w.availability || [];
          w.documents = meRes.data.documents || w.documents || [];
          wId = w.id;
          setWorkerId(wId);
          setWorker(w);
          setAvailability(w.availability);
          syncFromWorkerProfile(w, w.documents);
          try {
            const pay = await api.get('/api/payments/connect/status');
            if (pay.data?.ok) setConnectStatus(pay.data);
          } catch (_) {}
          setLoading(false);
          return;
        }
        setLoading(false);
        return;
      }
      // When fetching by ID, also use /me if we're the worker
      const { data } = await api.get('/api/workers/me');
      if (data?.ok && data?.worker) {
        const w = data.worker;
        w.skills = data.skills || w.skills || [];
        w.availability = data.availability || w.availability || [];
        w.documents = data.documents || w.documents || [];
        setWorker(w);
        setAvailability(w.availability);
      }
      try {
        const pay = await api.get('/api/payments/connect/status');
        if (pay.data?.ok) setConnectStatus(pay.data);
      } catch (_) {}
    } catch (e) {}
    setLoading(false);
  }, [workerId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const refreshSkillsOnly = useCallback(async () => {
    try {
      const { data } = await api.get('/api/workers/me');
      if (data?.ok) {
        setWorker((prev) => (prev ? { ...prev, skills: data.skills || [] } : prev));
      }
    } catch (_) {}
  }, []);

  const compliance = useMemo(() => {
    if (!worker) {
      return { cards: [], pct: 0, overall: 'not_started', hardBlock: false, softBlock: false };
    }

    const docs = worker.documents || [];
    const skillNames = (worker.skills || []).map((s) => (s.skill_name || '').toLowerCase());
    const hasCoreVendorSkill = skillNames.some((s) => CORE_VENDOR_OPTIONS.map((x) => x.toLowerCase()).includes(s));

    const docStatus = (type) => {
      const doc = getLatestDocumentForType(docs, type);
      if (!doc) return 'not_started';
      const st = (doc.status || '').toLowerCase();
      if (st === 'approved') return 'verified';
      if (st === 'pending') return 'pending';
      if (st === 'rejected' || st === 'expired') return 'action_required';
      return 'pending';
    };

    const hasLegalEntity = !!(worker.first_name || worker.last_name);
    const hasABN = !!(worker.abn && String(worker.abn).replace(/\D/g, '').length >= 11);
    const coreInfoStatus = hasLegalEntity && hasABN ? 'verified' : (hasLegalEntity || hasABN ? 'pending' : 'not_started');
    const contactStatus = worker.phone && worker.address ? 'verified' : ((worker.phone || worker.address) ? 'pending' : 'not_started');
    const hasBankOnFile = !!(connectStatus?.bank_account?.last4);
    const bankStatus = hasBankOnFile || connectStatus?.charges_enabled
      ? 'verified'
      : connectStatus?.details_submitted
        ? 'pending'
        : 'not_started';

    const cardDefinitions = [
      {
        id: 'company_identity',
        title: 'Name Identity',
        items: [
          { key: 'legal', label: 'Legal entity name', status: coreInfoStatus, actionLabel: 'Edit profile', action: () => navigation.navigate('EditProfile') },
          { key: 'abn', label: 'ABN provided', status: hasABN ? 'verified' : 'action_required', actionLabel: 'Edit profile', action: () => navigation.navigate('EditProfile') },
          { key: 'contact', label: 'Contact details', status: contactStatus, actionLabel: 'Edit profile', action: () => navigation.navigate('EditProfile') },
        ],
      },
      {
        id: 'financials',
        title: 'Financials',
        items: [
          {
            key: 'bank',
            label: 'Bank account for payouts',
            status: bankStatus,
            actionLabel: hasBankOnFile ? 'View bank details' : 'Add bank details',
            action: () => navigation.navigate('Payments'),
          },
        ],
      },
      {
        id: 'risk',
        title: 'Risk Management',
        items: [
          { key: 'insurance', label: 'Insurance document', status: docStatus('insurance'), docType: 'insurance' },
          { key: 'police', label: 'National Police Check', status: docStatus('police_check'), docType: 'police_check' },
        ],
      },
      {
        id: 'care_standards',
        title: 'Care Standards',
        items: [
          { key: 'ndis', label: 'NDIS Worker Screening', status: docStatus('ndis_screening'), docType: 'ndis_screening' },
          { key: 'blue', label: 'Blue Card / WWCC', status: docStatus('wwcc'), docType: 'wwcc' },
          { key: 'yellow', label: 'Yellow Card (QLD)', status: docStatus('yellow_card'), docType: 'yellow_card' },
          { key: 'firstaid', label: 'First Aid / CPR', status: docStatus('first_aid'), docType: 'first_aid' },
          { key: 'manual', label: 'Manual Handling', status: docStatus('manual_handling'), docType: 'manual_handling' },
        ],
      },
      {
        id: 'service_setup',
        title: 'Service Setup',
        items: [
          { key: 'categories', label: 'Vendor service categories selected', status: hasCoreVendorSkill ? 'verified' : 'action_required' },
          { key: 'availability', label: 'Weekly availability set', status: (availability || []).some((a) => a.is_available) ? 'verified' : 'pending' },
        ],
      },
    ];

    const withStatus = cardDefinitions.map((card) => {
      const all = card.items.map((i) => STATUS_ORDER[i.status] ?? 0);
      const cardStatus = card.items.some((i) => i.status === 'action_required')
        ? 'action_required'
        : card.items.some((i) => i.status === 'pending')
          ? 'pending'
          : card.items.every((i) => i.status === 'verified')
            ? 'verified'
            : 'not_started';
      return {
        ...card,
        status: cardStatus,
        completed: card.items.filter((i) => i.status === 'verified').length,
        total: card.items.length,
        _score: all.reduce((s, n) => s + n, 0),
      };
    });

    const totalItems = withStatus.reduce((s, c) => s + c.total, 0);
    const completedItems = withStatus.reduce((s, c) => s + c.completed, 0);
    const pct = totalItems ? Math.round((completedItems / totalItems) * 100) : 0;
    const hasRed = withStatus.some((c) => c.status === 'action_required');
    const hasYellow = withStatus.some((c) => c.status === 'pending');
    const overall = hasRed ? 'action_required' : hasYellow ? 'pending' : 'verified';

    const hardBlock = !hasABN || bankStatus !== 'verified' || docStatus('police_check') === 'action_required';
    const softBlock = !hardBlock && (overall !== 'verified');

    return { cards: withStatus, pct, overall, hardBlock, softBlock };
  }, [worker, availability, connectStatus, navigation]);

  const skillBusyId = (action, nameOrId) => `${action}:${String(nameOrId || '').toLowerCase()}`;

  const removeSkillSilent = async (skillId, skillName) => {
    if (!workerId || skillBusyKey) return;
    const busy = skillBusyId('remove', skillName || skillId);
    setSkillBusyKey(busy);
    const previous = worker?.skills || [];
    setWorker((prev) => (prev ? { ...prev, skills: (prev.skills || []).filter((s) => s.id !== skillId) } : prev));
    try {
      const { error } = await api.delete(`/api/workers/${workerId}/skills/${skillId}`);
      if (error) {
        setWorker((prev) => (prev ? { ...prev, skills: previous } : prev));
        Alert.alert('Error', error.message);
      }
    } finally {
      setSkillBusyKey(null);
    }
  };

  const togglePresetSkill = async (skillName) => {
    if (!workerId || skillBusyKey) return;
    const existing = (worker?.skills || []).find(
      (s) => (s.skill_name || '').toLowerCase() === skillName.toLowerCase(),
    );
    const busy = existing ? skillBusyId('remove', skillName) : skillBusyId('add', skillName);
    setSkillBusyKey(busy);
    const previous = worker?.skills || [];
    try {
      if (existing) {
        setWorker((prev) => (prev ? { ...prev, skills: (prev.skills || []).filter((s) => s.id !== existing.id) } : prev));
        const { error } = await api.delete(`/api/workers/${workerId}/skills/${existing.id}`);
        if (error) {
          setWorker((prev) => (prev ? { ...prev, skills: previous } : prev));
          Alert.alert('Error', error.message || 'Failed to remove service');
        }
        return;
      }
      const tempId = `temp-${Date.now()}`;
      setWorker((prev) => ({
        ...prev,
        skills: [...(prev?.skills || []), { id: tempId, skill_name: skillName }],
      }));
      const { data, error } = await api.post(`/api/workers/${workerId}/skills`, { skill_name: skillName });
      if (error) {
        setWorker((prev) => (prev ? { ...prev, skills: (prev.skills || []).filter((s) => s.id !== tempId) } : prev));
        Alert.alert('Error', error.message || 'Failed to add service');
        return;
      }
      if (data?.skill) {
        setWorker((prev) => ({
          ...prev,
          skills: (prev?.skills || []).map((s) => (s.id === tempId ? data.skill : s)),
        }));
      } else {
        await refreshSkillsOnly();
      }
    } finally {
      setSkillBusyKey(null);
    }
  };

  const addCustomSkill = async (name) => {
    if (!name?.trim() || !workerId) return;
    setAddingSkill(true);
    const trimmed = name.trim();
    const duplicate = (worker?.skills || []).some(
      (s) => (s.skill_name || '').toLowerCase() === trimmed.toLowerCase(),
    );
    if (duplicate) {
      Alert.alert('Already added', 'This service is already on your profile.');
      setAddingSkill(false);
      return;
    }
    const tempId = `temp-${Date.now()}`;
    setWorker((prev) => ({
      ...prev,
      skills: [...(prev?.skills || []), { id: tempId, skill_name: trimmed }],
    }));
    const { data, error } = await api.post(`/api/workers/${workerId}/skills`, { skill_name: trimmed });
    if (error) {
      setWorker((prev) => (prev ? { ...prev, skills: (prev.skills || []).filter((s) => s.id !== tempId) } : prev));
      Alert.alert('Error', error.message);
    } else if (data?.skill) {
      setWorker((prev) => ({
        ...prev,
        skills: (prev?.skills || []).map((s) => (s.id === tempId ? data.skill : s)),
      }));
    } else {
      await refreshSkillsOnly();
    }
    setAddingSkill(false);
  };

  const toggleDaySlot = (dayIndex) => {
    setAvailability(prev => {
      const existing = prev.find(a => a.day_of_week === dayIndex);
      if (existing) {
        return prev.map(a => a.day_of_week === dayIndex ? { ...a, is_available: !a.is_available } : a);
      }
      return [
        ...prev,
        {
          day_of_week: dayIndex,
          start_time: '09:00',
          end_time: '17:00',
          is_available: true,
        },
      ];
    });
  };

  const updateDayTime = (dayIndex, field, value) => {
    const cleaned = normalizeTime24(value, field === 'start_time' ? '09:00' : '17:00');
    setAvailability(prev => {
      const existing = prev.find(a => a.day_of_week === dayIndex);
      if (existing) {
        return prev.map(a => a.day_of_week === dayIndex ? { ...a, [field]: cleaned } : a);
      }
      return [
        ...prev,
        {
          day_of_week: dayIndex,
          start_time: field === 'start_time' ? cleaned : '09:00',
          end_time: field === 'end_time' ? cleaned : '17:00',
          is_available: true,
        },
      ];
    });
  };

  const openTimePicker = (dayIndex, field, currentValue) => {
    // eslint-disable-next-line no-console
    console.log('[AvailabilityTimePicker] open requested', {
      platform: Platform.OS,
      dayIndex,
      field,
      currentValue,
    });
    if (Platform.OS === 'web') {
      const parsed = to12Hour(currentValue);
      setWebPickerHour(parsed.hour);
      setWebPickerMinute(parsed.minute);
      setWebPickerPeriod(parsed.period);
      setTimePickerTarget({ dayIndex, field });
      // eslint-disable-next-line no-console
      console.log('[AvailabilityTimePicker] web picker target set', { dayIndex, field, parsed });
      return;
    }
    const normalized = normalizeTime24(currentValue, field === 'start_time' ? '09:00' : '17:00');
    const [h, m] = normalized.split(':').map(Number);
    const d = new Date();
    d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
    setNativePickerValue(d);
    setTimePickerTarget({ dayIndex, field });
    // eslint-disable-next-line no-console
    console.log('[AvailabilityTimePicker] native modal open', { dayIndex, field });
    setShowNativeTimePicker(true);
  };

  const applyFallbackTime = () => {
    if (!timePickerTarget) return;
    const value24 = to24Hour(fallbackHour, fallbackMinute, fallbackPeriod);
    updateDayTime(timePickerTarget.dayIndex, timePickerTarget.field, value24);
    setShowFallbackTimeModal(false);
  };

  const saveAvailability = async () => {
    const enabledSlots = (availability || []).filter((a) => a?.is_available);
    const hasInvalidTime = enabledSlots.some(
      (slot) => !TIME_24H_REGEX.test(slot.start_time || '') || !TIME_24H_REGEX.test(slot.end_time || ''),
    );
    if (hasInvalidTime) {
      Alert.alert('Invalid time', 'Please enter time in HH:MM format (e.g. 09:00, 18:30).');
      return;
    }
    setSavingAvail(true);
    const { error } = await api.put(`/api/workers/${workerId}/availability`, { availability });
    if (error) Alert.alert('Error', error.message);
    else Alert.alert('Success', 'Availability saved!');
    setSavingAvail(false);
  };

  const handleDocumentUpload = async ({ documentType, file, issueDate, expiryDate }) => {
    if (!workerId) return;
    setUploadingDoc(true);
    try {
      const form = new FormData();
      if (Platform.OS === 'web') {
        form.append('file', file, file.name || 'document');
      } else {
        form.append('file', {
          uri: file.uri,
          name: file.name || 'document.jpg',
          type: file.type || 'image/jpeg',
        });
      }
      form.append('documentType', documentType);
      form.append('issue_date', issueDate);
      form.append('expiry_date', expiryDate);

      const uploadPath = `/api/workers/${workerId}/documents`;
      const { error } = await api.post(uploadPath, form);
      if (error) {
        Alert.alert('Upload failed', error.message || 'Could not upload document');
        throw error;
      }
      Alert.alert('Uploaded', `${DOC_TYPES.find((d) => d.key === documentType)?.label || 'Document'} saved successfully.`);
      await load();
      await refresh();
    } catch (e) {
      if (e?.message) throw e;
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleSubmitVerification = async () => {
    const { data, error } = await api.post('/api/workers/me/submit-verification', {});
    if (error) {
      Alert.alert('Submit failed', error.message || 'Could not submit');
      return;
    }
    if (data?.ok) {
      Alert.alert('Submitted', data.message || 'Awaiting verification. An admin will review your documents.');
      await load();
      await refresh();
    }
  };

  if (loading) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>;
  }

  const runSetup = async () => {
    setSettingUp(true);
    const showError = (msg) => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(msg);
      else Alert.alert('Error', msg);
    };
    try {
      const { data, error } = await api.post('/api/workers/setup', {
        first_name: setupFirstName.trim() || undefined,
        last_name: setupLastName.trim() || undefined,
      });
      setSettingUp(false);
      if (error) {
        showError(error.message || 'Setup failed');
        return;
      }
      if (data?.ok && data?.worker) {
        setWorkerId(data.worker.id);
        setWorker({
          ...data.worker,
          skills: data.skills || [],
          availability: data.availability || [],
          documents: data.documents || [],
        });
        setAvailability(data.availability || []);
      } else {
        load();
      }
    } catch (e) {
      setSettingUp(false);
      showError(e?.message || 'Something went wrong');
    }
  };

  if (!worker) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: Spacing.lg, paddingTop: Spacing.xxl }}>
        <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm }}>
          Set up your worker profile
        </Text>
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.lg }}>
          You're logged in as a Support Worker but no profile exists yet. Create one to add skills, documents, and availability.
        </Text>
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: 4 }}>First name (optional)</Text>
        <TextInput
          style={{ backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, marginBottom: Spacing.md, color: Colors.text.primary }}
          placeholder="e.g. John"
          placeholderTextColor={Colors.text.muted}
          value={setupFirstName}
          onChangeText={setSetupFirstName}
        />
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: 4 }}>Last name (optional)</Text>
        <TextInput
          style={{ backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, marginBottom: Spacing.lg, color: Colors.text.primary }}
          placeholder="e.g. Smith"
          placeholderTextColor={Colors.text.muted}
          value={setupLastName}
          onChangeText={setSetupLastName}
        />
        <Pressable
          onPress={() => runSetup()}
          disabled={settingUp}
          style={({ pressed }) => ({
            backgroundColor: settingUp ? Colors.text.muted : Colors.primary,
            paddingVertical: Spacing.md,
            paddingHorizontal: Spacing.lg,
            borderRadius: Radius.md,
            alignItems: 'center',
            opacity: pressed ? 0.8 : 1,
            cursor: Platform.OS === 'web' ? 'pointer' : undefined,
          })}
        >
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>
            {settingUp ? 'Creating...' : 'Create worker profile'}
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >

      {!availabilityOnly && (
        <>
      {/* Onboarding Progress + Compliance Traffic Light */}
      <Section title=" Onboarding Progress">
        <View style={{ marginBottom: Spacing.sm }}>
          <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, marginBottom: 6 }}>
            Profile completion: {compliance.pct}%
          </Text>
          <View style={{ height: 10, borderRadius: Radius.full, backgroundColor: Colors.borderLight, overflow: 'hidden' }}>
            <View style={{ width: `${compliance.pct}%`, height: 10, backgroundColor: STATUS[compliance.overall].color }} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm }}>
          <Text style={{ fontSize: Typography.fontSize.base }}>{STATUS[compliance.overall].icon}</Text>
          <Text style={{ color: STATUS[compliance.overall].color, fontWeight: Typography.fontWeight.semibold }}>
            Overall compliance: {STATUS[compliance.overall].label}
          </Text>
        </View>
        {compliance.hardBlock && (
          <Text style={{ color: Colors.status.error, fontSize: Typography.fontSize.sm }}>
            Hard block: profile cannot be fully live until ABN, payout setup, and critical checks are complete.
          </Text>
        )}
        {!compliance.hardBlock && compliance.softBlock && (
          <Text style={{ color: Colors.status.warning, fontSize: Typography.fontSize.sm }}>
            Soft block: you can continue setup, but complete pending items to go fully live.
          </Text>
        )}
      </Section>

      <Section title=" Compliance Checklist">
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.md }}>
          Tap an incomplete item to jump to upload or bank setup on this page. Invoices are under the Documents tab.
        </Text>
        {compliance.cards.map((card) => (
          <View
            key={card.id}
            style={{
              borderWidth: 1,
              borderColor: Colors.border,
              borderRadius: Radius.md,
              marginBottom: Spacing.sm,
              overflow: 'hidden',
              backgroundColor: Colors.surface,
            }}
          >
            <Pressable
              onPress={() => setExpandedCard((prev) => (prev === card.id ? null : card.id))}
              style={{ padding: Spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <View style={{ flex: 1, paddingRight: Spacing.sm }}>
                <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.semibold }}>
                  {STATUS[card.status].icon} {card.title}
                </Text>
                <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.xs, marginTop: 2 }}>
                  {card.completed}/{card.total} verified
                </Text>
              </View>
              <Text style={{ color: Colors.text.muted }}>{expandedCard === card.id ? '▲' : '▼'}</Text>
            </Pressable>

            {expandedCard === card.id && (
              <View style={{ borderTopWidth: 1, borderTopColor: Colors.borderLight, padding: Spacing.md }}>
                {card.items.map((item) => {
                  const canUploadDoc = item.docType && item.status !== 'verified';
                  const canAct = item.action && item.status !== 'verified';
                  const isTappable = canUploadDoc || canAct;
                  const RowWrap = isTappable ? Pressable : View;
                  const rowPress = canUploadDoc
                    ? () => scrollToDocuments(item.docType)
                    : canAct
                      ? item.action
                      : undefined;
                  const rowStyle = isTappable
                    ? ({ pressed }) => ({
                        marginBottom: Spacing.sm,
                        paddingVertical: 4,
                        opacity: pressed ? 0.85 : 1,
                      })
                    : { marginBottom: Spacing.sm };
                  return (
                    <RowWrap key={item.key} onPress={rowPress} style={rowStyle}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ color: Colors.text.primary, flex: 1, marginRight: Spacing.sm }}>
                          {STATUS[item.status].icon} {item.label}
                        </Text>
                        <Text style={{ color: STATUS[item.status].color, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold }}>
                          {STATUS[item.status].label}
                        </Text>
                      </View>
                      {canUploadDoc ? (
                        <Text style={{ color: Colors.primary, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, marginTop: 4 }}>
                          Tap to upload below ↓
                        </Text>
                      ) : null}
                      {canAct && !canUploadDoc ? (
                        <Text style={{ color: Colors.primary, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, marginTop: 4 }}>
                          {item.actionLabel || 'Complete'} →
                        </Text>
                      ) : null}
                    </RowWrap>
                  );
                })}
              </View>
            )}
          </View>
        ))}
      </Section>

      <View
        onLayout={(e) => {
          documentsSectionY.current = e.nativeEvent.layout.y;
        }}
      >
        <Section title="Documents">
          <ComplianceDocumentsPanel
            title="Documents"
            subtitle="Upload each certificate (PDF or photo). All items are required before admin verification."
            docTypes={DOC_TYPES}
            documents={worker?.documents || []}
            requiredTypes={REQUIRED_WORKER_COMPLIANCE_DOCS}
            onUpload={handleDocumentUpload}
            uploading={uploadingDoc}
            verificationSubmittedAt={worker?.verification_submitted_at}
            verificationStatus={worker?.verification_status}
            onSubmitVerification={handleSubmitVerification}
            focusDocumentType={focusDocumentType}
          />
        </Section>
      </View>

      {/* Verification Status */}
      <Section title=" Verification Status">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: worker.verification_status === 'verified' ? Colors.status.success : Colors.status.warning }} />
          <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.semibold, textTransform: 'capitalize' }}>
            {worker.verification_status || 'pending'}
          </Text>
        </View>
      </Section>

      {/* Skills */}
      <Section title=" Skills & Services">
        <WorkerSkillsPanel
          skills={worker.skills || []}
          onToggleSkill={togglePresetSkill}
          onRemoveSkill={(id, name) => removeSkillSilent(id, name)}
          onAddCustomSkill={addCustomSkill}
          addingSkill={addingSkill}
          skillBusyKey={skillBusyKey}
        />
      </Section>
        </>
      )}

      {/* Availability */}
      <Section title=" Availability">
        {DAY_OPTIONS.map((day) => {
          const slot = availability.find(a => a.day_of_week === day.dayIndex);
          const isAvail = slot?.is_available ?? false;
          return (
            <View
              key={day.key}
              style={{
                paddingVertical: Spacing.md,
                borderBottomWidth: 1,
                borderBottomColor: Colors.borderLight,
              }}
            >
              <Pressable
                onPress={() => toggleDaySlot(day.dayIndex)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <View style={{ flex: 1, paddingRight: Spacing.sm }}>
                  <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.semibold }}>
                    {day.label}
                  </Text>
                </View>
                <View style={{ width: 44, height: 24, borderRadius: 12, backgroundColor: isAvail ? Colors.status.success : Colors.border, justifyContent: 'center', paddingHorizontal: 2 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.text.white, alignSelf: isAvail ? 'flex-end' : 'flex-start' }} />
                </View>
              </Pressable>

              {isAvail && (
                <View style={{ marginTop: Spacing.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, marginRight: Spacing.xs }}>
                      <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginBottom: 4 }}>
                        From
                      </Text>
                      <Pressable
                        onPress={() => openTimePicker(day.dayIndex, 'start_time', slot?.start_time || '09:00')}
                        style={({ pressed }) => ({
                          backgroundColor: Colors.surfaceSecondary,
                          borderWidth: 1,
                          borderColor: Colors.border,
                          borderRadius: Radius.md,
                          paddingVertical: 10,
                          paddingHorizontal: Spacing.sm,
                          opacity: pressed ? 0.85 : 1,
                        })}
                      >
                        <Text style={{ color: Colors.text.primary }}>
                          {format12HourLabel(slot?.start_time || '09:00')}
                        </Text>
                      </Pressable>
                    </View>
                    <View style={{ flex: 1, marginLeft: Spacing.xs }}>
                      <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginBottom: 4 }}>
                        To
                      </Text>
                      <Pressable
                        onPress={() => openTimePicker(day.dayIndex, 'end_time', slot?.end_time || '17:00')}
                        style={({ pressed }) => ({
                          backgroundColor: Colors.surfaceSecondary,
                          borderWidth: 1,
                          borderColor: Colors.border,
                          borderRadius: Radius.md,
                          paddingVertical: 10,
                          paddingHorizontal: Spacing.sm,
                          opacity: pressed ? 0.85 : 1,
                        })}
                      >
                        <Text style={{ color: Colors.text.primary }}>
                          {format12HourLabel(slot?.end_time || '17:00')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                  {Platform.OS === 'web' && timePickerTarget?.dayIndex === day.dayIndex && (
                    <View style={{ marginTop: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.surfaceSecondary }}>
                      <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.xs, marginBottom: 6 }}>
                        Select time
                      </Text>
                      <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                        <View style={{ flex: 1 }}>
                          {createElement('select', {
                            value: webPickerHour,
                            onChange: (e) => setWebPickerHour(e?.target?.value || '9'),
                            style: WEB_SELECT_STYLE,
                          }, Array.from({ length: 12 }, (_, idx) => String(idx + 1)).map((h) => createElement('option', { key: h, value: h }, h)))}
                        </View>
                        <View style={{ flex: 1 }}>
                          {createElement('select', {
                            value: webPickerMinute,
                            onChange: (e) => setWebPickerMinute(e?.target?.value || '00'),
                            style: WEB_SELECT_STYLE,
                          }, Array.from({ length: 60 }, (_, idx) => String(idx).padStart(2, '0')).map((m) => createElement('option', { key: m, value: m }, m)))}
                        </View>
                        <View style={{ flex: 1 }}>
                          {createElement('select', {
                            value: webPickerPeriod,
                            onChange: (e) => setWebPickerPeriod(e?.target?.value || 'AM'),
                            style: WEB_SELECT_STYLE,
                          }, ['AM', 'PM'].map((p) => createElement('option', { key: p, value: p }, p)))}
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.sm }}>
                        <Pressable onPress={() => setTimePickerTarget(null)}>
                          <Text style={{ color: Colors.text.muted }}>Cancel</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            if (!timePickerTarget) return;
                            const value24 = to24Hour(webPickerHour, webPickerMinute, webPickerPeriod);
                            updateDayTime(timePickerTarget.dayIndex, timePickerTarget.field, value24);
                            setTimePickerTarget(null);
                          }}
                        >
                          <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.semibold }}>Set Time</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                  <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginTop: 6 }}>
                    Overnight shift supported (e.g. 8:00 PM to 5:00 AM).
                  </Text>
                </View>
              )}
            </View>
          );
        })}
        <Pressable onPress={saveAvailability} disabled={savingAvail}
          style={({ pressed }) => ({ backgroundColor: Colors.primary, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center', marginTop: Spacing.md, opacity: pressed ? 0.8 : 1 })}>
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>{savingAvail ? 'Saving...' : 'Save Availability'}</Text>
        </Pressable>
        {Platform.OS !== 'web' && NativeDatePicker && (
          <NativeDatePicker
            modal
            open={showNativeTimePicker}
            date={nativePickerValue}
            mode="time"
            onConfirm={(selectedTime) => {
              setShowNativeTimePicker(false);
              if (!selectedTime || !timePickerTarget) return;
              const hh = String(selectedTime.getHours()).padStart(2, '0');
              const mm = String(selectedTime.getMinutes()).padStart(2, '0');
              updateDayTime(timePickerTarget.dayIndex, timePickerTarget.field, `${hh}:${mm}`);
            }}
            onCancel={() => setShowNativeTimePicker(false)}
          />
        )}
        <Modal
          visible={showFallbackTimeModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowFallbackTimeModal(false)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: Spacing.lg }}>
            <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, ...Shadows.md }}>
              <Text style={{ color: Colors.text.primary, fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, marginBottom: Spacing.sm }}>
                Select time
              </Text>
              <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {Array.from({ length: 12 }, (_, idx) => String(idx + 1)).map((h) => (
                    <Pressable
                      key={`h-${h}`}
                      onPress={() => setFallbackHour(h)}
                      style={{
                        minWidth: 34,
                        paddingVertical: 6,
                        paddingHorizontal: 8,
                        borderRadius: Radius.md,
                        borderWidth: 1,
                        borderColor: fallbackHour === h ? Colors.primary : Colors.border,
                        backgroundColor: fallbackHour === h ? `${Colors.primary}22` : Colors.surfaceSecondary,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: fallbackHour === h ? Colors.primary : Colors.text.secondary, fontSize: Typography.fontSize.xs }}>{h}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={{ marginTop: Spacing.sm, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {['00', '15', '30', '45'].map((m) => (
                  <Pressable
                    key={`m-${m}`}
                    onPress={() => setFallbackMinute(m)}
                    style={{
                      minWidth: 40,
                      paddingVertical: 6,
                      paddingHorizontal: 8,
                      borderRadius: Radius.md,
                      borderWidth: 1,
                      borderColor: fallbackMinute === m ? Colors.primary : Colors.border,
                      backgroundColor: fallbackMinute === m ? `${Colors.primary}22` : Colors.surfaceSecondary,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: fallbackMinute === m ? Colors.primary : Colors.text.secondary, fontSize: Typography.fontSize.xs }}>{m}</Text>
                  </Pressable>
                ))}
                {['AM', 'PM'].map((p) => (
                  <Pressable
                    key={`p-${p}`}
                    onPress={() => setFallbackPeriod(p)}
                    style={{
                      minWidth: 52,
                      paddingVertical: 6,
                      paddingHorizontal: 8,
                      borderRadius: Radius.md,
                      borderWidth: 1,
                      borderColor: fallbackPeriod === p ? Colors.primary : Colors.border,
                      backgroundColor: fallbackPeriod === p ? `${Colors.primary}22` : Colors.surfaceSecondary,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: fallbackPeriod === p ? Colors.primary : Colors.text.secondary, fontSize: Typography.fontSize.xs }}>{p}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.md }}>
                <Pressable onPress={() => setShowFallbackTimeModal(false)}>
                  <Text style={{ color: Colors.text.muted }}>Cancel</Text>
                </Pressable>
                <Pressable onPress={applyFallbackTime}>
                  <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.semibold }}>Set Time</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </Section>
    </ScrollView>
  );
}
