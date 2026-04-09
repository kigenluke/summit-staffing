/**
 * Summit Staffing – Worker Management Screen
 * Skills, Documents, Availability, all from Profile tab
 */
import React, { useEffect, useState, useCallback, useMemo, createElement } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, ActivityIndicator, RefreshControl, Platform } from 'react-native';
import { api } from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';
import { SERVICE_TYPES } from '../constants/serviceTypes.js';
import { VENDOR_CATEGORIES } from '../constants/vendorCategories.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOC_TYPES = [
  { key: 'ndis_screening', label: 'NDIS Worker Screening' },
  { key: 'wwcc', label: 'Working With Children Check' },
  { key: 'police_check', label: 'Police Check' },
  { key: 'first_aid', label: 'First Aid Certificate' },
  { key: 'insurance', label: 'Insurance' },
];
const DOC_STATUS_COLORS = { pending: Colors.status.warning, approved: Colors.status.success, rejected: Colors.status.error, expired: Colors.text.muted };
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

export function WorkerManageScreen({ route, navigation }) {
  const passedWorkerId = route?.params?.workerId;
  const [workerId, setWorkerId] = useState(passedWorkerId || null);
  const [worker, setWorker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newSkill, setNewSkill] = useState('');
  const [addingSkill, setAddingSkill] = useState(false);
  const [availability, setAvailability] = useState([]);
  const [savingAvail, setSavingAvail] = useState(false);
  const [setupFirstName, setSetupFirstName] = useState('');
  const [setupLastName, setSetupLastName] = useState('');
  const [settingUp, setSettingUp] = useState(false);
  const [connectStatus, setConnectStatus] = useState(null);
  const [expandedCard, setExpandedCard] = useState(null);
  const [selectedDocType, setSelectedDocType] = useState(DOC_TYPES[0].key);
  const [docIssueDate, setDocIssueDate] = useState('');
  const [docExpiryDate, setDocExpiryDate] = useState('');
  const [selectedDocFile, setSelectedDocFile] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

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

  const compliance = useMemo(() => {
    if (!worker) {
      return { cards: [], pct: 0, overall: 'not_started', hardBlock: false, softBlock: false };
    }

    const docs = worker.documents || [];
    const byType = Object.fromEntries(docs.map((d) => [d.document_type, d]));
    const skillNames = (worker.skills || []).map((s) => (s.skill_name || '').toLowerCase());
    const hasCoreVendorSkill = skillNames.some((s) => CORE_VENDOR_OPTIONS.map((x) => x.toLowerCase()).includes(s));

    const docStatus = (type) => {
      const doc = byType[type];
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
    const bankStatus = connectStatus?.charges_enabled ? 'verified' : (connectStatus ? 'pending' : 'not_started');

    const cardDefinitions = [
      {
        id: 'company_identity',
        title: 'Company Identity',
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
          { key: 'bank', label: 'Bank payout setup (Stripe)', status: bankStatus, actionLabel: 'Open payments', action: () => navigation.navigate('Payments') },
          { key: 'gst', label: 'GST status', status: 'not_started' },
        ],
      },
      {
        id: 'risk',
        title: 'Risk Management',
        items: [
          { key: 'insurance', label: 'Insurance document', status: docStatus('insurance'), actionLabel: 'Upload docs', action: () => navigation.navigate('Documents') },
          { key: 'police', label: 'National Police Check', status: docStatus('police_check'), actionLabel: 'Upload docs', action: () => navigation.navigate('Documents') },
        ],
      },
      {
        id: 'care_standards',
        title: 'Care Standards',
        items: [
          { key: 'ndis', label: 'NDIS Worker Screening', status: docStatus('ndis_screening'), actionLabel: 'Upload docs', action: () => navigation.navigate('Documents') },
          { key: 'blue', label: 'Blue Card / WWCC', status: docStatus('wwcc'), actionLabel: 'Upload docs', action: () => navigation.navigate('Documents') },
          { key: 'firstaid', label: 'First Aid / CPR', status: docStatus('first_aid'), actionLabel: 'Upload docs', action: () => navigation.navigate('Documents') },
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

  const addSkill = async () => {
    if (!newSkill.trim()) return;
    setAddingSkill(true);
    const { error } = await api.post(`/api/workers/${workerId}/skills`, { skill_name: newSkill.trim() });
    if (error) Alert.alert('Error', error.message);
    else { setNewSkill(''); load(); }
    setAddingSkill(false);
  };

  const addPresetSkill = async (skillName) => {
    if (!workerId) return;
    const already = (worker?.skills || []).some((s) => (s.skill_name || '').toLowerCase() === skillName.toLowerCase());
    if (already) return;
    const { error } = await api.post(`/api/workers/${workerId}/skills`, { skill_name: skillName });
    if (error) Alert.alert('Error', error.message || 'Failed to add service');
    else load();
  };

  const removeSkill = async (skillId) => {
    Alert.alert('Remove Skill', 'Remove this skill?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        const { error } = await api.delete(`/api/workers/${workerId}/skills/${skillId}`);
        if (error) Alert.alert('Error', error.message);
        else load();
      }},
    ]);
  };

  const toggleDay = (dayIndex) => {
    setAvailability(prev => {
      const existing = prev.find(a => a.day_of_week === dayIndex);
      if (existing) {
        return prev.map(a => a.day_of_week === dayIndex ? { ...a, is_available: !a.is_available } : a);
      }
      return [...prev, { day_of_week: dayIndex, start_time: '09:00', end_time: '17:00', is_available: true }];
    });
  };

  const saveAvailability = async () => {
    setSavingAvail(true);
    const { error } = await api.put(`/api/workers/${workerId}/availability`, { availability });
    if (error) Alert.alert('Error', error.message);
    else Alert.alert('Success', 'Availability saved!');
    setSavingAvail(false);
  };

  const uploadDocumentNow = async () => {
    if (!workerId) return;
    if (!selectedDocFile) {
      Alert.alert('Missing File', 'Please choose a file first.');
      return;
    }
    setUploadingDoc(true);
    try {
      const form = new FormData();
      form.append('file', selectedDocFile);
      form.append('documentType', selectedDocType);
      if (docIssueDate) form.append('issue_date', docIssueDate);
      if (docExpiryDate) form.append('expiry_date', docExpiryDate);

      const { error } = await api.post(`/api/workers/${workerId}/documents`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (error) {
        Alert.alert('Upload failed', error.message || 'Could not upload document');
      } else {
        Alert.alert('Success', 'Document uploaded and sent for review.');
        setSelectedDocFile(null);
        setDocIssueDate('');
        setDocExpiryDate('');
        load();
      }
    } catch (e) {
      Alert.alert('Upload failed', 'Could not upload document');
    }
    setUploadingDoc(false);
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
    <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>

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
                {card.items.map((item) => (
                  <View key={item.key} style={{ marginBottom: Spacing.sm }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ color: Colors.text.primary, flex: 1, marginRight: Spacing.sm }}>
                        {STATUS[item.status].icon} {item.label}
                      </Text>
                      <Text style={{ color: STATUS[item.status].color, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold }}>
                        {STATUS[item.status].label}
                      </Text>
                    </View>
                    {item.action && item.status !== 'verified' && (
                      <Pressable
                        onPress={item.action}
                        style={({ pressed }) => ({
                          alignSelf: 'flex-start',
                          marginTop: 6,
                          paddingHorizontal: Spacing.sm,
                          paddingVertical: 4,
                          borderRadius: Radius.full,
                          backgroundColor: `${Colors.primary}22`,
                          opacity: pressed ? 0.75 : 1,
                        })}
                      >
                        <Text style={{ color: Colors.primary, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold }}>
                          {item.actionLabel || 'Complete'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
      </Section>

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
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.sm }}>
          Core vendor categories (tap to add)
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.md }}>
          {CORE_VENDOR_OPTIONS.map((name) => {
            const selected = (worker.skills || []).some((s) => (s.skill_name || '').toLowerCase() === name.toLowerCase());
            return (
              <Pressable
                key={name}
                onPress={() => addPresetSkill(name)}
                style={{
                  borderRadius: Radius.full,
                  paddingHorizontal: Spacing.md,
                  paddingVertical: Spacing.xs,
                  borderWidth: 1,
                  borderColor: selected ? Colors.primary : Colors.border,
                  backgroundColor: selected ? `${Colors.primary}22` : Colors.surface,
                }}
              >
                <Text style={{ color: selected ? Colors.primary : Colors.text.secondary, fontWeight: Typography.fontWeight.medium }}>
                  {name}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.sm }}>
          All supported service tags
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.md }}>
          {SERVICE_TYPES.map((name) => {
            const selected = (worker.skills || []).some((s) => (s.skill_name || '').toLowerCase() === name.toLowerCase());
            return (
              <Pressable
                key={name}
                onPress={() => addPresetSkill(name)}
                style={{
                  borderRadius: Radius.full,
                  paddingHorizontal: Spacing.md,
                  paddingVertical: Spacing.xs,
                  borderWidth: 1,
                  borderColor: selected ? Colors.primary : Colors.border,
                  backgroundColor: selected ? `${Colors.primary}22` : Colors.surface,
                }}
              >
                <Text style={{ color: selected ? Colors.primary : Colors.text.secondary, fontWeight: Typography.fontWeight.medium }}>
                  {name}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.md }}>
          {(worker.skills || []).map(s => (
            <Pressable key={s.id} onPress={() => removeSkill(s.id)}
              style={{ backgroundColor: Colors.primaryLight + '20', borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.medium }}>{s.skill_name}</Text>
              <Text style={{ color: Colors.status.error, marginLeft: Spacing.xs }}></Text>
            </Pressable>
          ))}
          {(!worker.skills || worker.skills.length === 0) && <Text style={{ color: Colors.text.muted }}>No skills added yet</Text>}
        </View>
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <TextInput
            style={{ flex: 1, backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, color: Colors.text.primary }}
            placeholder="Add a skill..."
            placeholderTextColor={Colors.text.muted}
            value={newSkill}
            onChangeText={setNewSkill}
          />
          <Pressable onPress={addSkill} disabled={addingSkill}
            style={({ pressed }) => ({ backgroundColor: Colors.primary, paddingHorizontal: Spacing.lg, borderRadius: Radius.md, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
            <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>+</Text>
          </Pressable>
        </View>
      </Section>

      {/* Documents – upload info */}
      <Section title=" Documents (upload here)">
        {DOC_TYPES.map(dt => {
          const doc = (worker.documents || []).find(d => d.document_type === dt.key);
          return (
            <View key={dt.key} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.borderLight }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.medium }}>{dt.label}</Text>
                {doc?.expiry_date && <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted }}>Expires: {new Date(doc.expiry_date).toLocaleDateString()}</Text>}
              </View>
              {doc ? (
                <View style={{ backgroundColor: DOC_STATUS_COLORS[doc.status] || Colors.text.muted, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.full }}>
                  <Text style={{ color: Colors.text.white, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, textTransform: 'uppercase' }}>{doc.status}</Text>
                </View>
              ) : (
                <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted }}>Not uploaded</Text>
              )}
            </View>
          );
        })}
        <View style={{ marginTop: Spacing.md, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, backgroundColor: Colors.surfaceSecondary }}>
          <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.semibold, marginBottom: Spacing.sm }}>
            Upload vendor documentation
          </Text>

          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginBottom: 6 }}>Document type</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.sm }}>
            {DOC_TYPES.map((dt) => (
              <Pressable
                key={dt.key}
                onPress={() => setSelectedDocType(dt.key)}
                style={{
                  borderRadius: Radius.full,
                  paddingHorizontal: Spacing.sm,
                  paddingVertical: 5,
                  borderWidth: 1,
                  borderColor: selectedDocType === dt.key ? Colors.primary : Colors.border,
                  backgroundColor: selectedDocType === dt.key ? `${Colors.primary}22` : Colors.surface,
                }}
              >
                <Text style={{ color: selectedDocType === dt.key ? Colors.primary : Colors.text.secondary, fontSize: Typography.fontSize.xs }}>
                  {dt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginBottom: 4 }}>Issue date (optional, YYYY-MM-DD)</Text>
          <TextInput
            style={{ backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: 8, paddingHorizontal: Spacing.sm, marginBottom: Spacing.sm, color: Colors.text.primary }}
            placeholder="2026-04-08"
            placeholderTextColor={Colors.text.muted}
            value={docIssueDate}
            onChangeText={setDocIssueDate}
          />

          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginBottom: 4 }}>Expiry date (optional, YYYY-MM-DD)</Text>
          <TextInput
            style={{ backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: 8, paddingHorizontal: Spacing.sm, marginBottom: Spacing.sm, color: Colors.text.primary }}
            placeholder="2027-04-08"
            placeholderTextColor={Colors.text.muted}
            value={docExpiryDate}
            onChangeText={setDocExpiryDate}
          />

          {Platform.OS === 'web' ? (
            <View style={{ marginBottom: Spacing.sm }}>
              {createElement('input', {
                type: 'file',
                accept: 'application/pdf,image/jpeg,image/png',
                onChange: (e) => {
                  const file = e?.target?.files?.[0];
                  setSelectedDocFile(file || null);
                },
                style: { width: '100%' },
              })}
            </View>
          ) : (
            <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginBottom: Spacing.sm }}>
              File picker is currently enabled on web. Mobile picker can be added next.
            </Text>
          )}

          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginBottom: Spacing.sm }}>
            Selected file: {selectedDocFile?.name || 'None'}
          </Text>

          <Pressable
            onPress={uploadDocumentNow}
            disabled={uploadingDoc}
            style={({ pressed }) => ({
              backgroundColor: uploadingDoc ? Colors.text.muted : Colors.primary,
              borderRadius: Radius.md,
              paddingVertical: Spacing.sm,
              alignItems: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>
              {uploadingDoc ? 'Uploading...' : 'Upload Document'}
            </Text>
          </Pressable>
        </View>
      </Section>

      {/* Availability */}
      <Section title=" Weekly Availability">
        {DAYS.map((day, i) => {
          const slot = availability.find(a => a.day_of_week === i);
          const isAvail = slot?.is_available ?? false;
          return (
            <Pressable key={i} onPress={() => toggleDay(i)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.borderLight }}>
              <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.medium }}>{day}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                {isAvail && slot && <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted }}>{slot.start_time || '09:00'} – {slot.end_time || '17:00'}</Text>}
                <View style={{ width: 44, height: 24, borderRadius: 12, backgroundColor: isAvail ? Colors.status.success : Colors.border, justifyContent: 'center', paddingHorizontal: 2 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.text.white, alignSelf: isAvail ? 'flex-end' : 'flex-start' }} />
                </View>
              </View>
            </Pressable>
          );
        })}
        <Pressable onPress={saveAvailability} disabled={savingAvail}
          style={({ pressed }) => ({ backgroundColor: Colors.primary, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center', marginTop: Spacing.md, opacity: pressed ? 0.8 : 1 })}>
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>{savingAvail ? 'Saving...' : 'Save Availability'}</Text>
        </Pressable>
      </Section>
    </ScrollView>
  );
}
