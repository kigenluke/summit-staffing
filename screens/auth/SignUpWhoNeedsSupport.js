/**
 * Summit Staffing – Sign up step: Who needs support?
 */
import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useParticipantSignUp } from '../../context/ParticipantSignUpContext.js';
import { Colors, Spacing, Typography, Radius } from '../../constants/theme.js';

const OPTIONS = [
  { value: 'me', label: 'Me' },
  { value: 'assisting', label: "A person I'm assisting (e.g. a friend or family member)" },
  { value: 'coordinator', label: 'My client (coordinator account)' },
];

export function SignUpWhoNeedsSupport({ navigation }) {
  const { whoNeedsSupport, setWhoNeedsSupport } = useParticipantSignUp();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ fontSize: Typography.fontSize.base, color: Colors.text.secondary, marginBottom: Spacing.md }}>
        We can help you create an account in a few easy steps.
      </Text>
      <Text style={{ fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.xl }}>
        Who needs support?
      </Text>

      {OPTIONS.map((opt) => (
        <Pressable
          key={opt.value}
          onPress={() => setWhoNeedsSupport(opt.value)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: Spacing.md,
            paddingHorizontal: Spacing.lg,
            borderRadius: Radius.md,
            backgroundColor: Colors.surface,
            borderWidth: 1,
            borderColor: whoNeedsSupport === opt.value ? Colors.primary : Colors.border,
            marginBottom: Spacing.sm,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <View style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 2,
            borderColor: whoNeedsSupport === opt.value ? Colors.primary : Colors.border,
            backgroundColor: whoNeedsSupport === opt.value ? Colors.primary : 'transparent',
            marginRight: Spacing.md,
          }} />
          <Text style={{ flex: 1, fontSize: Typography.fontSize.base, color: Colors.text.primary }}>
            {opt.label}
          </Text>
        </Pressable>
      ))}

      <Pressable
        onPress={() => navigation.navigate('SignUpWhenStart')}
        disabled={!whoNeedsSupport}
        style={({ pressed }) => ({
          backgroundColor: whoNeedsSupport ? Colors.primary : Colors.border,
          paddingVertical: Spacing.md,
          borderRadius: Radius.md,
          alignItems: 'center',
          marginTop: Spacing.xl,
          opacity: pressed && whoNeedsSupport ? 0.9 : 1,
        })}
      >
        <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.base }}>
          Continue
        </Text>
      </Pressable>
    </ScrollView>
  );
}
