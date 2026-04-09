/**
 * Summit Staffing – Sign up step: Do you have government funding?
 */
import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useParticipantSignUp } from '../../context/ParticipantSignUpContext.js';
import { Colors, Spacing, Typography, Radius } from '../../constants/theme.js';

const OPTIONS = [
  { value: 'ndis', label: 'I have NDIS funding' },
  { value: 'support_at_home', label: 'I have Support at Home funding' },
  { value: 'waiting', label: 'I am waiting for funding' },
  { value: 'private', label: 'I am planning to pay privately' },
  { value: 'other', label: 'Other/Not sure' },
];

export function SignUpFunding({ navigation }) {
  const { fundingType, setFundingType } = useParticipantSignUp();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.xl }}>
        Do you have government funding?
      </Text>

      {OPTIONS.map((opt) => (
        <Pressable
          key={opt.value}
          onPress={() => setFundingType(opt.value)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: Spacing.md,
            paddingHorizontal: Spacing.lg,
            borderRadius: Radius.md,
            backgroundColor: Colors.surface,
            borderWidth: 1,
            borderColor: fundingType === opt.value ? Colors.primary : Colors.border,
            marginBottom: Spacing.sm,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <View style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 2,
            borderColor: fundingType === opt.value ? Colors.primary : Colors.border,
            backgroundColor: fundingType === opt.value ? Colors.primary : 'transparent',
            marginRight: Spacing.md,
          }} />
          <Text style={{ flex: 1, fontSize: Typography.fontSize.base, color: Colors.text.primary }}>
            {opt.label}
          </Text>
        </Pressable>
      ))}

      <Pressable
        onPress={() => navigation.navigate('SignUpLocation')}
        disabled={!fundingType}
        style={({ pressed }) => ({
          backgroundColor: fundingType ? Colors.primary : Colors.border,
          paddingVertical: Spacing.md,
          borderRadius: Radius.md,
          alignItems: 'center',
          marginTop: Spacing.xl,
          opacity: pressed && fundingType ? 0.9 : 1,
        })}
      >
        <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.base }}>
          Continue
        </Text>
      </Pressable>
    </ScrollView>
  );
}
