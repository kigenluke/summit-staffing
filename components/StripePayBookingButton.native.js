import React, { useState } from 'react';
import { Pressable, Text, ActivityIndicator, Alert, Platform } from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { api } from '../services/api.js';
import { getStripePublishableKeyForNative } from '../constants/stripePublic';
import { Colors, Spacing, Typography, Radius } from '../constants/theme.js';

const STRIPE_RETURN_URL = 'summitstaffing://stripe-redirect';

function showUserMessage(title, message) {
  const body = message ? String(message) : '';
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(body ? `${title}\n\n${body}` : title);
    return;
  }
  Alert.alert(title, body || undefined);
}

function StripePayBookingButtonInner({ bookingId, onPaid }) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [busy, setBusy] = useState(false);

  const onPress = async () => {
    setBusy(true);
    try {
      const { data, error } = await api.post('/api/payments/create-intent', { bookingId });
      if (error || !data?.client_secret) {
        showUserMessage(
          'Could not start payment',
          error?.message || 'Please try again shortly. If this keeps happening, contact support.',
        );
        if (/already paid/i.test(error?.message || '')) {
          onPaid?.();
        }
        return;
      }

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'Summit Staffing',
        paymentIntentClientSecret: data.client_secret,
        allowsDelayedPaymentMethods: true,
        returnURL: STRIPE_RETURN_URL,
      });

      if (initError) {
        Alert.alert('Payment', initError.message || 'Could not prepare the payment sheet.');
        return;
      }

      const { error: payError } = await presentPaymentSheet();

      if (payError) {
        if (payError.code !== 'Canceled') {
          Alert.alert('Payment', payError.message || 'Payment could not be completed.');
        }
        return;
      }

      const piId = data.payment_intent_id;
      if (piId) {
        const confirmRes = await api.post('/api/payments/confirm', { payment_intent_id: piId });
        if (confirmRes.error) {
          Alert.alert(
            'Payment recorded',
            'Your payment may still be processing. Refresh this screen in a moment.',
          );
        }
      }

      Alert.alert('Success', 'Payment completed.');
      onPaid?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => ({
        backgroundColor: '#635BFF',
        paddingVertical: Spacing.md,
        borderRadius: Radius.md,
        alignItems: 'center',
        marginBottom: Spacing.md,
        opacity: pressed ? 0.8 : busy ? 0.6 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator color={Colors.text.white} />
      ) : (
        <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>Pay with card</Text>
      )}
    </Pressable>
  );
}

/**
 * Native: Stripe Payment Sheet when STRIPE_PUBLISHABLE_KEY is configured.
 */
export function StripePayBookingButton({ bookingId, onPaid }) {
  const publishableKey = getStripePublishableKeyForNative();

  if (!publishableKey) {
    return (
      <Pressable
        onPress={() => {
          Alert.alert(
            'Payments not configured',
            'Add STRIPE_PUBLISHABLE_KEY to .env, rebuild the APK, then try again.',
          );
        }}
        style={{
          backgroundColor: Colors.text.muted,
          paddingVertical: Spacing.md,
          borderRadius: Radius.md,
          alignItems: 'center',
          marginBottom: Spacing.md,
        }}
      >
        <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>Pay with card</Text>
      </Pressable>
    );
  }

  return <StripePayBookingButtonInner bookingId={bookingId} onPaid={onPaid} />;
}
