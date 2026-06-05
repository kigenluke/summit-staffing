/**
 * Shown instead of main app until documents are uploaded, submitted, and admin-verified.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../store/authStore.js';
import { useAccountAccess } from '../context/WorkerGateContext.js';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius } from '../constants/theme.js';
import { SUPPORT_EMAIL, openSupportDocumentsEmail } from '../utils/verificationPrompt.js';

export function VerificationGateScreen() {
  const navigation = useNavigation();
  const { user, logout } = useAuthStore();
  const { accessPhase, progress, refresh } = useAccountAccess();
  const [submitting, setSubmitting] = useState(false);

  const isWorker = user?.role === 'worker';
  const isParticipant = user?.role === 'participant';

  const title =
    accessPhase === 'needs_documents'
      ? 'Upload your documents'
      : accessPhase === 'ready_to_submit'
        ? 'Ready to submit'
        : accessPhase === 'pending_verification'
          ? 'Awaiting verification'
          : 'Setting up your account';

  const message =
    accessPhase === 'needs_documents'
      ? `Upload all required compliance documents (${progress?.uploadedCount ?? 0} of ${progress?.total ?? 5} done). Summit Staffing is Australia-only.`
      : accessPhase === 'ready_to_submit'
        ? 'All required documents are uploaded. Submit them for admin verification to unlock the app.'
        : accessPhase === 'pending_verification'
          ? 'Your documents have been submitted. Please await admin verification — you will get full access once approved.'
          : 'Please wait…';

  const onUpload = () => {
    if (isWorker) {
      navigation.navigate('WorkerManage');
      return;
    }
    if (isParticipant) {
      navigation.navigate('ParticipantCompliance');
    }
  };

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      const path = isWorker
        ? '/api/workers/me/submit-verification'
        : '/api/participants/me/submit-verification';
      const { data, error } = await api.post(path, {});
      if (error) {
        const msg = error.message || 'Could not submit';
        if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(msg);
        else Alert.alert('Submit failed', msg);
        return;
      }
      if (data?.ok) {
        const msg = data.message || 'Submitted for verification. Please await admin approval.';
        if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(msg);
        else Alert.alert('Submitted', msg);
        await refresh();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background, padding: Spacing.lg, justifyContent: 'center' }}>
      <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.xl, ...{ shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8 } }}>
        <Text style={{ fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.md }}>
          {title}
        </Text>
        <Text style={{ fontSize: Typography.fontSize.base, color: Colors.text.secondary, lineHeight: 22, marginBottom: Spacing.md }}>
          {message}
        </Text>
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.xs }}>
          Or email your documents to:
        </Text>
        <Pressable
          onPress={openSupportDocumentsEmail}
          style={({ pressed }) => ({ marginBottom: Spacing.lg, opacity: pressed ? 0.85 : 1, alignSelf: 'flex-start' })}
        >
          <Text style={{ fontSize: Typography.fontSize.base, color: Colors.primary, fontWeight: Typography.fontWeight.semibold, textDecorationLine: 'underline' }}>
            {SUPPORT_EMAIL}
          </Text>
        </Pressable>

        {accessPhase === 'loading' && <ActivityIndicator color={Colors.primary} />}

        {(accessPhase === 'needs_documents' || accessPhase === 'ready_to_submit') && (
          <Pressable
            onPress={onUpload}
            style={({ pressed }) => ({
              backgroundColor: Colors.surfaceSecondary,
              borderWidth: 1,
              borderColor: Colors.border,
              paddingVertical: Spacing.md,
              borderRadius: Radius.md,
              alignItems: 'center',
              opacity: pressed ? 0.9 : 1,
              marginBottom: Spacing.sm,
            })}
          >
            <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.semibold }}>
              {accessPhase === 'ready_to_submit' ? 'Review documents' : 'Upload documents'}
            </Text>
          </Pressable>
        )}

        {accessPhase === 'ready_to_submit' && (
          <Pressable
            onPress={onSubmit}
            disabled={submitting}
            style={({ pressed }) => ({
              backgroundColor: Colors.primary,
              paddingVertical: Spacing.md,
              borderRadius: Radius.md,
              alignItems: 'center',
              opacity: pressed ? 0.9 : submitting ? 0.6 : 1,
              marginBottom: Spacing.sm,
            })}
          >
            {submitting ? (
              <ActivityIndicator color={Colors.text.white} />
            ) : (
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>Submit for verification</Text>
            )}
          </Pressable>
        )}

        {accessPhase === 'pending_verification' && (
          <Pressable
            onPress={() => refresh()}
            style={({ pressed }) => ({
              backgroundColor: Colors.surfaceSecondary,
              borderWidth: 1,
              borderColor: Colors.border,
              paddingVertical: Spacing.md,
              borderRadius: Radius.md,
              alignItems: 'center',
              opacity: pressed ? 0.9 : 1,
              marginBottom: Spacing.sm,
            })}
          >
            <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.semibold }}>Refresh status</Text>
          </Pressable>
        )}

        <Pressable onPress={() => logout()} style={{ paddingVertical: Spacing.sm, alignItems: 'center' }}>
          <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.sm }}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}
