/**
 * Summit Staffing – Payments Screen (History + Stripe connect for workers)
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, ActivityIndicator, Alert, Linking, AppState } from 'react-native';
import { api } from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';

const STATUS_COLORS = { pending: Colors.status.warning, succeeded: Colors.status.success, failed: Colors.status.error, refunded: Colors.text.muted };

export function PaymentsScreen() {
  const { user } = useAuthStore();
  const isWorker = user?.role === 'worker';
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connectStatus, setConnectStatus] = useState(null);
  const [openingStripe, setOpeningStripe] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/payments/history?limit=50');
      if (data?.ok && data?.payments) setPayments(data.payments);
    } catch (e) {}
    if (isWorker) {
      try {
        const { data } = await api.get('/api/payments/connect/status');
        if (data?.ok) setConnectStatus(data);
      } catch (e) {}
    } else {
      setConnectStatus(null);
    }
    setLoading(false);
  }, [isWorker]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  // When user returns from browser (Stripe onboarding), refresh account status automatically.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        load();
      }
    });
    return () => sub.remove();
  }, [load]);

  const setupStripe = async () => {
    try {
      const { data, error } = await api.post('/api/payments/connect/onboard');
      if (error) {
        const res = error.response;
        const detail = res?.error || error.message;
        const hint = res?.hint;
        const lines = [detail, hint].filter(Boolean);
        Alert.alert(
          'Failed to Connect account',
          lines.length ? lines.join('\n\n') : 'Please try again later.'
        );
        return;
      }
      const redirectUrl = data?.onboardingUrl || data?.url;
      if (redirectUrl) {
        const supported = await Linking.canOpenURL(redirectUrl);
        if (!supported) {
          Alert.alert('Error', 'Unable to open Stripe onboarding link.');
          return;
        }
        setOpeningStripe(true);
        await Linking.openURL(redirectUrl);
        // Best-effort refresh shortly after opening, and AppState listener will refresh on return.
        setTimeout(() => {
          load();
          setOpeningStripe(false);
        }, 1500);
        return;
      }
      Alert.alert('Success', 'Stripe account setup initiated');
    } catch (_) {
      Alert.alert('Error', 'Failed to start Stripe setup.');
    }
  };

  const openStripeDashboard = async () => {
    const { data, error } = await api.post('/api/payments/connect/login-link');
    if (error) {
      Alert.alert('Error', error.message || 'Failed to open Stripe dashboard');
      return;
    }
    if (data?.loginUrl) {
      await Linking.openURL(data.loginUrl);
    }
  };

  const disconnectStripe = async () => {
    Alert.alert(
      'Disconnect Stripe?',
      'You can reconnect another Stripe account later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            const { error } = await api.post('/api/payments/connect/disconnect');
            if (error) {
              Alert.alert('Error', error.message || 'Failed to disconnect account');
              return;
            }
            await load();
            Alert.alert('Done', 'Stripe account disconnected.');
          }
        }
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Stripe Connect — workers only (API returns 403 for participants) */}
      {!loading && isWorker && (
        <View style={{ padding: Spacing.md }}>
          <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, ...Shadows.sm }}>
            <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm }}>Payment Setup</Text>
            {connectStatus?.charges_enabled ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.status.success }} />
                  <Text style={{ color: Colors.status.success, fontWeight: Typography.fontWeight.semibold }}>Stripe connected - payouts enabled</Text>
                </View>
                <View style={{ backgroundColor: Colors.surfaceSecondary, borderWidth: 1, borderColor: Colors.borderLight, borderRadius: Radius.md, padding: Spacing.sm, marginBottom: Spacing.md }}>
                  <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.xs, marginBottom: 2 }}>
                    Connected account
                  </Text>
                  <Text style={{ color: Colors.text.primary, fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, marginBottom: 6 }}>
                    {connectStatus?.account?.id || connectStatus?.accountId || '—'}
                  </Text>
                  <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.xs }}>
                    {connectStatus?.account?.email || 'Email not provided'}
                  </Text>
                </View>
                <Pressable onPress={openStripeDashboard} style={({ pressed }) => ({ backgroundColor: '#635BFF', paddingVertical: Spacing.sm + 1, borderRadius: Radius.md, alignItems: 'center', opacity: pressed ? 0.88 : 1, marginBottom: Spacing.sm })}>
                  <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>Manage Stripe Account</Text>
                </Pressable>
                <Pressable onPress={disconnectStripe} style={({ pressed }) => ({ backgroundColor: Colors.surfaceSecondary, borderWidth: 1, borderColor: Colors.status.error, paddingVertical: Spacing.sm + 1, borderRadius: Radius.md, alignItems: 'center', opacity: pressed ? 0.88 : 1 })}>
                  <Text style={{ color: Colors.status.error, fontWeight: Typography.fontWeight.bold }}>Use Another Account</Text>
                </Pressable>
              </>
            ) : connectStatus?.details_submitted ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.status.warning }} />
                  <Text style={{ color: Colors.status.warning, fontWeight: Typography.fontWeight.semibold }}>Stripe details submitted</Text>
                </View>
                <Text style={{ color: Colors.text.secondary, marginBottom: Spacing.md }}>
                  Account is under review or requires more info before payouts are enabled.
                </Text>
                <Pressable onPress={setupStripe} style={({ pressed }) => ({ backgroundColor: '#635BFF', paddingVertical: Spacing.sm + 1, borderRadius: Radius.md, alignItems: 'center', opacity: pressed ? 0.88 : 1, marginBottom: Spacing.sm })}>
                    <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>Manage Account</Text>
                </Pressable>
                <Pressable onPress={disconnectStripe} style={({ pressed }) => ({ backgroundColor: Colors.surfaceSecondary, borderWidth: 1, borderColor: Colors.status.error, paddingVertical: Spacing.sm + 1, borderRadius: Radius.md, alignItems: 'center', opacity: pressed ? 0.88 : 1 })}>
                  <Text style={{ color: Colors.status.error, fontWeight: Typography.fontWeight.bold }}>Use Another Account</Text>
                </Pressable>
              </>
            ) : connectStatus?.hasWorkerProfile === false ? (
              <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm }}>
                Complete your worker profile first (Profile → worker setup), then you can connect Stripe for payouts.
              </Text>
            ) : (
              <>
                <Text style={{ color: Colors.text.secondary, marginBottom: Spacing.sm }}>Connect your bank account via Stripe to receive payouts.</Text>
                <Pressable onPress={setupStripe} style={({ pressed }) => ({ backgroundColor: '#635BFF', paddingVertical: Spacing.sm + 1, borderRadius: Radius.md, alignItems: 'center', opacity: pressed ? 0.88 : 1 })}>
                  <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>
                    {openingStripe ? 'Opening Stripe...' : 'Setup Stripe Account'}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      )}
      {!loading && !isWorker && (
        <View style={{ padding: Spacing.md }}>
          <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, ...Shadows.sm }}>
            <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm }}>Payments</Text>
            <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm }}>
              Stripe bank connection is for support workers only. Your payment history appears below.
            </Text>
          </View>
        </View>
      )}

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <FlatList
          data={payments}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          renderItem={({ item: p }) => (
            <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.sm, ...Shadows.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, fontSize: Typography.fontSize.lg }}>
                    ${Number(p.amount || 0).toFixed(2)}
                  </Text>
                  {p.payment_date && <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginTop: 2 }}>
                    {new Date(p.payment_date).toLocaleDateString()}
                  </Text>}
                </View>
                <View style={{ backgroundColor: STATUS_COLORS[p.status] || Colors.text.muted, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full }}>
                  <Text style={{ color: Colors.text.white, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, textTransform: 'uppercase' }}>{p.status}</Text>
                </View>
              </View>
              {isWorker && p.worker_payout > 0 && (
                <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.status.success, marginTop: Spacing.xs }}>
                  Your payout: ${Number(p.worker_payout).toFixed(2)}
                </Text>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
              <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>No payments yet</Text>
            </View>
          }
        />
      )}
    </View>
  );
}
