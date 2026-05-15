import React, { useState } from 'react';
import { Pressable, Text, ActivityIndicator, Alert, Linking } from 'react-native';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius } from '../constants/theme.js';

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
        Alert.alert(
          'Could not start payment',
          error.message || 'Please try again shortly. If this keeps happening, contact support.',
        );
        return;
      }
      const checkoutUrl = data?.checkout_url;
      if (!checkoutUrl) {
        Alert.alert('Payment', 'Checkout link was not returned.');
        return;
      }
      const canOpen = await Linking.canOpenURL(checkoutUrl);
      if (!canOpen) {
        Alert.alert('Payment', 'Could not open the payment page in this browser.');
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
