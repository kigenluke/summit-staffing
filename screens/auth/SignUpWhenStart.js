/**
 * Summit Staffing – Sign up step: When would you like to start looking for support?
 */
import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useParticipantSignUp } from '../../context/ParticipantSignUpContext.js';
import { Colors, Spacing, Typography, Radius } from '../../constants/theme.js';

const OPTIONS = [
  { value: 'within_4_weeks', label: "I'm ready to start within the next 4 weeks" },
  { value: 'after_4_weeks', label: "I'm not ready yet - maybe after 4 weeks" },
];

export function SignUpWhenStart({ navigation }) {
  const { whenStartLooking, setWhenStartLooking } = useParticipantSignUp();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.xl }}>
        When would you like to start looking for support?
      </Text>

      {OPTIONS.map((opt) => (
        <Pressable
          key={opt.value}
          onPress={() => setWhenStartLooking(opt.value)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: Spacing.md,
            paddingHorizontal: Spacing.lg,
            borderRadius: Radius.md,
            backgroundColor: Colors.surface,
            borderWidth: 1,
            borderColor: whenStartLooking === opt.value ? Colors.primary : Colors.border,
            marginBottom: Spacing.sm,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <View style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 2,
            borderColor: whenStartLooking === opt.value ? Colors.primary : Colors.border,
            backgroundColor: whenStartLooking === opt.value ? Colors.primary : 'transparent',
            marginRight: Spacing.md,
          }} />
          <Text style={{ flex: 1, fontSize: Typography.fontSize.base, color: Colors.text.primary }}>
            {opt.label}
          </Text>
        </Pressable>
      ))}

      <Pressable
        onPress={() => navigation.navigate('SignUpOver18')}
        disabled={!whenStartLooking}
        style={({ pressed }) => ({
          backgroundColor: whenStartLooking ? Colors.primary : Colors.border,
          paddingVertical: Spacing.md,
          borderRadius: Radius.md,
          alignItems: 'center',
          marginTop: Spacing.xl,
          opacity: pressed && whenStartLooking ? 0.9 : 1,
        })}
      >
        <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.base }}>
          Continue
        </Text>
      </Pressable>
    </ScrollView>
  );
}
