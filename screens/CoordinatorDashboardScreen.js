/**
 * Coordinator home: overview stats, request participant entry, managed list.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../store/authStore.js';
import { api } from '../services/api.js';
import { Colors, Radius, Shadows, Spacing, Typography } from '../constants/theme.js';

const Card = ({ children, style }) => (
  <View style={[{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, ...Shadows.md }, style]}>
    {children}
  </View>
);

const StatCard = ({ label, value, color, onPress, filled = false, valueFontSize = Typography.fontSize.xxl }) => {
  const hasLabel = Boolean(label);
  const valueColor = filled ? Colors.text.white : (color || Colors.text.primary);
  const labelColor = filled ? 'rgba(255,255,255,0.9)' : Colors.text.secondary;
  const inner = (
    <>
      <Text style={{ fontSize: valueFontSize, fontWeight: Typography.fontWeight.bold, color: valueColor, marginBottom: hasLabel ? 2 : 0, textAlign: 'center' }}>
        {value}
      </Text>
      {hasLabel ? (
        <Text style={{ fontSize: Typography.fontSize.sm, color: labelColor, marginTop: 2, textAlign: 'center' }}>{label}</Text>
      ) : null}
    </>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          flex: 1,
          backgroundColor: filled ? color : Colors.surface,
          borderRadius: Radius.md,
          padding: Spacing.md,
          alignItems: 'center',
          justifyContent: hasLabel ? 'flex-start' : 'center',
          ...Shadows.sm,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        {inner}
      </Pressable>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: filled ? color : Colors.surface, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', justifyContent: hasLabel ? 'flex-start' : 'center', ...Shadows.sm }}>
      {inner}
    </View>
  );
};

const getTimeGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

/** Show a dash when count is zero so empty state is obvious on stat tiles. */
const formatStatCount = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return '—';
  return String(num);
};

const primaryActionButtonStyle = (pressed) => ({
  marginTop: Spacing.md,
  backgroundColor: Colors.primaryDark,
  borderRadius: Radius.md,
  paddingVertical: Spacing.sm,
  alignItems: 'center',
  opacity: pressed ? 0.85 : 1,
});

const getAccessStatusLabel = (participant) => {
  const status = participant.access_status;
  if (status === 'approved') return { text: 'Connected', color: Colors.status.success };
  if (status === 'rejected') return { text: 'Declined', color: Colors.text.muted };
  if (status === 'pending' && participant.initiator === 'participant') {
    return { text: 'Needs approval', color: Colors.status.warning };
  }
  return { text: 'Pending', color: Colors.status.warning };
};

export function CoordinatorDashboardScreen({ navigation }) {
  const { user } = useAuthStore();
  const [firstName, setFirstName] = useState('');
  const [stats, setStats] = useState({ managed_participants: 0, pending_requests: 0 });
  const [managed, setManaged] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [statsRes, managedRes] = await Promise.all([
        api.get('/api/coordinator/stats'),
        api.get('/api/coordinator/my-participants'),
      ]);
      setFirstName((user?.email || '').split('@')[0] || '');
      if (statsRes?.data?.ok) {
        setStats(statsRes.data.stats || { managed_participants: 0, pending_requests: 0 });
      }
      if (managedRes?.data?.ok) {
        setManaged(managedRes.data.participants || []);
      }
    } catch (_) {}
  }, [user?.email]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      return () => {};
    }, [loadData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const openManage = (participant) => {
    navigation.navigate('CoordinatorParticipantManage', {
      participant: {
        id: participant.id,
        user_id: participant.user_id,
        first_name: participant.first_name,
        last_name: participant.last_name,
        email: participant.email,
        phone: participant.phone,
        address: participant.address,
      },
    });
  };

  const goAccessRequests = () => {
    navigation.navigate('AccessRequests');
  };

  const goProfile = () => {
    navigation.navigate('MainTabs', { screen: 'Profile' });
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <Card style={{ marginBottom: Spacing.lg, backgroundColor: Colors.primary }}>
        <Text style={{ fontSize: Typography.fontSize.lg, color: Colors.text.white, fontWeight: Typography.fontWeight.medium }}>
          {getTimeGreeting()}
        </Text>
        <Text style={{ fontSize: Typography.fontSize.xxl, color: Colors.text.white, fontWeight: Typography.fontWeight.bold, marginTop: Spacing.xs }}>
          {firstName || user?.email || 'Coordinator'}
        </Text>
        <Text style={{ fontSize: Typography.fontSize.sm, color: 'rgba(255,255,255,0.8)', marginTop: Spacing.xs }}>
          Coordinator
        </Text>
      </Card>

      <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.md }}>
        Overview
      </Text>
      <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm }}>
        <StatCard label="Managed accounts" value={formatStatCount(stats.managed_participants)} color={Colors.status.success} filled />
        <StatCard
          label="Pending requests"
          value={formatStatCount(stats.pending_requests)}
          color={Colors.status.warning}
          onPress={goAccessRequests}
          filled
        />
      </View>
      <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg }}>
        <StatCard
          label=""
          value="Profile"
          color={Colors.primaryDark}
          onPress={goProfile}
          filled
          valueFontSize={Typography.fontSize.lg}
        />
        <StatCard
          label=""
          value="Requests"
          color={Colors.primary}
          onPress={goAccessRequests}
          filled
          valueFontSize={Typography.fontSize.lg}
        />
      </View>

      <Card style={{ marginBottom: Spacing.md }}>
        <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>
          Connection requests
        </Text>
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.xs }}>
          Approve or decline participant access requests in one place. This list stays available after you read notifications.
        </Text>
        <Pressable onPress={goAccessRequests} style={({ pressed }) => primaryActionButtonStyle(pressed)}>
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>Open requests</Text>
        </Pressable>
      </Card>

      <Card style={{ marginBottom: Spacing.md }}>
        <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>
          Request participant
        </Text>
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.xs }}>
          Add a participant by email. They must approve your request before you can manage their profile.
        </Text>
        <Pressable
          onPress={() => navigation.navigate('CoordinatorSearchParticipant')}
          style={({ pressed }) => primaryActionButtonStyle(pressed)}
        >
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>Add participant</Text>
        </Pressable>
      </Card>

      {managed.length > 0 ? (
        <Card>
          <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.md }}>
            Your accounts
          </Text>
          {managed.map((p) => {
            const statusInfo = getAccessStatusLabel(p);
            const canManage = p.access_status === 'approved';
            return (
              <View
                key={p.access_request_id || p.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: Spacing.sm,
                  borderBottomWidth: 1,
                  borderBottomColor: Colors.border,
                  gap: Spacing.sm,
                }}
              >
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, paddingRight: Spacing.xs }}>
                  <Text
                    style={{ flex: 1, fontSize: Typography.fontSize.base, color: Colors.text.primary, fontWeight: Typography.fontWeight.medium }}
                    numberOfLines={1}
                  >
                    {p.display_name}
                  </Text>
                  <Text style={{ fontSize: Typography.fontSize.sm, color: statusInfo.color, fontWeight: Typography.fontWeight.semibold }}>
                    {statusInfo.text}
                  </Text>
                </View>
                {canManage ? (
                  <Pressable
                    onPress={() => openManage(p)}
                    style={({ pressed }) => ({
                      backgroundColor: Colors.status.success,
                      borderRadius: Radius.md,
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.sm }}>Manage</Text>
                  </Pressable>
                ) : p.access_status === 'pending' && p.initiator === 'participant' ? (
                  <Pressable
                    onPress={goAccessRequests}
                    style={({ pressed }) => ({
                      backgroundColor: Colors.primary,
                      borderRadius: Radius.md,
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.sm }}>Review</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </Card>
      ) : (
        <Card>
          <Text style={{ fontSize: Typography.fontSize.base, color: Colors.text.secondary, textAlign: 'center' }}>
            No managed accounts yet. Request a participant or approve an incoming request.
          </Text>
        </Card>
      )}
    </ScrollView>
  );
}
