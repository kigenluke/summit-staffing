import React from 'react';
import { Pressable, Text, Linking, Platform } from 'react-native';
import { Colors, Typography } from '../constants/theme.js';

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
    <Pressable onPress={() => openDocumentUrl(url)} style={style}>
      <Text
        style={{
          color: Colors.primary,
          fontSize: Typography.fontSize.xs,
          fontWeight: Typography.fontWeight.semibold,
          textDecorationLine: 'underline',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
