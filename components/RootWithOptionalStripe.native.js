import React from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';
import { getStripePublishableKeyForNative } from '../constants/stripePublic';

/** iOS/Android: wraps app with Stripe PaymentSheet context. Requires STRIPE_PUBLISHABLE_KEY in `.env`. */
export default function RootWithOptionalStripe({ children }) {
  const publishableKey = getStripePublishableKeyForNative();
  return (
    <StripeProvider publishableKey={publishableKey} urlScheme="summitstaffing" merchantIdentifier="">
      {children}
    </StripeProvider>
  );
}
