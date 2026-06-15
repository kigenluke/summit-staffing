/**
 * Summit Staffing – Payments Screen (History + Stripe connect for workers)
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, RefreshControl, ActivityIndicator, Alert, Linking, AppState, TextInput, Platform,
} from 'react-native';
import { api } from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';
import { formatDateDMY } from '../utils/dateFormat.js';

const STATUS_COLORS = { pending: Colors.status.warning, succeeded: Colors.status.success, failed: Colors.status.error, refunded: Colors.text.muted };

const PAYMENT_KIND_LABELS = {
  authorization_hold: 'Card hold (authorized)',
  capture: 'Payment captured',
  funded_eft: 'NDIS invoice paid',
};

const formatPaymentKind = (kind, status) => {
  if (kind && PAYMENT_KIND_LABELS[kind]) return PAYMENT_KIND_LABELS[kind];
  if (status === 'pending') return 'Pending';
  if (status === 'succeeded') return 'Paid';
  return kind || status || 'Payment';
};

const formatBsbInput = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 6);
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
};

const formatAccountInput = (raw) => String(raw || '').replace(/\D/g, '').slice(0, 9);

export function PaymentsScreen() {
  const { user } = useAuthStore();
  const isWorker = user?.role === 'worker';
  const isParticipant = user?.role === 'participant';
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connectStatus, setConnectStatus] = useState(null);
  const [savedCards, setSavedCards] = useState([]);
  const [addingCard, setAddingCard] = useState(false);
  const [bankHolderName, setBankHolderName] = useState('');
  const [bankBsb, setBankBsb] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [savingBank, setSavingBank] = useState(false);
  const [showBankForm, setShowBankForm] = useState(false);

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
    if (isParticipant) {
      try {
        const { data } = await api.get('/api/payments/customer/payment-methods');
        if (data?.ok) setSavedCards(data.paymentMethods || []);
      } catch (e) {}
    }
    setLoading(false);
  }, [isWorker, isParticipant]);

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

  const setupBankForm = () => {
    setShowBankForm(true);
    if (!bankHolderName && connectStatus?.bank_account?.account_holder_name) {
      setBankHolderName(connectStatus.bank_account.account_holder_name);
    }
  };

  const addCard = async () => {
    try {
      setAddingCard(true);
      const { data, error } = await api.post('/api/payments/customer/setup-session');
      if (error) {
        const detail = typeof error?.response?.error === 'string' ? error.response.error : error.message;
        Alert.alert('Could not start card setup', detail || 'Please try again.');
        return;
      }
      const url = data?.url;
      if (!url) {
        Alert.alert('Could not start card setup', 'Stripe did not return a URL. Please try again.');
        return;
      }
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Error', 'Unable to open the card setup page.');
        return;
      }
      await Linking.openURL(url);
      setTimeout(load, 2000);
    } catch (_) {
      Alert.alert('Error', 'Failed to start card setup.');
    } finally {
      setAddingCard(false);
    }
  };

  const removeCard = (pmId) => {
    Alert.alert(
      'Remove card?',
      'You can add another card at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const { error } = await api.delete(`/api/payments/customer/payment-methods/${pmId}`);
            if (error) {
              Alert.alert('Error', error.message || 'Could not remove card.');
              return;
            }
            await load();
          },
        },
      ],
    );
  };

  const hasSavedBank = Boolean(connectStatus?.bank_account?.last4);
  const hasLinkedAccount = Boolean(connectStatus?.hasAccount);
  const showInAppBankForm = showBankForm || !hasSavedBank;

  const saveBankDetails = async () => {
    const holder = bankHolderName.trim();
    const bsb = bankBsb.trim();
    const acct = bankAccountNumber.trim();
    if (!holder || bsb.replace(/\D/g, '').length < 6 || acct.replace(/\D/g, '').length < 5) {
      Alert.alert('Missing details', 'Enter account holder name, 6-digit BSB, and account number.');
      return;
    }
    setSavingBank(true);
    try {
      const { data, error } = await api.post('/api/payments/connect/bank-details', {
        account_holder_name: holder,
        bsb,
        account_number: acct,
      });
      if (error) {
        const res = error?.response;
        const detail = typeof res?.error === 'string' ? res.error : error.message;
        const hint = typeof res?.hint === 'string' ? res.hint : '';
        Alert.alert('Could not save bank details', [detail, hint].filter(Boolean).join('\n\n'));
        return;
      }
      setBankAccountNumber('');
      setShowBankForm(false);
      Alert.alert('Saved', data?.message || 'Bank account saved for payouts.');
      await load();
    } catch (_) {
      Alert.alert('Error', 'Failed to save bank details.');
    } finally {
      setSavingBank(false);
    }
  };

  const clearBankForm = () => {
    setBankHolderName('');
    setBankBsb('');
    setBankAccountNumber('');
    setShowBankForm(false);
  };

  const runRemovePayoutAccount = async () => {
    const { data, error } = await api.post('/api/payments/connect/disconnect');
    if (error) {
      const detail = error?.response?.error || error.message || 'Failed to remove payout account';
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(String(detail));
      else Alert.alert('Error', String(detail));
      return;
    }
    clearBankForm();
    await load();
    const msg = data?.message || 'Payout account removed. You can add new bank details anytime.';
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(msg);
    else Alert.alert('Done', msg);
  };

  const disconnectStripe = () => {
    const message = 'Remove saved payout bank details? You can enter new details anytime.';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(message)) runRemovePayoutAccount();
      return;
    }
    Alert.alert('Remove payout account?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: runRemovePayoutAccount },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Stripe Connect — workers only (API returns 403 for participants) */}
      {!loading && isWorker && (
        <View style={{ padding: Spacing.md }}>
          <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, ...Shadows.sm }}>
            <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm }}>Payout bank account</Text>
            <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, lineHeight: 20, marginBottom: Spacing.md }}>
              Enter your Australian bank details below. Summit Staffing pays you 85% of each shift (15% platform fee). You do not need to create a Stripe account.
            </Text>

            {connectStatus?.hasWorkerProfile === false ? (
              <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm }}>
                Complete your worker profile first (Profile → Manage Worker Profile), then add your bank details here.
              </Text>
            ) : (
              <>
                {hasSavedBank && !showInAppBankForm ? (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.status.success }} />
                      <Text style={{ color: Colors.status.success, fontWeight: Typography.fontWeight.semibold }}>Bank account saved for payouts</Text>
                    </View>
                    <View style={{ backgroundColor: Colors.surfaceSecondary, borderWidth: 1, borderColor: Colors.borderLight, borderRadius: Radius.md, padding: Spacing.sm, marginBottom: Spacing.md }}>
                      <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.medium }}>
                        {connectStatus.bank_account.account_holder_name || 'Account holder'}
                      </Text>
                      <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, marginTop: 4 }}>
                        BSB {connectStatus.bank_account.bsb_display || '—'} · Account •••• {connectStatus.bank_account.last4}
                      </Text>
                    </View>
                    <Pressable
                      onPress={setupBankForm}
                      style={({ pressed }) => ({
                        backgroundColor: Colors.primary,
                        paddingVertical: Spacing.sm + 1,
                        borderRadius: Radius.md,
                        alignItems: 'center',
                        opacity: pressed ? 0.85 : 1,
                        marginBottom: Spacing.sm,
                      })}
                    >
                      <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>Update bank details</Text>
                    </Pressable>
                    <Pressable onPress={disconnectStripe} style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}>
                      <Text style={{ color: Colors.status.error, fontWeight: Typography.fontWeight.semibold, textAlign: 'center' }}>Remove payout account</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary, marginBottom: 6 }}>
                      Account holder name
                    </Text>
                    <TextInput
                      value={bankHolderName}
                      onChangeText={setBankHolderName}
                      placeholder="Name on bank account"
                      autoCapitalize="words"
                      style={{
                        borderWidth: 1,
                        borderColor: Colors.border,
                        borderRadius: Radius.md,
                        padding: Spacing.sm,
                        marginBottom: Spacing.md,
                        backgroundColor: Colors.surface,
                        color: Colors.text.primary,
                      }}
                    />
                    <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary, marginBottom: 6 }}>
                      BSB
                    </Text>
                    <TextInput
                      value={bankBsb}
                      onChangeText={(text) => setBankBsb(formatBsbInput(text))}
                      placeholder="000-000"
                      keyboardType="number-pad"
                      maxLength={7}
                      style={{
                        borderWidth: 1,
                        borderColor: Colors.border,
                        borderRadius: Radius.md,
                        padding: Spacing.sm,
                        marginBottom: Spacing.md,
                        backgroundColor: Colors.surface,
                        color: Colors.text.primary,
                      }}
                    />
                    <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary, marginBottom: 6 }}>
                      Account number
                    </Text>
                    <TextInput
                      value={bankAccountNumber}
                      onChangeText={(text) => setBankAccountNumber(formatAccountInput(text))}
                      placeholder="5–9 digits"
                      keyboardType="number-pad"
                      maxLength={9}
                      autoComplete="off"
                      textContentType="none"
                      style={{
                        borderWidth: 1,
                        borderColor: Colors.border,
                        borderRadius: Radius.md,
                        padding: Spacing.sm,
                        marginBottom: Spacing.md,
                        backgroundColor: Colors.surface,
                        color: Colors.text.primary,
                      }}
                    />
                    <Pressable
                      onPress={saveBankDetails}
                      disabled={savingBank}
                      style={({ pressed }) => ({
                        backgroundColor: Colors.primary,
                        paddingVertical: Spacing.sm + 1,
                        borderRadius: Radius.md,
                        alignItems: 'center',
                        opacity: pressed || savingBank ? 0.85 : 1,
                        marginBottom: Spacing.sm,
                      })}
                    >
                      <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>
                        {savingBank ? 'Saving…' : 'Save bank account'}
                      </Text>
                    </Pressable>
                    {hasSavedBank ? (
                      <Pressable onPress={() => setShowBankForm(false)} style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1, marginBottom: Spacing.sm })}>
                        <Text style={{ color: Colors.text.secondary, textAlign: 'center' }}>Cancel</Text>
                      </Pressable>
                    ) : null}
                    {hasLinkedAccount ? (
                      <Pressable onPress={disconnectStripe} style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1, marginTop: Spacing.xs })}>
                        <Text style={{ color: Colors.status.error, fontWeight: Typography.fontWeight.semibold, textAlign: 'center' }}>
                          Remove payout account
                        </Text>
                      </Pressable>
                    ) : null}
                  </>
                )}
              </>
            )}
          </View>
        </View>
      )}
      {!loading && isParticipant && (
        <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm }}>
          <View style={{ backgroundColor: '#FFF7ED', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: '#FDBA74' }}>
            <Text style={{ fontWeight: Typography.fontWeight.bold, color: '#9A3412', marginBottom: 4 }}>
              About card holds
            </Text>
            <Text style={{ color: '#9A3412', fontSize: Typography.fontSize.sm, lineHeight: 20 }}>
              PENDING does not always mean you were charged. Your bank may show a temporary hold when a shift is authorized. The final amount is captured only after you approve the worker&apos;s timesheet. If checkout was not finished, the hold is released automatically.
            </Text>
          </View>
        </View>
      )}

      {!loading && isWorker && (
        <View style={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm }}>
          <View style={{ backgroundColor: '#ECFDF5', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: '#6EE7B7' }}>
            <Text style={{ fontWeight: Typography.fontWeight.bold, color: '#065F46', marginBottom: 4 }}>
              When do I get paid?
            </Text>
            <Text style={{ color: '#065F46', fontSize: Typography.fontSize.sm, lineHeight: 20 }}>
              You receive 85% of the shift total after the participant approves your timesheet (or after auto-approval). PENDING means payment is not finalized yet — not missing from Summit.
            </Text>
          </View>
        </View>
      )}

      {!loading && isParticipant && (
        <View style={{ padding: Spacing.md }}>
          <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, ...Shadows.sm }}>
            <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.xs }}>
              Saved cards
            </Text>
            <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, lineHeight: 20, marginBottom: Spacing.md }}>
              Save a card or bank account (BECS Direct Debit) with Stripe for faster booking payments. When you pay from Bookings you can also choose card or Australian bank debit at checkout.
            </Text>

            {savedCards.length === 0 ? (
              <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.sm, marginBottom: Spacing.md }}>
                No cards saved yet.
              </Text>
            ) : (
              savedCards.map((card) => (
                <View
                  key={card.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: Spacing.sm,
                    borderBottomWidth: 1,
                    borderBottomColor: Colors.borderLight,
                  }}
                >
                  <View>
                    <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.semibold, textTransform: 'uppercase' }}>
                      {card.brand || 'CARD'} •••• {card.last4 || '----'}
                    </Text>
                    <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.xs, marginTop: 2 }}>
                      Expires {String(card.expMonth).padStart(2, '0')}/{String(card.expYear).slice(-2)}
                      {card.isDefault ? '  •  Default' : ''}
                    </Text>
                  </View>
                  <Pressable onPress={() => removeCard(card.id)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
                    <Text style={{ color: Colors.status.error, fontWeight: Typography.fontWeight.semibold }}>Remove</Text>
                  </Pressable>
                </View>
              ))
            )}

            <Pressable
              onPress={addCard}
              disabled={addingCard}
              style={({ pressed }) => ({
                marginTop: Spacing.md,
                backgroundColor: '#635BFF',
                paddingVertical: Spacing.sm + 1,
                borderRadius: Radius.md,
                alignItems: 'center',
                opacity: pressed || addingCard ? 0.85 : 1,
              })}
            >
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>
                {addingCard ? 'Opening Stripe…' : savedCards.length === 0 ? 'Save a card via Stripe' : 'Add another card'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {!loading && !isWorker && !isParticipant && (
        <View style={{ padding: Spacing.md }}>
          <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, ...Shadows.sm }}>
            <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm }}>
              Paying for a participant
            </Text>
            <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, lineHeight: 20 }}>
              Coordinators do not pay from this account directly. Open a participant you manage (Coordinator dashboard → participant → Open participant account), then go to Bookings, open a confirmed shift, and tap Pay with card. Payment goes to the support worker on that booking.
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
          renderItem={({ item: p }) => {
            const counterparty = isWorker
              ? [p.participant_first_name, p.participant_last_name].filter(Boolean).join(' ')
              : [p.worker_first_name, p.worker_last_name].filter(Boolean).join(' ');
            const displayAmount = isWorker && p.worker_payout > 0 ? Number(p.worker_payout) : Number(p.amount || 0);
            return (
            <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.sm, ...Shadows.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, paddingRight: Spacing.sm }}>
                  <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, fontSize: Typography.fontSize.lg }}>
                    ${displayAmount.toFixed(2)}
                  </Text>
                  <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.primary, marginTop: 4, fontWeight: Typography.fontWeight.medium }}>
                    {p.service_type || 'Support shift'}
                  </Text>
                  {p.start_time ? (
                    <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginTop: 2 }}>
                      Shift: {formatDateDMY(p.start_time)}
                    </Text>
                  ) : null}
                  {counterparty ? (
                    <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginTop: 2 }}>
                      {isWorker ? 'Client' : 'Worker'}: {counterparty}
                    </Text>
                  ) : null}
                  <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginTop: 2 }}>
                    {formatPaymentKind(p.payment_kind, p.status)}
                    {p.invoice_number ? ` · Invoice ${p.invoice_number}` : ''}
                  </Text>
                  {p.status_explanation ? (
                    <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginTop: 4, lineHeight: 16 }}>
                      {p.status_explanation}
                    </Text>
                  ) : null}
                  {(p.payment_date || p.created_at) && (
                    <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginTop: 2 }}>
                      {formatDateDMY(p.payment_date || p.created_at)}
                    </Text>
                  )}
                </View>
                <View style={{ backgroundColor: STATUS_COLORS[p.status] || Colors.text.muted, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full }}>
                  <Text style={{ color: Colors.text.white, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, textTransform: 'uppercase' }}>{p.status}</Text>
                </View>
              </View>
              {isWorker && p.worker_payout > 0 && p.amount > 0 && Number(p.worker_payout) !== Number(p.amount) && (
                <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.status.success, marginTop: Spacing.xs }}>
                  Your payout (85%): ${Number(p.worker_payout).toFixed(2)}
                </Text>
              )}
            </View>
          );}}
          ListEmptyComponent={
            <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
              <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>No payments yet</Text>
              {isParticipant && (
                <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.xs, textAlign: 'center' }}>
                  Pay for a booking from Bookings → open a confirmed shift → Pay with card. Your payments will be listed here.
                </Text>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}
