/**
 * Summit Staffing – Dashboard Screen
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, ActivityIndicator, Linking, Platform, Alert } from 'react-native';
import { useAuthStore } from '../store/authStore.js';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';

const Card = ({ children, style }) => (
  <View style={[{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, ...Shadows.md }, style]}>
    {children}
  </View>
);

const StatCard = ({ label, value, color }) => (
  <View style={{ flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', ...Shadows.sm }}>
    <Text style={{ fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: color || Colors.text.primary, marginBottom: 2 }}>{value}</Text>
    <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 2 }}>{label}</Text>
  </View>
);

const getTimeGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

export function DashboardScreen({ navigation }) {
  const { user } = useAuthStore();
  const [stats, setStats] = useState({ upcoming: 0, completed: 0, pending: 0 });
  const [upcomingBookings, setUpcomingBookings] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState(null);
  const [workerEarningsTotal, setWorkerEarningsTotal] = useState(0);
  const [workerEarnedThisMonth, setWorkerEarnedThisMonth] = useState(0);
  const [workerPendingAmount, setWorkerPendingAmount] = useState(0);
  const [workerEarnedThisWeek, setWorkerEarnedThisWeek] = useState(0);
  const [nextShift, setNextShift] = useState(null);

  const isWorker = user?.role === 'worker';
  const weeklyGoal = 600;

  const loadData = useCallback(async () => {
    const role = user?.role;
    const fetchFirstName = async () => {
      try {
        if (role === 'worker') {
          const { data } = await api.get('/api/workers/me');
          const n = data?.worker?.first_name;
          return n != null && String(n).trim() ? String(n).trim() : null;
        }
        if (role === 'participant') {
          const { data } = await api.get('/api/participants/me');
          const n = data?.participant?.first_name;
          return n != null && String(n).trim() ? String(n).trim() : null;
        }
      } catch (_) {}
      return null;
    };

    try {
      const requests = [fetchFirstName(), api.get('/api/bookings?limit=5')];
      if (isWorker) requests.push(api.get('/api/payments/history'));
      if (isWorker) requests.push(api.get('/api/bookings?status=confirmed&limit=50'));

      const [name, bookingsRes, paymentsRes, confirmedRes] = await Promise.all(requests);
      setFirstName(name);
      const { data } = bookingsRes;
      if (data?.ok && data?.bookings) {
        const bookings = data.bookings;
        setUpcomingBookings(bookings.filter(b => b.status === 'confirmed' || b.status === 'pending').slice(0, 3));
        setStats({
          upcoming: bookings.filter(b => b.status === 'confirmed').length,
          completed: bookings.filter(b => b.status === 'completed').length,
          pending: bookings.filter(b => b.status === 'pending').length,
        });
      }
      if (isWorker && paymentsRes?.data?.ok) {
        const payments = paymentsRes.data.payments || [];
        const succeeded = payments.filter((p) => p.status === 'succeeded');
        const pending = payments.filter((p) => p.status === 'pending');
        const total = succeeded.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const weekStart = new Date();
        const day = weekStart.getDay(); // Sunday=0
        const diffToMonday = (day + 6) % 7;
        weekStart.setDate(weekStart.getDate() - diffToMonday);
        weekStart.setHours(0, 0, 0, 0);
        const earnedThisMonth = succeeded
          .filter((p) => {
            const ts = p.paid_at || p.updated_at || p.created_at;
            if (!ts) return false;
            return new Date(ts) >= monthStart;
          })
          .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        const earnedThisWeek = succeeded
          .filter((p) => {
            const ts = p.paid_at || p.updated_at || p.created_at;
            if (!ts) return false;
            return new Date(ts) >= weekStart;
          })
          .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        const pendingAmount = pending.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
        setWorkerEarningsTotal(total);
        setWorkerEarnedThisMonth(earnedThisMonth);
        setWorkerEarnedThisWeek(earnedThisWeek);
        setWorkerPendingAmount(pendingAmount);
      }
      if (isWorker && confirmedRes?.data?.ok) {
        const now = new Date();
        const upcoming = (confirmedRes.data.bookings || [])
          .filter((b) => b.start_time && new Date(b.start_time) > now)
          .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        setNextShift(upcoming[0] || null);
      }
    } catch (e) {}
    setLoading(false);
  }, [user?.role, isWorker]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  useEffect(() => { loadData(); }, [loadData]);

  const openDirections = async (booking) => {
    if (!booking) return;
    const address = booking.location_address || booking.location || '';
    if (!address) {
      Alert.alert('Location unavailable', 'No location set for this shift.');
      return;
    }
    const encoded = encodeURIComponent(address);
    const webUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
    const nativeUrl = Platform.OS === 'ios'
      ? `maps://?q=${encoded}`
      : `geo:0,0?q=${encoded}`;
    try {
      const canOpenNative = await Linking.canOpenURL(nativeUrl);
      if (canOpenNative) {
        await Linking.openURL(nativeUrl);
        return;
      }
    } catch (_) {}
    await Linking.openURL(webUrl);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* Greeting */}
      <Card style={{ marginBottom: Spacing.lg, backgroundColor: Colors.primary }}>
        <Text style={{ fontSize: Typography.fontSize.lg, color: Colors.text.white, fontWeight: Typography.fontWeight.medium }}>
          {getTimeGreeting()}
        </Text>
        <Text style={{ fontSize: Typography.fontSize.xxl, color: Colors.text.white, fontWeight: Typography.fontWeight.bold, marginTop: Spacing.xs }}>
          {firstName ?? 'User'}
        </Text>
        <Text style={{ fontSize: Typography.fontSize.sm, color: 'rgba(255,255,255,0.8)', marginTop: Spacing.xs }}>
          {isWorker ? 'Support Worker' : 'Participant'}
        </Text>
      </Card>

      {/* Stats */}
      <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.md }}>
        Overview
      </Text>
      <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg }}>
        <StatCard label="Pending" value={stats.pending} color={Colors.status.warning} />
        <StatCard label="Upcoming" value={stats.upcoming} color={Colors.status.success} />
        <StatCard label="Completed" value={stats.completed} color={Colors.primary} />
      </View>
      {isWorker && (
        <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg }}>
          <Card style={{ flex: 1, padding: Spacing.md }}>
            <Text style={{ fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: '#EF4444' }}>
              ${workerEarnedThisMonth.toLocaleString()}
            </Text>
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 4 }}>
              Earned This Month
            </Text>
          </Card>
          <Card style={{ flex: 1, padding: Spacing.md }}>
            <Text style={{ fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: '#10B981' }}>
              ${workerPendingAmount.toLocaleString()}
            </Text>
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 4 }}>
              Pending Payout
            </Text>
          </Card>
        </View>
      )}
      {/* Quick Actions */}
      <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.md }}>
        Quick Actions
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.xl }}>
        {isWorker ? (
          <>
            <Pressable
              onPress={() => navigation.navigate('AvailableShifts')}
              style={({ pressed }) => ({
                width: '47%', backgroundColor: Colors.status.success, borderRadius: Radius.md,
                padding: Spacing.lg, paddingVertical: Spacing.xl, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.base }}>Available Shifts</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('EarningsDashboard')}
              style={({ pressed }) => ({
                width: '47%',
                backgroundColor: '#FBBF24',
                borderRadius: Radius.md,
                padding: Spacing.lg,
                paddingVertical: Spacing.xl,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.8 : 1,
              })}
            >
              {/* <Text style={{ fontSize: 24 }}>💰</Text> */}
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.base }}>
                My Earnings
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: Typography.fontSize.xs, marginTop: 2 }}>
                ${workerEarningsTotal.toLocaleString()}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('Bookings')}
              style={({ pressed }) => ({
                width: '47%', backgroundColor: Colors.primary, borderRadius: Radius.md,
                padding: Spacing.lg, paddingVertical: Spacing.xl, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.base }}>My Bookings</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('Profile')}
              style={({ pressed }) => ({
                width: '47%', backgroundColor: Colors.primaryDark, borderRadius: Radius.md,
                padding: Spacing.lg, paddingVertical: Spacing.xl, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.base }}>My Profile</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              onPress={() => navigation.navigate('AvailableShifts')}
              style={({ pressed }) => ({
                width: '47%', backgroundColor: Colors.status.success, borderRadius: Radius.md,
                padding: Spacing.lg, paddingVertical: Spacing.xl, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.base }}>Book a Worker</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('AvailableShifts')}
              style={({ pressed }) => ({
                width: '47%', backgroundColor: '#FBBF24', borderRadius: Radius.md,
                padding: Spacing.lg, paddingVertical: Spacing.xl, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.base }}>Book a Vendor</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('BudgetDashboard')}
              style={({ pressed }) => ({
                width: '47%', backgroundColor: Colors.primary, borderRadius: Radius.md,
                padding: Spacing.lg, paddingVertical: Spacing.xl, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.base }}>Your Budget</Text>
            </Pressable>
            <Pressable
              onPress={() => navigation.navigate('Profile')}
              style={({ pressed }) => ({
                width: '47%', backgroundColor: Colors.primaryDark, borderRadius: Radius.md,
                padding: Spacing.lg, paddingVertical: Spacing.xl, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.base }}>Profile</Text>
            </Pressable>
          </>
        )}
      </View>
      {isWorker && (
        <>
          <Card style={{ marginBottom: Spacing.md }}>
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, fontWeight: Typography.fontWeight.semibold }}>
              Weekly Goal
            </Text>
            <Text style={{ fontSize: Typography.fontSize.xl, color: Colors.text.primary, fontWeight: Typography.fontWeight.bold, marginTop: 4 }}>
              ${workerEarnedThisWeek.toFixed(0)} / ${weeklyGoal}
            </Text>
            <View style={{ height: 10, backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.full, marginTop: Spacing.sm }}>
              <View
                style={{
                  height: '100%',
                  width: `${Math.min((workerEarnedThisWeek / weeklyGoal) * 100, 100)}%`,
                  backgroundColor: Colors.status.success,
                  borderRadius: Radius.full,
                }}
              />
            </View>
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.sm }}>
              ${Math.max(weeklyGoal - workerEarnedThisWeek, 0).toFixed(0)} more to reach goal!
            </Text>
          </Card>

          <Card style={{ marginBottom: Spacing.lg }}>
            <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, fontWeight: Typography.fontWeight.bold, letterSpacing: 0.5 }}>
              NEXT SHIFT
            </Text>
            {nextShift ? (
              <>
                <Text style={{ fontSize: Typography.fontSize.lg, color: Colors.text.primary, fontWeight: Typography.fontWeight.bold, marginTop: 4 }}>
                  {new Date(nextShift.start_time).toLocaleDateString()} at {new Date(nextShift.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <Text style={{ fontSize: Typography.fontSize.base, color: Colors.text.primary, marginTop: 4 }}>
                  {nextShift.participant_first_name ? `${nextShift.participant_first_name} ${nextShift.participant_last_name || ''}`.trim() : 'Participant'}
                </Text>
                <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 2 }}>
                  {nextShift.service_type || 'Shift'} • {((new Date(nextShift.end_time) - new Date(nextShift.start_time)) / (1000 * 60 * 60)).toFixed(1)} hours
                </Text>
                <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.status.success, marginTop: Spacing.sm, fontWeight: Typography.fontWeight.semibold }}>
                  You'll earn: ${Number(nextShift.total_amount || 0).toFixed(2)}
                </Text>
                <Pressable
                  onPress={() => openDirections(nextShift)}
                  style={({ pressed }) => ({
                    marginTop: Spacing.md,
                    backgroundColor: Colors.primary,
                    borderRadius: Radius.md,
                    paddingVertical: Spacing.sm,
                    alignItems: 'center',
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>Get Directions</Text>
                </Pressable>
              </>
            ) : (
              <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.sm }}>
                No upcoming confirmed shift.
              </Text>
            )}
          </Card>
        </>
      )}

      {/* Upcoming Bookings */}
      <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.md }}>
        Recent Bookings
      </Text>
      {loading ? (
        <ActivityIndicator size="small" color={Colors.primary} />
      ) : upcomingBookings.length === 0 ? (
        <Card>
          <Text style={{ color: Colors.text.secondary, textAlign: 'center' }}>No bookings yet</Text>
          {!isWorker && (
            <Pressable onPress={() => navigation.navigate('Search')} style={{ marginTop: Spacing.md, alignItems: 'center' }}>
              <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.semibold }}>Find a worker →</Text>
            </Pressable>
          )}
        </Card>
      ) : (
        upcomingBookings.map((b) => (
          <Pressable key={b.id} onPress={() => navigation.navigate('BookingDetail', { bookingId: b.id })}>
          <Card style={{ marginBottom: Spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>{b.service_type}</Text>
                <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 2 }}>
                  {new Date(b.start_time).toLocaleDateString()} • {new Date(b.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <View style={{
                backgroundColor: b.status === 'confirmed' ? Colors.status.success : Colors.status.warning,
                paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full,
              }}>
                <Text style={{ color: Colors.text.white, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold }}>
                  {b.status?.toUpperCase()}
                </Text>
              </View>
            </View>
          </Card>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}
