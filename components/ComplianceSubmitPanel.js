import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Colors, Spacing, Typography, Radius } from '../constants/theme.js';
import { DOC_TYPE_LABELS } from '../utils/complianceProgress.js';

export function ComplianceSubmitPanel({
  progress,
  verificationSubmittedAt,
  verificationStatus,
  onSubmit,
  submitting = false,
}) {
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const busy = submitting || localSubmitting;

  if (!progress) return null;

  const submitted = Boolean(verificationSubmittedAt) || verificationStatus === 'verified';
  const awaiting = submitted && verificationStatus !== 'verified';

  return (
    <View
      style={{
        marginTop: Spacing.lg,
        padding: Spacing.md,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: awaiting ? Colors.status.warning : Colors.border,
        backgroundColor: awaiting ? `${Colors.status.warning}18` : Colors.surfaceSecondary,
      }}
    >
      <Text style={{ fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary, marginBottom: Spacing.xs }}>
        {progress.uploadedCount} of {progress.total} required documents uploaded
      </Text>

      {progress.missing?.length > 0 && (
        <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginBottom: Spacing.sm }}>
          Still needed: {progress.missing.map((k) => DOC_TYPE_LABELS[k] || k).join(', ')}
        </Text>
      )}

      {awaiting && (
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.status.warning, marginBottom: Spacing.sm }}>
          Awaiting verification — an admin will review your documents. You will be notified when your account is approved.
        </Text>
      )}

      {progress.allUploaded && !submitted && (
        <>
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.sm }}>
            All required documents are uploaded. Submit them for admin verification to unlock the app.
          </Text>
          <Pressable
            onPress={async () => {
              setLocalSubmitting(true);
              try {
                await onSubmit();
              } finally {
                setLocalSubmitting(false);
              }
            }}
            disabled={busy}
            style={({ pressed }) => ({
              backgroundColor: busy ? Colors.text.muted : Colors.primary,
              paddingVertical: Spacing.md,
              borderRadius: Radius.md,
              alignItems: 'center',
              opacity: pressed ? 0.9 : 1,
            })}
          >
            {busy ? (
              <ActivityIndicator color={Colors.text.white} />
            ) : (
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>Submit for verification</Text>
            )}
          </Pressable>
        </>
      )}
    </View>
  );
}
