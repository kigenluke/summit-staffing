/**
 * Summit Staffing – Register participant (after onboarding steps); sends onboarding + account data.
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
import { useParticipantSignUp } from '../../context/ParticipantSignUpContext.js';
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

const labelStyle = { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: Colors.text.primary, marginBottom: Spacing.sm };

export function RegisterParticipantScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [ndisNumber, setNdisNumber] = useState('');
  const [phone, setPhone] = useState('');
  const { setAuth } = useAuthStore();
  const onboarding = useParticipantSignUp();
  const { isLoading, withLoading } = useLoading();
  const { error, handleError, clearError } = useErrorHandler();

  const onRegister = withLoading(async () => {
    clearError();
    const body = {
      email: email.trim().toLowerCase(),
      password,
      role: 'participant',
      first_name: firstName.trim() || undefined,
      last_name: lastName.trim() || undefined,
      phone: phone.trim() || undefined,
      who_needs_support: onboarding.whoNeedsSupport || undefined,
      when_start_looking: onboarding.whenStartLooking || undefined,
      over_18: onboarding.over18,
      funding_type: onboarding.fundingType || undefined,
      address: onboarding.location?.address || undefined,
    };
    if (ndisNumber.trim()) {
      body.ndis_number = ndisNumber.replace(/\D/g, '').slice(0, 10);
    }

    const { data, error: err } = await api.post('/api/auth/register', body);
    if (err) {
      handleError(err);
      return;
    }
    if (data?.ok && data?.token) {
      onboarding.reset();
      setAuth(data.token, data.user);
    } else {
      handleError(new Error(data?.error || 'Registration failed'));
    }
  });

  if (isLoading) {
    return <LoadingScreen message="Creating account…" />;
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.xs }}>
          Sign up
        </Text>
        <Text style={{ fontSize: Typography.fontSize.base, color: Colors.text.secondary, marginBottom: Spacing.lg }}>
          Create your account
        </Text>

        <Text style={labelStyle}>Email</Text>
        <TextInput style={[inputStyle, { marginBottom: Spacing.md }]} placeholder="you@example.com" placeholderTextColor={Colors.text.muted} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" editable={!isLoading} />

        <Text style={labelStyle}>Password (min 8 characters)</Text>
        <TextInput style={[inputStyle, { marginBottom: Spacing.md }]} placeholder="••••••••" placeholderTextColor={Colors.text.muted} value={password} onChangeText={setPassword} secureTextEntry editable={!isLoading} />

        <Text style={labelStyle}>First name</Text>
        <TextInput style={[inputStyle, { marginBottom: Spacing.md }]} placeholder="First name" placeholderTextColor={Colors.text.muted} value={firstName} onChangeText={setFirstName} editable={!isLoading} />

        <Text style={labelStyle}>Last name</Text>
        <TextInput style={[inputStyle, { marginBottom: Spacing.md }]} placeholder="Last name" placeholderTextColor={Colors.text.muted} value={lastName} onChangeText={setLastName} editable={!isLoading} />

        <Text style={labelStyle}>NDIS number (optional, 10 digits)</Text>
        <TextInput style={[inputStyle, { marginBottom: Spacing.md }]} placeholder="4300123456" placeholderTextColor={Colors.text.muted} value={ndisNumber} onChangeText={setNdisNumber} keyboardType="number-pad" maxLength={10} editable={!isLoading} />

        <Text style={labelStyle}>Phone (optional)</Text>
        <TextInput style={[inputStyle, { marginBottom: Spacing.lg }]} placeholder="0400000000" placeholderTextColor={Colors.text.muted} value={phone} onChangeText={setPhone} keyboardType="phone-pad" editable={!isLoading} />

        {error ? (
          <Text style={{ color: Colors.status.error, fontSize: Typography.fontSize.sm, marginBottom: Spacing.md }}>
            {error.message}
          </Text>
        ) : null}

        <Pressable onPress={onRegister} style={({ pressed }) => buttonStyle(pressed)}>
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.base }}>
            Create account
          </Text>
        </Pressable>

        <Pressable onPress={() => navigation.navigate('Login')} style={{ marginTop: Spacing.lg, alignItems: 'center' }}>
          <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm }}>
            Already have an account? <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.semibold }}>Sign in</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
