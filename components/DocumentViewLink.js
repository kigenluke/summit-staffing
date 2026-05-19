import React from 'react';
import { Pressable, Text, Linking, Platform } from 'react-native';
import { Colors, Typography, Radius, Spacing } from '../constants/theme.js';

export function openDocumentUrl(url) {
  const target = String(url || '').trim();
  if (!target) return;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(target, '_blank', 'noopener,noreferrer');
    return;
  }
  Linking.openURL(target).catch(() => {});
}

export function DocumentViewLink({ url, label = 'View document', style }) {
  if (!url) return null;
  return (
    <Pressable
      onPress={() => openDocumentUrl(url)}
      style={({ pressed }) => [
        {
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: `${Colors.primary}14`,
          paddingHorizontal: Spacing.sm,
          paddingVertical: 5,
          borderRadius: Radius.full,
          borderWidth: 1,
          borderColor: `${Colors.primary}40`,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <Text style={{ marginRight: 4 }}>👁</Text>
      <Text
        style={{
          color: Colors.primaryDark,
          fontSize: Typography.fontSize.xs,
          fontWeight: Typography.fontWeight.semibold,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
