/**
 * Summit Staffing – Email verification (enter token from email)
 */

import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useLoading } from '../../hooks/useLoading.js';
import { useErrorHandler } from '../../hooks/useErrorHandler.js';
import { api } from '../../services/api.js';
import { showSuccess } from '../../utils/errorHandler.js';
import { LoadingScreen } from '../../components/LoadingScreen.js';
import { Colors, Spacing, Typography, Radius } from '../../constants/theme.js';

const inputStyle = {
  backgroundColor: Colors.surface,
  borderWidth: 1,
  borderColor: Colors.border,
  borderRadius: Radius.md,
  paddingVertical: Spacing.md,
  paddingHorizontal: Spacing.lg,
  fontSize: Typography.fontSize.base,
  color: Colors.text.primary,
};

const buttonStyle = (pressed) => ({
  backgroundColor: Colors.primary,
  paddingVertical: Spacing.md,
  borderRadius: Radius.md,
  alignItems: 'center',
  opacity: pressed ? 0.9 : 1,
});

export function VerificationScreen({ route, navigation }) {
  const email = route?.params?.email ?? '';
  const [token, setToken] = useState('');
  const [verified, setVerified] = useState(false);
  const { isLoading, withLoading } = useLoading();
  const { error, handleError, clearError } = useErrorHandler();

  const onVerify = withLoading(async () => {
    clearError();
    const { data, error: err } = await api.post('/api/auth/verify-email', { token: token.trim() });
    if (err) {
      handleError(err);
      return;
    }
    if (data?.ok) {
      setVerified(true);
      showSuccess('Email verified. You can sign in.');
      setTimeout(() => navigation.navigate('Login'), 1500);
    } else {
      handleError(new Error(data?.error || 'Verification failed'));
    }
  });

  if (isLoading) {
    return <LoadingScreen message="Verifying…" />;
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <View style={{ flex: 1, padding: Spacing.lg, justifyContent: 'center' }}>
        <Text style={{ fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm }}>
          Verify your email
        </Text>
        <Text style={{ fontSize: Typography.fontSize.base, color: Colors.text.secondary, marginBottom: Spacing.xl }}>
          {email ? `We sent a verification link to ${email}. Enter the code from the email below.` : "Enter the verification code from your email."}
        </Text>

        {verified ? (
          <Text style={{ fontSize: Typography.fontSize.base, color: Colors.status.success }}>
            Verified! Redirecting to sign in…
          </Text>
        ) : (
          <>
            <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: Colors.text.primary, marginBottom: Spacing.sm }}>
              Verification code
            </Text>
            <TextInput
              style={[inputStyle, { marginBottom: Spacing.lg }]}
              placeholder="Paste code from email"
              placeholderTextColor={Colors.text.muted}
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
              editable={!isLoading}
            />
            {error ? (
              <Text style={{ color: Colors.status.error, fontSize: Typography.fontSize.sm, marginBottom: Spacing.md }}>
                {error.message}
              </Text>
            ) : null}
            <Pressable onPress={onVerify} style={({ pressed }) => buttonStyle(pressed)}>
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.base }}>
                Verify email
              </Text>
            </Pressable>
          </>
        )}

        <Pressable onPress={() => navigation.navigate('Login')} style={{ marginTop: Spacing.xl, alignItems: 'center' }}>
          <Text style={{ color: Colors.primary, fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium }}>
            Back to sign in
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
