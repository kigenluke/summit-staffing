/**
 * Summit Staffing – Sign up: choose Participant (I need support) or Worker (I provide support)
 */
import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Colors, Spacing, Typography, Radius } from '../../constants/theme.js';

export function SignUpRoleChoice({ navigation }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.xs }}>
        Sign up
      </Text>
      <Text style={{ fontSize: Typography.fontSize.base, color: Colors.text.secondary, marginBottom: Spacing.xl }}>
        Choose how you want to use Summit Staffing
      </Text>

      <Pressable
        onPress={() => navigation.navigate('ParticipantSignUp', { screen: 'SignUpWhoNeedsSupport' })}
        style={({ pressed }) => ({
          paddingVertical: Spacing.lg,
          paddingHorizontal: Spacing.lg,
          borderRadius: Radius.md,
          backgroundColor: Colors.surface,
          borderWidth: 1,
          borderColor: Colors.border,
          marginBottom: Spacing.md,
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>
          I need support
        </Text>
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 4 }}>
          Create a participant account to find and book support workers
        </Text>
      </Pressable>

      <Pressable
        onPress={() => navigation.navigate('Register', { role: 'worker' })}
        style={({ pressed }) => ({
          paddingVertical: Spacing.lg,
          paddingHorizontal: Spacing.lg,
          borderRadius: Radius.md,
          backgroundColor: Colors.surface,
          borderWidth: 1,
          borderColor: Colors.border,
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>
          I provide support
        </Text>
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 4 }}>
          Create a worker account to offer your services
        </Text>
      </Pressable>

      <Pressable onPress={() => navigation.navigate('Login')} style={{ marginTop: Spacing.xl, alignItems: 'center' }}>
        <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm }}>
          Already have an account? <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.semibold }}>Sign in</Text>
        </Text>
      </Pressable>
    </ScrollView>
  );
}
