/**
 * Summit Staffing – Set a new password using the token from the reset email.
 */

import React, { useEffect, useState } from 'react';
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

function readTokenFromWebUrl() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return '';
  try {
    const u = new URL(window.location.href);
    return String(u.searchParams.get('token') || '').trim();
  } catch (_) {
    return '';
  }
}

export function ResetPasswordScreen({ route, navigation }) {
  const paramToken = route?.params?.token ? String(route.params.token).trim() : '';
  const [token, setToken] = useState(paramToken);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const { isLoading, withLoading } = useLoading();
  const { error, handleError, clearError } = useErrorHandler();

  useEffect(() => {
    if (paramToken) setToken(paramToken);
    else {
      const fromUrl = readTokenFromWebUrl();
      if (fromUrl) setToken(fromUrl);
    }
  }, [paramToken]);

  const onSubmit = withLoading(async () => {
    clearError();
    const t = token.trim();
    if (!t) {
      handleError(new Error('Reset link is missing or invalid. Open the link from your email again.'));
      return;
    }
    if (password.length < 8) {
      handleError(new Error('Password must be at least 8 characters.'));
      return;
    }
    if (password !== confirm) {
      handleError(new Error('Passwords do not match.'));
      return;
    }
    const { data, error: err } = await api.post('/api/auth/reset-password', {
      token: t,
      newPassword: password,
    });
    if (err) {
      handleError(err);
      return;
    }
    if (data?.ok) {
      setDone(true);
      showSuccess('Password updated. You can sign in now.');
      setTimeout(() => navigation.navigate('Login'), 1600);
    } else {
      handleError(new Error(data?.error || 'Reset failed'));
    }
  });

  if (isLoading) {
    return <LoadingScreen message="Updating password…" />;
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <View style={{ flex: 1, padding: Spacing.lg, justifyContent: 'center' }}>
        <Text style={{ fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm }}>
          New password
        </Text>
        <Text style={{ fontSize: Typography.fontSize.base, color: Colors.text.secondary, marginBottom: Spacing.xl }}>
          Choose a new password for your account. The reset link from your email is valid for one hour.
        </Text>

        {done ? (
          <Text style={{ fontSize: Typography.fontSize.base, color: Colors.status.success }}>
            Password saved. Taking you to sign in…
          </Text>
        ) : (
          <>
            <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: Colors.text.primary, marginBottom: Spacing.sm }}>
              Reset token (from your email)
            </Text>
            <TextInput
              style={[inputStyle, { marginBottom: Spacing.md, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}
              placeholder="Paste token if the link did not fill it"
              placeholderTextColor={Colors.text.muted}
              value={token}
              onChangeText={setToken}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isLoading}
            />

            <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: Colors.text.primary, marginBottom: Spacing.sm }}>
              New password
            </Text>
            <TextInput
              style={[inputStyle, { marginBottom: Spacing.md }]}
              placeholder="At least 8 characters"
              placeholderTextColor={Colors.text.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!isLoading}
            />

            <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: Colors.text.primary, marginBottom: Spacing.sm }}>
              Confirm password
            </Text>
            <TextInput
              style={[inputStyle, { marginBottom: Spacing.lg }]}
              placeholder="Repeat new password"
              placeholderTextColor={Colors.text.muted}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              editable={!isLoading}
            />

            {error ? (
              <Text style={{ color: Colors.status.error, fontSize: Typography.fontSize.sm, marginBottom: Spacing.md }}>
                {error.message}
              </Text>
            ) : null}

            <Pressable onPress={onSubmit} style={({ pressed }) => buttonStyle(pressed)}>
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.base }}>
                Update password
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
