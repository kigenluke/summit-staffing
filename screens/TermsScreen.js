/**
 * Summit Staffing – Terms & Conditions Screen
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { useAuthStore } from '../store/authStore.js';
import { acceptTerms, getCurrentTermsVersion } from '../utils/termsService.js';
import { Colors, Spacing, Typography, Radius } from '../constants/theme.js';

export function TermsScreen({ navigation }) {
  const { user } = useAuthStore();
  const [accepting, setAccepting] = useState(false);
  const termsVersion = getCurrentTermsVersion();

  const accept = async () => {
    if (accepting) return;
    if (!user?.id) {
      Alert.alert('Sign in required', 'Please sign in again, then accept the terms.');
      return;
    }

    setAccepting(true);
    try {
      const result = await acceptTerms(user.id);
      if (result.ok) {
        Alert.alert(
          'Accepted',
          result.warning || 'Terms & Conditions accepted.',
        );
        navigation?.goBack?.();
        return;
      }

      const body = [result.error, result.hint].filter(Boolean).join('\n\n');
      Alert.alert('Could not save acceptance', body || 'Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 120 }}>
        <Text style={{ fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.lg }}>
          Terms & Conditions
        </Text>
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.muted, marginBottom: Spacing.lg }}>
          Version {termsVersion} • Summit Staffing Pty Ltd • ABN 73 690 199 501
        </Text>

        <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm, fontSize: Typography.fontSize.lg }}>1. Acceptance</Text>
        <Text style={{ color: Colors.text.secondary, marginBottom: Spacing.lg, lineHeight: 22 }}>
          By using Summit Staffing, you agree to these terms and conditions. The platform connects NDIS participants with verified support workers.
        </Text>

        <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm, fontSize: Typography.fontSize.lg }}>2. User Accounts</Text>
        <Text style={{ color: Colors.text.secondary, marginBottom: Spacing.lg, lineHeight: 22 }}>
          Users must provide accurate information during registration. You are responsible for maintaining the confidentiality of your account credentials. Workers must upload valid verification documents to offer services on the platform.
        </Text>

        <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm, fontSize: Typography.fontSize.lg }}>3. Services</Text>
        <Text style={{ color: Colors.text.secondary, marginBottom: Spacing.lg, lineHeight: 22 }}>
          Summit Staffing facilitates connections between participants and workers. We do not directly provide support services. Workers are independent contractors and not employees of Summit Staffing.
        </Text>

        <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm, fontSize: Typography.fontSize.lg }}>4. Payments</Text>
        <Text style={{ color: Colors.text.secondary, marginBottom: Spacing.lg, lineHeight: 22 }}>
          Payments are processed through Stripe. A commission fee applies to each completed booking. Workers receive payouts to their connected bank accounts after service completion.
        </Text>

        <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm, fontSize: Typography.fontSize.lg }}>5. Privacy</Text>
        <Text style={{ color: Colors.text.secondary, marginBottom: Spacing.lg, lineHeight: 22 }}>
          We collect and process personal information in accordance with Australian Privacy Principles. NDIS-related data is handled with additional security measures. Your data will not be shared with third parties without consent.
        </Text>

        <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm, fontSize: Typography.fontSize.lg }}>6. Cancellations</Text>
        <Text style={{ color: Colors.text.secondary, marginBottom: Spacing.lg, lineHeight: 22 }}>
          Bookings can be cancelled up to 24 hours before the scheduled start time. Late cancellations may incur a fee. Repeated cancellations may result in account review.
        </Text>

        <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm, fontSize: Typography.fontSize.lg }}>7. Disputes</Text>
        <Text style={{ color: Colors.text.secondary, marginBottom: Spacing.lg, lineHeight: 22 }}>
          Any disputes between participants and workers should first be raised through the platform's messaging system. Summit Staffing administrators will mediate disputes when needed.
        </Text>

        <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm, fontSize: Typography.fontSize.lg }}>8. Suspension</Text>
        <Text style={{ color: Colors.text.secondary, marginBottom: Spacing.lg, lineHeight: 22 }}>
          Summit Staffing reserves the right to suspend or terminate accounts that violate these terms, engage in fraudulent activity, or receive multiple complaints.
        </Text>
      </ScrollView>

      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: Colors.surface, padding: Spacing.lg, borderTopWidth: 1, borderTopColor: Colors.border }}>
        <Pressable
          onPress={accept}
          disabled={accepting}
          style={({ pressed }) => ({
            backgroundColor: accepting ? Colors.text.muted : Colors.primary,
            paddingVertical: Spacing.md,
            borderRadius: Radius.md,
            alignItems: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.lg }}>
            {accepting ? 'Accepting…' : 'I Accept the Terms & Conditions'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
