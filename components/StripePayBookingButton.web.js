import React, { useState } from 'react';
import { Pressable, Text, ActivityIndicator, Alert, Linking, Platform } from 'react-native';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius } from '../constants/theme.js';

function showUserMessage(title, message) {
  const body = message ? String(message) : '';
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(body ? `${title}\n\n${body}` : title);
    return;
  }
  Alert.alert(title, body || undefined);
}

/**
 * Web: Stripe Checkout in browser (Hosted Checkout).
 */
export function StripePayBookingButton({ bookingId, onPaid }) {
  const [busy, setBusy] = useState(false);

  const onPress = async () => {
    setBusy(true);
    try {
      const { data, error } = await api.post('/api/payments/checkout-session', { bookingId });
      if (error) {
        showUserMessage(
          'Could not start payment',
          error.message || 'Please try again shortly. If this keeps happening, contact support.',
        );
        if (/already paid/i.test(error.message || '')) {
          onPaid?.();
        }
        return;
      }
      const checkoutUrl = data?.checkout_url;
      if (!checkoutUrl) {
        showUserMessage('Payment', 'Checkout link was not returned.');
        return;
      }
      const canOpen = await Linking.canOpenURL(checkoutUrl);
      if (!canOpen) {
        showUserMessage('Payment', 'Could not open the payment page in this browser.');
        return;
      }
      await Linking.openURL(checkoutUrl);
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
        <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>Pay with Stripe</Text>
      )}
    </Pressable>
  );
}
