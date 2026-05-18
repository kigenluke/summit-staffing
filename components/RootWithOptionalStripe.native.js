import React from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';
import { getStripePublishableKeyForNative } from '../constants/stripePublic';

/**
 * iOS/Android: Stripe PaymentSheet context when STRIPE_PUBLISHABLE_KEY is available.
 * Without a key the app still launches (payments use server key or show a message).
 */
export default function RootWithOptionalStripe({ children }) {
  const publishableKey = getStripePublishableKeyForNative();

  if (!publishableKey) {
    return children;
  }

  return (
    <StripeProvider publishableKey={publishableKey} urlScheme="summitstaffing" merchantIdentifier="">
      {children}
    </StripeProvider>
  );
}
