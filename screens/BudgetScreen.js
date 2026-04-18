import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Pressable, TextInput, Alert } from 'react-native';
import { api } from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';

const Card = ({ children, style }) => (
  <View style={[{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, ...Shadows.sm }, style]}>
    {children}
  </View>
);

const fmtMoney = (n) => `$${Number(n || 0).toFixed(2)}`;

export function BudgetScreen() {
  const { user } = useAuthStore();
  const isWorker = user?.role === 'worker';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [targetInput, setTargetInput] = useState('');
  const [savingTarget, setSavingTarget] = useState(false);

  const load = useCallback(async () => {
    try {
      const profilePath = isWorker ? '/api/workers/me' : '/api/participants/me';
      const [profileRes, bookingsRes] = await Promise.all([
        api.get(profilePath),
        api.get('/api/bookings?status=completed&limit=200'),
      ]);
      if (profileRes.data?.ok) {
        setProfile(isWorker ? (profileRes.data.worker || null) : (profileRes.data.participant || null));
      }
      if (bookingsRes.data?.ok) setBookings(bookingsRes.data.bookings || []);
    } catch (_) {}
    setLoading(false);
  }, [isWorker]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const monthSpending = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    return bookings
      .filter((b) => {
        const ts = new Date(b.end_time || b.start_time || b.created_at || Date.now());
        return ts.getMonth() === month && ts.getFullYear() === year;
      })
      .reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
  }, [bookings]);

  const budgetLimit = useMemo(() => {
    const candidates = [
      isWorker ? profile?.monthly_earnings_target : null,
      profile?.monthly_budget,
      profile?.budget_limit,
      profile?.plan_budget_monthly,
      profile?.plan_budget,
      profile?.ndis_budget,
    ];
    const firstValid = candidates.find((v) => Number(v) > 0);
    return Number(firstValid || 0);
  }, [profile, isWorker]);

  useEffect(() => {
    if (budgetLimit > 0) setTargetInput(String(Number(budgetLimit).toFixed(2)));
  }, [budgetLimit]);

  const breakdown = useMemo(() => {
    const map = new Map();
    for (const b of bookings) {
      const key = b.service_type || 'Other';
      map.set(key, (map.get(key) || 0) + Number(b.total_amount || 0));
    }
    return [...map.entries()]
      .map(([service, amount]) => ({ service, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [bookings]);

  const hasBudget = budgetLimit > 0;
  const budgetUsage = hasBudget ? Math.min(monthSpending / budgetLimit, 1) : 0;
  const remaining = hasBudget ? Math.max(budgetLimit - monthSpending, 0) : 0;
  const alertLevel = hasBudget
    ? (budgetUsage >= 0.95 ? 'high' : budgetUsage >= 0.8 ? 'medium' : 'low')
    : 'none';

  const setPresetTarget = (amount) => {
    setTargetInput(String(Number(amount).toFixed(2)));
  };

  const saveTarget = async () => {
    if (!profile?.id) {
      Alert.alert('Error', 'Profile not loaded yet. Please refresh and try again.');
      return;
    }
    const value = Number(String(targetInput || '').replace(/,/g, ''));
    if (Number.isNaN(value) || value < 0) {
      Alert.alert('Invalid target', `Please enter a valid monthly ${isWorker ? 'earnings' : 'budget'} amount.`);
      return;
    }
    setSavingTarget(true);
    try {
      const endpoint = isWorker ? `/api/workers/${profile.id}` : `/api/participants/${profile.id}`;
      const payload = isWorker ? { monthly_earnings_target: value } : { monthly_budget: value };
      const { error } = await api.put(endpoint, payload);
      if (error) {
        Alert.alert('Error', error.message || 'Failed to save target');
      } else {
        Alert.alert('Saved', `Monthly ${isWorker ? 'earnings' : 'budget'} target updated.`);
        await load();
      }
    } catch (_) {
      Alert.alert('Error', 'Failed to save target');
    }
    setSavingTarget(false);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <Card style={{ marginBottom: Spacing.md }}>
        <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.bold, marginBottom: 4 }}>
          {isWorker ? 'Monthly earnings progress' : 'Monthly budget progress'}
        </Text>
        <Text style={{ color: Colors.text.secondary }}>
          {hasBudget
            ? `${isWorker ? 'Earned' : 'Spent'} ${fmtMoney(monthSpending)} of ${fmtMoney(budgetLimit)}`
            : `${isWorker ? 'Earned' : 'Spent'} ${fmtMoney(monthSpending)} this month (${isWorker ? 'target not set' : 'budget not set'})`}
        </Text>
        <View style={{ height: 10, backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.full, marginTop: Spacing.sm }}>
          <View
            style={{
              height: '100%',
              width: `${Math.min(budgetUsage * 100, 100)}%`,
              backgroundColor: budgetUsage > 0.9 ? Colors.status.error : budgetUsage > 0.75 ? Colors.status.warning : Colors.status.success,
              borderRadius: Radius.full,
            }}
          />
        </View>
        {hasBudget ? (
          <Text style={{ marginTop: Spacing.sm, color: Colors.text.secondary }}>
            {isWorker ? 'To target' : 'Remaining'}: {fmtMoney(remaining)}
          </Text>
        ) : (
          <Text style={{ marginTop: Spacing.sm, color: Colors.text.secondary }}>
            Set your monthly {isWorker ? 'earnings target' : 'budget'} in profile settings.
          </Text>
        )}

        <View style={{ marginTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md }}>
          <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.semibold, marginBottom: Spacing.sm }}>
            Set monthly {isWorker ? 'salary target' : 'target'}
          </Text>
          <View style={{ flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.sm }}>
            {(isWorker ? [2000, 4000, 6000] : [500, 1000, 2000]).map((v) => (
              <Pressable
                key={v}
                onPress={() => setPresetTarget(v)}
                style={({ pressed }) => ({
                  backgroundColor: Colors.surfaceSecondary,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  borderRadius: Radius.full,
                  paddingHorizontal: Spacing.sm,
                  paddingVertical: 6,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ color: Colors.text.primary, fontSize: Typography.fontSize.xs }}>${v}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={targetInput}
            onChangeText={setTargetInput}
            keyboardType="decimal-pad"
            placeholder={isWorker ? 'Enter monthly salary target' : 'Enter monthly budget target'}
            placeholderTextColor={Colors.text.muted}
            style={{
              backgroundColor: Colors.surfaceSecondary,
              borderWidth: 1,
              borderColor: Colors.border,
              borderRadius: Radius.md,
              paddingVertical: Spacing.sm,
              paddingHorizontal: Spacing.md,
              color: Colors.text.primary,
              marginBottom: Spacing.sm,
            }}
          />
          <Pressable
            onPress={saveTarget}
            disabled={savingTarget}
            style={({ pressed }) => ({
              backgroundColor: savingTarget ? Colors.text.muted : Colors.primary,
              borderRadius: Radius.md,
              alignItems: 'center',
              paddingVertical: Spacing.sm,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>
              {savingTarget ? 'Saving...' : 'Save Target'}
            </Text>
          </Pressable>
        </View>
      </Card>

      <Card style={{ marginBottom: Spacing.md }}>
        <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.bold, marginBottom: Spacing.sm }}>
          Spending by service type
        </Text>
        {breakdown.length === 0 ? (
          <Text style={{ color: Colors.text.secondary }}>No completed transactions yet.</Text>
        ) : (
          breakdown.map((row) => (
            <View key={row.service} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
              <Text style={{ color: Colors.text.secondary }}>{row.service}</Text>
              <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.semibold }}>{fmtMoney(row.amount)}</Text>
            </View>
          ))
        )}
      </Card>

      <Card style={{ marginBottom: Spacing.md }}>
        <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.bold, marginBottom: Spacing.sm }}>
          Transaction history
        </Text>
        {bookings.length === 0 ? (
          <Text style={{ color: Colors.text.secondary }}>No transactions found.</Text>
        ) : (
          bookings.slice(0, 30).map((b) => (
            <View key={b.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
              <Text style={{ color: Colors.text.secondary }}>
                {new Date(b.end_time || b.start_time || Date.now()).toLocaleDateString()} - {b.service_type || 'Service'}
              </Text>
              <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.semibold }}>
                {fmtMoney(b.total_amount)}
              </Text>
            </View>
          ))
        )}
      </Card>

      <Card>
        <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.bold, marginBottom: Spacing.sm }}>
          Budget alerts
        </Text>
        {alertLevel === 'high' ? (
          <Text style={{ color: Colors.status.error }}>
            {isWorker
              ? 'Critical: You are close to your monthly earnings target.'
              : 'Critical: You are above 95% of your monthly budget.'}
          </Text>
        ) : alertLevel === 'medium' ? (
          <Text style={{ color: Colors.status.warning }}>
            {isWorker
              ? 'Heads up: You have reached more than 80% of your monthly earnings target.'
              : 'Heads up: You have used more than 80% of your monthly budget.'}
          </Text>
        ) : alertLevel === 'none' ? (
          <Text style={{ color: Colors.text.secondary }}>
            No monthly {isWorker ? 'earnings target' : 'budget limit'} set yet.
          </Text>
        ) : (
          <Text style={{ color: Colors.status.success }}>
            {isWorker ? 'Healthy progress toward your target this month.' : 'Healthy spending pace this month.'}
          </Text>
        )}
      </Card>
    </ScrollView>
  );
}
