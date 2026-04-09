/**
 * Summit Staffing – Sign up step: Are you over 18?
 */
import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useParticipantSignUp } from '../../context/ParticipantSignUpContext.js';
import { Colors, Spacing, Typography, Radius } from '../../constants/theme.js';

const OPTIONS = [
  { value: true, label: 'Yes, I am 18 years or over' },
  { value: false, label: "No, my account will be managed by a person assisting me (e.g. a friend or family member)" },
];

export function SignUpOver18({ navigation }) {
  const { over18, setOver18 } = useParticipantSignUp();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.md }}>
        Are you over 18?
      </Text>
      <View style={{ backgroundColor: Colors.surfaceSecondary, padding: Spacing.md, borderRadius: Radius.md, marginBottom: Spacing.xl }}>
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary }}>
          To manage a Summit Staffing account for yourself or for a person you are assisting (e.g. a friend or family member), you need to be over 18.
        </Text>
      </View>

      {OPTIONS.map((opt) => (
        <Pressable
          key={String(opt.value)}
          onPress={() => setOver18(opt.value)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: Spacing.md,
            paddingHorizontal: Spacing.lg,
            borderRadius: Radius.md,
            backgroundColor: Colors.surface,
            borderWidth: 1,
            borderColor: over18 === opt.value ? Colors.primary : Colors.border,
            marginBottom: Spacing.sm,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <View style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 2,
            borderColor: over18 === opt.value ? Colors.primary : Colors.border,
            backgroundColor: over18 === opt.value ? Colors.primary : 'transparent',
            marginRight: Spacing.md,
          }} />
          <Text style={{ flex: 1, fontSize: Typography.fontSize.base, color: Colors.text.primary }}>
            {opt.label}
          </Text>
        </Pressable>
      ))}

      <Pressable
        onPress={() => navigation.navigate('SignUpFunding')}
        disabled={over18 === null}
        style={({ pressed }) => ({
          backgroundColor: over18 !== null ? Colors.primary : Colors.border,
          paddingVertical: Spacing.md,
          borderRadius: Radius.md,
          alignItems: 'center',
          marginTop: Spacing.xl,
          opacity: pressed && over18 !== null ? 0.9 : 1,
        })}
      >
        <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.base }}>
          Continue
        </Text>
      </Pressable>
    </ScrollView>
  );
}
