/**
 * Summit Staffing – Earnings Screen
 * Shows total earnings/spending, stats, and completed booking history.
 */
import React, { useEffect, useState, useCallback, useLayoutEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../store/authStore.js';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';

export function EarningsScreen({ navigation }) {
  const { user } = useAuthStore();
  const isWorker = user?.role === 'worker';

  useLayoutEffect(() => {
    navigation.setOptions({ title: isWorker ? 'My Earnings' : 'Spending' });
  }, [navigation, isWorker]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [pendingAmount, setPendingAmount] = useState(0);
  const [completedBookings, setCompletedBookings] = useState([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalHours, setTotalHours] = useState(0);
  const [paymentCount, setPaymentCount] = useState(0);

  const loadData = useCallback(async () => {
    try {
      // Fetch completed bookings
      const bookingsRes = await api.get('/api/bookings?status=completed');
      const bookings = bookingsRes.data?.ok ? (bookingsRes.data.bookings || []) : [];
      setCompletedBookings(bookings);
      setCompletedCount(bookings.length);

      // Calculate total hours from bookings
      let hours = 0;
      for (const b of bookings) {
        if (b.start_time && b.end_time) {
          const ms = new Date(b.end_time) - new Date(b.start_time);
          hours += ms / (1000 * 60 * 60);
        }
      }
      setTotalHours(hours);

      // Fetch payment history
      const paymentsRes = await api.get('/api/payments/history');
      const payments = paymentsRes.data?.ok ? (paymentsRes.data.payments || []) : [];

      const succeeded = payments.filter(p => p.status === 'succeeded');
      const pending = payments.filter(p => p.status === 'pending');

      const total = succeeded.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
      const pend = pending.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

      setTotalEarnings(total);
      setPendingAmount(pend);
      setPaymentCount(succeeded.length);
    } catch (e) {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

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
      contentContainerStyle={{ paddingBottom: Spacing.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* Hero Banner */}
      <View style={{ backgroundColor: Colors.primary, paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing.xl }}>
        <Text style={{ fontSize: Typography.fontSize.sm, color: 'rgba(255,255,255,0.8)', marginBottom: 4 }}>
          {isWorker ? 'Total Earnings' : 'Total Spent'}
        </Text>
        <Text style={{ fontSize: 36, fontWeight: Typography.fontWeight.bold, color: Colors.text.white }}>
          ${totalEarnings.toFixed(2)}
        </Text>
        {pendingAmount > 0 && (
          <Text style={{ fontSize: Typography.fontSize.sm, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
            ${pendingAmount.toFixed(2)} pending
          </Text>
        )}
      </View>

      <View style={{ padding: Spacing.lg }}>
        {/* Stats */}
        <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg }}>
          <View style={{ flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', ...Shadows.sm }}>
            <Text style={{ fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>{completedCount}</Text>
            <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary }}>Completed</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', ...Shadows.sm }}>
            <Text style={{ fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>{totalHours.toFixed(1)}</Text>
            <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary }}>Hours</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', ...Shadows.sm }}>
            <Text style={{ fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>{paymentCount}</Text>
            <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary }}>Payments</Text>
          </View>
        </View>

        {/* Completed Bookings List */}
        <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.md }}>
          Completed Bookings
        </Text>

        {completedBookings.length === 0 ? (
          <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.xl, alignItems: 'center', ...Shadows.sm }}>
            <Text style={{ color: Colors.text.secondary, textAlign: 'center' }}>No completed bookings yet.</Text>
          </View>
        ) : (
          completedBookings.map((b) => {
            const hours = b.start_time && b.end_time
              ? ((new Date(b.end_time) - new Date(b.start_time)) / (1000 * 60 * 60)).toFixed(1)
              : '—';
            return (
              <View key={b.id} style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.sm, ...Shadows.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>{b.service_type}</Text>
                    <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 2 }}>
                      {new Date(b.start_time).toLocaleDateString()} • {hours}h
                    </Text>
                  </View>
                  <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.status.success }}>
                    ${parseFloat(b.total_amount || 0).toFixed(2)}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
