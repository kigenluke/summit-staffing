/**
 * Summit Staffing – Login screen
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuthStore } from '../../store/authStore.js';
import { useLoading } from '../../hooks/useLoading.js';
import { useErrorHandler } from '../../hooks/useErrorHandler.js';
import { api } from '../../services/api.js';
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

export function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { setAuth } = useAuthStore();
  const { isLoading, withLoading } = useLoading();
  const { error, handleError, clearError } = useErrorHandler();

  const onLogin = withLoading(async () => {
    clearError();
    const { data, error: err } = await api.post('/api/auth/login', { email: email.trim().toLowerCase(), password });
    if (err) {
      handleError(err);
      return;
    }
    if (data?.ok && data?.token) {
      setAuth(data.token, data.user);
    } else {
      handleError(new Error(data?.error || 'Login failed'));
    }
  });

  if (isLoading) {
    return <LoadingScreen message="Signing in…" />;
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: Spacing.lg, paddingTop: Spacing.xxl, justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.xs }}>
          Sign in
        </Text>
        <Text style={{ fontSize: Typography.fontSize.base, color: Colors.text.secondary, marginBottom: Spacing.xl }}>
          Summit Staffing – NDIS marketplace
        </Text>

        <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: Colors.text.primary, marginBottom: Spacing.sm }}>
          Email
        </Text>
        <TextInput
          style={[inputStyle, { marginBottom: Spacing.md }]}
          placeholder="you@example.com"
          placeholderTextColor={Colors.text.muted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
          editable={!isLoading}
        />

        <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: Colors.text.primary, marginBottom: Spacing.sm }}>
          Password
        </Text>
        <TextInput
          style={[inputStyle, { marginBottom: Spacing.lg }]}
          placeholder="••••••••"
          placeholderTextColor={Colors.text.muted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!isLoading}
        />

        {error ? (
          <Text style={{ color: Colors.status.error, fontSize: Typography.fontSize.sm, marginBottom: Spacing.md }}>
            {error.message}
          </Text>
        ) : null}

        <Pressable onPress={onLogin} style={({ pressed }) => buttonStyle(pressed)}>
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.base }}>
            Sign in
          </Text>
        </Pressable>

        <Pressable onPress={() => navigation.navigate('ForgotPassword')} style={{ marginTop: Spacing.lg, alignItems: 'center' }}>
          <Text style={{ color: Colors.primary, fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium }}>
            Forgot password?
          </Text>
        </Pressable>

        <Pressable onPress={() => navigation.navigate('Register')} style={{ marginTop: Spacing.md, alignItems: 'center' }}>
          <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm }}>
            Don't have an account? <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.semibold }}>Sign up</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
