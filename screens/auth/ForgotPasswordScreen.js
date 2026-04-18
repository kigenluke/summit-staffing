/**
 * Summit Staffing – Forgot password – request reset email
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

export function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { isLoading, withLoading } = useLoading();
  const { error, handleError, clearError } = useErrorHandler();

  const onSubmit = withLoading(async () => {
    clearError();
    const { data, error: err } = await api.post('/api/auth/forgot-password', { email: email.trim().toLowerCase() });
    if (err) {
      handleError(err);
      return;
    }
    setSent(true);
    showSuccess('If that email is registered, we sent a reset link.');
  });

  if (isLoading) {
    return <LoadingScreen message="Sending…" />;
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <View style={{ flex: 1, padding: Spacing.lg, justifyContent: 'center' }}>
        <Text style={{ fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm }}>
          Reset password
        </Text>
        <Text style={{ fontSize: Typography.fontSize.base, color: Colors.text.secondary, marginBottom: Spacing.xl }}>
          Enter your email and we'll send you a link to reset your password.
        </Text>

        {sent ? (
          <Text style={{ fontSize: Typography.fontSize.base, color: Colors.status.success, marginBottom: Spacing.lg }}>
            Check your email for the reset link.
          </Text>
        ) : (
          <>
            <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: Colors.text.primary, marginBottom: Spacing.sm }}>
              Email
            </Text>
            <TextInput
              style={[inputStyle, { marginBottom: Spacing.lg }]}
              placeholder="you@example.com"
              placeholderTextColor={Colors.text.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!isLoading}
            />
            {error ? (
              <Text style={{ color: Colors.status.error, fontSize: Typography.fontSize.sm, marginBottom: Spacing.md }}>
                {error.message}
              </Text>
            ) : null}
            <Pressable onPress={onSubmit} style={({ pressed }) => buttonStyle(pressed)}>
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.base }}>
                Send reset link
              </Text>
            </Pressable>
          </>
        )}

        <Pressable onPress={() => navigation.goBack()} style={{ marginTop: Spacing.xl, alignItems: 'center' }}>
          <Text style={{ color: Colors.primary, fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium }}>
            Back to sign in
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
