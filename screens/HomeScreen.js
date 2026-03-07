/**
 * Summit Staffing – main home screen after login (placeholder until full main app exists).
 */

import React from 'react';
import { Text, View, Pressable } from 'react-native';
import { useAuthStore } from '../store/authStore.js';
import { Colors, Spacing, Typography, Radius } from '../constants/theme.js';

export function HomeScreen() {
  const { user, logout } = useAuthStore();

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background, padding: Spacing.lg }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm }}>
          Welcome
        </Text>
        <Text style={{ fontSize: Typography.fontSize.base, color: Colors.text.secondary, marginBottom: Spacing.xl }}>
          {user?.email ?? 'You are logged in.'}
        </Text>
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.muted }}>
          Role: {user?.role ?? '—'}
        </Text>
      </View>
      <Pressable
        onPress={logout}
        style={({ pressed }) => ({
          backgroundColor: Colors.status.error,
          paddingVertical: Spacing.md,
          paddingHorizontal: Spacing.lg,
          borderRadius: Radius.md,
          opacity: pressed ? 0.8 : 1,
          alignItems: 'center',
        })}
      >
        <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.base }}>
          Sign out
        </Text>
      </Pressable>
    </View>
  );
}
