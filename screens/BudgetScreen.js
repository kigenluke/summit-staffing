import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';

const Card = ({ children, style }) => (
  <View style={[{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, ...Shadows.sm }, style]}>
    {children}
  </View>
);

const fmtMoney = (n) => `$${Number(n || 0).toFixed(2)}`;

export function BudgetScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState(null);
  const [bookings, setBookings] = useState([]);

  const load = useCallback(async () => {
    try {
      const [profileRes, bookingsRes] = await Promise.all([
        api.get('/api/participants/me'),
        api.get('/api/bookings?status=completed&limit=200'),
      ]);
      if (profileRes.data?.ok) setProfile(profileRes.data.participant || null);
      if (bookingsRes.data?.ok) setBookings(bookingsRes.data.bookings || []);
    } catch (_) {}
    setLoading(false);
  }, []);

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
      profile?.monthly_budget,
      profile?.budget_limit,
      profile?.plan_budget_monthly,
      profile?.plan_budget,
      profile?.ndis_budget,
    ];
    const firstValid = candidates.find((v) => Number(v) > 0);
    return Number(firstValid || 0);
  }, [profile]);

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
          Monthly budget progress
        </Text>
        <Text style={{ color: Colors.text.secondary }}>
          {hasBudget
            ? `Spent ${fmtMoney(monthSpending)} of ${fmtMoney(budgetLimit)}`
            : `Spent ${fmtMoney(monthSpending)} this month (budget not set)`}
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
          <Text style={{ marginTop: Spacing.sm, color: Colors.text.secondary }}>Remaining: {fmtMoney(remaining)}</Text>
        ) : (
          <Text style={{ marginTop: Spacing.sm, color: Colors.text.secondary }}>Set your monthly budget in profile settings.</Text>
        )}
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
          <Text style={{ color: Colors.status.error }}>Critical: You are above 95% of your monthly budget.</Text>
        ) : alertLevel === 'medium' ? (
          <Text style={{ color: Colors.status.warning }}>Heads up: You have used more than 80% of your monthly budget.</Text>
        ) : alertLevel === 'none' ? (
          <Text style={{ color: Colors.text.secondary }}>No budget limit set yet.</Text>
        ) : (
          <Text style={{ color: Colors.status.success }}>Healthy spending pace this month.</Text>
        )}
      </Card>
    </ScrollView>
  );
}
