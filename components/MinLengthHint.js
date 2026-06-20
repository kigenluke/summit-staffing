import React from 'react';
import { View, Text } from 'react-native';
import { Colors, Typography, Spacing } from '../constants/theme.js';

/** Shows how many characters are entered vs the minimum required. */
export function MinLengthHint({ value, min, unit = 'characters' }) {
  const len = String(value || '').trim().length;
  const met = len >= min;
  const remaining = Math.max(0, min - len);

  return (
    <Text
      style={{
        marginTop: 4,
        fontSize: Typography.fontSize.xs,
        color: met ? Colors.status.success : Colors.text.muted,
      }}
    >
      {met
        ? `${len} ${unit} — minimum ${min} met`
        : `${len} / ${min} ${unit} (${remaining} more needed)`}
    </Text>
  );
}

/** Checklist above submit when the button is still disabled. */
export function SubmitRequirements({ items }) {
  const pending = items.filter((item) => !item.met);
  if (pending.length === 0) return null;

  return (
    <View
      style={{
        marginBottom: Spacing.md,
        padding: Spacing.md,
        borderRadius: 8,
        backgroundColor: Colors.surfaceSecondary,
        borderWidth: 1,
        borderColor: Colors.borderLight,
        gap: 6,
      }}
    >
      <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.text.secondary }}>
        Before you can send:
      </Text>
      {items.map((item) => (
        <Text
          key={item.label}
          style={{
            fontSize: Typography.fontSize.xs,
            color: item.met ? Colors.status.success : Colors.text.secondary,
          }}
        >
          {item.met ? '✓' : '•'} {item.label}
        </Text>
      ))}
    </View>
  );
}
