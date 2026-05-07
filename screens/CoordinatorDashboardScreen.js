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

export function CoordinatorDashboardScreen({ navigation }) {
  const { user } = useAuthStore();
  const [firstName, setFirstName] = useState('');
  const [stats, setStats] = useState({ active_users: 0, total_participants: 0, pending_requests: 0 });
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
        setStats(statsRes.data.stats || { active_users: 0, total_participants: 0, pending_requests: 0 });
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
      },
    });
  };

  const goProfile = () => {
    navigation.navigate('MainTabs', { screen: 'Profile' });
  };

  const goNotifications = () => {
    navigation.navigate('Notifications');
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
        <StatCard label="Active users" value={stats.active_users} color={Colors.status.success} filled />
        <StatCard label="Participants" value={stats.total_participants} color="#FBBF24" filled />
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
          label="Pending requests"
          value={stats.pending_requests}
          color={Colors.primary}
          onPress={goNotifications}
          filled
        />
      </View>

      <Card style={{ marginBottom: Spacing.md }}>
        <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>
          Request participant
        </Text>
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.xs }}>
          Add a participant by email. They must approve your request before you can manage their profile.
        </Text>
        <Pressable
          onPress={() => navigation.navigate('CoordinatorSearchParticipant')}
          style={({ pressed }) => ({
            marginTop: Spacing.md,
            backgroundColor: Colors.primary,
            borderRadius: Radius.md,
            paddingVertical: Spacing.md,
            alignItems: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.base }}>
            Add participant
          </Text>
        </Pressable>
      </Card>

      {managed.length > 0 ? (
        <Card>
          <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.md }}>
            Your participants
          </Text>
          {managed.map((p) => (
            <View
              key={p.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: Spacing.sm,
                borderBottomWidth: 1,
                borderBottomColor: Colors.border,
              }}
            >
              <Text style={{ fontSize: Typography.fontSize.base, color: Colors.text.primary, fontWeight: Typography.fontWeight.medium, flex: 1 }}>
                {p.display_name}
              </Text>
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
            </View>
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}
