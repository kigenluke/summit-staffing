/**
 * Coordinator: read-only full participant profile (approved access only).
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';

const Row = ({ label, value }) => (
  <View style={{ marginBottom: Spacing.md }}>
    <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.muted, marginBottom: 4 }}>{label}</Text>
    <Text style={{ fontSize: Typography.fontSize.base, color: Colors.text.primary }}>{value || '—'}</Text>
  </View>
);

export function CoordinatorParticipantProfileScreen({ route }) {
  const participantId = route.params?.participantId;
  const [loading, setLoading] = useState(true);
  const [p, setP] = useState(null);

  const load = useCallback(async () => {
    if (!participantId) {
      setLoading(false);
      return;
    }
    const { data, error } = await api.get(`/api/coordinator/managed-participants/${participantId}/profile`);
    if (!error && data?.ok && data.participant) setP(data.participant);
    setLoading(false);
  }, [participantId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!p) {
    return (
      <View style={{ flex: 1, padding: Spacing.lg, backgroundColor: Colors.background }}>
        <Text style={{ color: Colors.text.secondary }}>Could not load this participant profile.</Text>
      </View>
    );
  }

  const name = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Participant';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}>
      <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, ...Shadows.sm }}>
        <Text style={{ fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>{name}</Text>
        <Row label="Email" value={p.email} />
        <Row label="Phone" value={p.phone} />
        <Row label="Address" value={p.address} />
        <Row label="NDIS number" value={p.ndis_number} />
        <Row label="About" value={p.about} />
        <Row label="Management type" value={p.management_type} />
        <Row label="Monthly budget" value={p.monthly_budget != null ? String(p.monthly_budget) : ''} />
        <Row label="Plan manager name" value={p.plan_manager_name} />
        <Row label="Plan manager email" value={p.plan_manager_email} />
        <Row label="Plan manager phone" value={p.plan_manager_phone} />
        <Row label="Emergency contact" value={p.emergency_contact_name} />
        <Row label="Emergency phone" value={p.emergency_contact_phone} />
        <Row label="Relationship" value={p.emergency_contact_relationship} />
      </View>
    </ScrollView>
  );
}
