import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Colors, Spacing, Typography, Radius } from '../constants/theme.js';

export function LoadErrorBanner({ message, onRetry, retrying = false }) {
  if (!message) return null;
  return (
    <View style={{
      backgroundColor: '#FEF2F2',
      borderWidth: 1,
      borderColor: '#FECACA',
      borderRadius: Radius.md,
      padding: Spacing.md,
      marginBottom: Spacing.md,
      gap: Spacing.sm,
    }}>
      <Text style={{ color: '#B91C1C', fontSize: Typography.fontSize.sm, lineHeight: 20 }}>
        {message}
      </Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          disabled={retrying}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            backgroundColor: Colors.primary,
            paddingVertical: 8,
            paddingHorizontal: Spacing.md,
            borderRadius: Radius.md,
            opacity: pressed || retrying ? 0.85 : 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          })}
        >
          {retrying ? <ActivityIndicator color={Colors.text.white} size="small" /> : null}
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>
            {retrying ? 'Retrying…' : 'Retry'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
