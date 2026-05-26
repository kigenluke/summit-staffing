import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useWorkerGate } from '../context/WorkerGateContext.js';
import { showVerificationRequiredAlert } from '../utils/verificationPrompt.js';
import { Colors, Spacing, Typography, Radius } from '../constants/theme.js';

export function VerificationBanner() {
  const { restricted, accessPhase, accessChecking } = useWorkerGate();
  if (!restricted) return null;
  if (accessChecking) return null;

  const hint =
    accessPhase === 'ready_to_submit'
      ? 'All documents uploaded — open Profile and tap Submit for verification.'
      : accessPhase === 'pending_verification'
        ? 'Awaiting admin verification. You can still upload documents from Profile if needed.'
        : 'Upload your compliance documents from Profile to unlock the app.';

  return (
    <Pressable
      onPress={showVerificationRequiredAlert}
      style={({ pressed }) => ({
        backgroundColor: `${Colors.status.warning}22`,
        borderWidth: 1,
        borderColor: Colors.status.warning,
        borderRadius: Radius.md,
        padding: Spacing.md,
        marginBottom: Spacing.md,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: 4 }}>
        Documents required
      </Text>
      <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary }}>{hint}</Text>
    </Pressable>
  );
}
