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

export function EarningsDashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payments, setPayments] = useState([]);
  const [completedBookings, setCompletedBookings] = useState([]);

  const load = useCallback(async () => {
    try {
      const [paymentsRes, bookingsRes] = await Promise.all([
        api.get('/api/payments/history'),
        api.get('/api/bookings?status=completed&limit=200'),
      ]);
      if (paymentsRes.data?.ok) setPayments(paymentsRes.data.payments || []);
      if (bookingsRes.data?.ok) setCompletedBookings(bookingsRes.data.bookings || []);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const totals = useMemo(() => {
    const succeeded = payments.filter((p) => p.status === 'succeeded');
    const now = new Date();
    const weekStart = new Date(now);
    const diffToMonday = (weekStart.getDay() + 6) % 7;
    weekStart.setDate(weekStart.getDate() - diffToMonday);
    weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const sumByDate = (fromDate) =>
      succeeded
        .filter((p) => {
          const ts = p.paid_at || p.updated_at || p.created_at;
          return ts ? new Date(ts) >= fromDate : false;
        })
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    return {
      weekly: sumByDate(weekStart),
      monthly: sumByDate(monthStart),
      yearly: sumByDate(yearStart),
      lifetime: succeeded.reduce((sum, p) => sum + Number(p.amount || 0), 0),
    };
  }, [payments]);

  const serviceBreakdown = useMemo(() => {
    const map = new Map();
    for (const b of completedBookings) {
      const key = b.service_type || 'Other';
      const value = Number(b.total_amount || 0);
      map.set(key, (map.get(key) || 0) + value);
    }
    return [...map.entries()]
      .map(([service, amount]) => ({ service, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [completedBookings]);

  const tax = useMemo(() => {
    const taxable = totals.yearly;
    const reservedPct = 0.15;
    const reserved = taxable * reservedPct;
    return { taxable, reservedPct, reserved };
  }, [totals.yearly]);

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
      <Card style={{ marginBottom: Spacing.md, backgroundColor: Colors.primary }}>
        <Text style={{ color: Colors.text.white, opacity: 0.9 }}>Lifetime earnings</Text>
        <Text style={{ color: Colors.text.white, fontSize: 32, fontWeight: Typography.fontWeight.bold, marginTop: 4 }}>
          {fmtMoney(totals.lifetime)}
        </Text>
      </Card>

      <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md }}>
        <Card style={{ flex: 1, padding: Spacing.md }}>
          <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.xs }}>Weekly</Text>
          <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.bold, marginTop: 4 }}>{fmtMoney(totals.weekly)}</Text>
        </Card>
        <Card style={{ flex: 1, padding: Spacing.md }}>
          <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.xs }}>Monthly</Text>
          <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.bold, marginTop: 4 }}>{fmtMoney(totals.monthly)}</Text>
        </Card>
        <Card style={{ flex: 1, padding: Spacing.md }}>
          <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.xs }}>Yearly</Text>
          <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.bold, marginTop: 4 }}>{fmtMoney(totals.yearly)}</Text>
        </Card>
      </View>

      <Card style={{ marginBottom: Spacing.md }}>
        <Text style={{ color: Colors.text.primary, fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, marginBottom: Spacing.sm }}>
          Breakdown by service type
        </Text>
        {serviceBreakdown.length === 0 ? (
          <Text style={{ color: Colors.text.secondary }}>No completed bookings yet.</Text>
        ) : (
          serviceBreakdown.map((row) => (
            <View key={row.service} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
              <Text style={{ color: Colors.text.secondary }}>{row.service}</Text>
              <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.semibold }}>{fmtMoney(row.amount)}</Text>
            </View>
          ))
        )}
      </Card>

      <Card style={{ marginBottom: Spacing.md }}>
        <Text style={{ color: Colors.text.primary, fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, marginBottom: Spacing.sm }}>
          Payment history
        </Text>
        {payments.length === 0 ? (
          <Text style={{ color: Colors.text.secondary }}>No payments found.</Text>
        ) : (
          payments.slice(0, 25).map((p, idx) => (
            <View key={p.id || `${p.created_at}-${idx}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
              <Text style={{ color: Colors.text.secondary }}>
                {new Date(p.paid_at || p.created_at || Date.now()).toLocaleDateString()} - {(p.status || 'unknown').toUpperCase()}
              </Text>
              <Text style={{ color: p.status === 'succeeded' ? Colors.status.success : Colors.text.primary, fontWeight: Typography.fontWeight.semibold }}>
                {fmtMoney(p.amount)}
              </Text>
            </View>
          ))
        )}
      </Card>

      <Card>
        <Text style={{ color: Colors.text.primary, fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold, marginBottom: Spacing.sm }}>
          Tax information (estimate)
        </Text>
        <Text style={{ color: Colors.text.secondary }}>Taxable income (year): {fmtMoney(tax.taxable)}</Text>
        <Text style={{ color: Colors.text.secondary, marginTop: 4 }}>Suggested reserve ({Math.round(tax.reservedPct * 100)}%): {fmtMoney(tax.reserved)}</Text>
        <Text style={{ color: Colors.text.muted, marginTop: Spacing.sm, fontSize: Typography.fontSize.xs }}>
          This is an estimate only. Consult your accountant for exact tax obligations.
        </Text>
      </Card>
    </ScrollView>
  );
}
