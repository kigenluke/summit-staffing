import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';
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
  const verified = verificationStatus === 'verified';

  return (
    <View
      style={{
        marginTop: Spacing.lg,
        padding: Spacing.lg,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: verified ? Colors.status.success : awaiting ? Colors.status.warning : Colors.border,
        backgroundColor: verified ? `${Colors.status.success}12` : awaiting ? `${Colors.status.warning}12` : Colors.surface,
        ...Shadows.sm,
      }}
    >
      <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, fontSize: Typography.fontSize.lg, marginBottom: Spacing.xs }}>
        Verification
      </Text>

      {verified ? (
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.status.success, fontWeight: Typography.fontWeight.medium }}>
          Your account is verified. Thank you!
        </Text>
      ) : (
        <>
          <Text style={{ fontWeight: Typography.fontWeight.medium, color: Colors.text.primary, marginBottom: Spacing.xs }}>
            {progress.uploadedCount} of {progress.total} required documents uploaded
          </Text>

          {progress.missing?.length > 0 && (
            <View style={{ marginBottom: Spacing.sm }}>
              <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginBottom: 4 }}>
                Still needed:
              </Text>
              {progress.missing.map((k) => (
                <Text key={k} style={{ fontSize: Typography.fontSize.sm, color: Colors.text.primary }}>
                  • {DOC_TYPE_LABELS[k] || k}
                </Text>
              ))}
            </View>
          )}

          {awaiting && (
            <View
              style={{
                backgroundColor: `${Colors.status.warning}18`,
                borderRadius: Radius.md,
                padding: Spacing.sm,
                marginBottom: Spacing.sm,
              }}
            >
              <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.status.warning, fontWeight: Typography.fontWeight.medium }}>
                Awaiting admin review
              </Text>
              <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginTop: 4 }}>
                We will notify you when your documents are approved.
              </Text>
            </View>
          )}

          {progress.allUploaded && !submitted && (
            <>
              <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.md, lineHeight: 20 }}>
                All required documents are uploaded. Submit them for admin verification to unlock the full app.
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
                  backgroundColor: busy ? Colors.text.muted : Colors.primaryDark,
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
        </>
      )}
    </View>
  );
}
