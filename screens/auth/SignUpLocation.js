/**
 * Summit Staffing – Sign up step: Where are you located?
 */
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { useParticipantSignUp } from '../../context/ParticipantSignUpContext.js';
import { Colors, Spacing, Typography, Radius } from '../../constants/theme.js';

const inputStyle = {
  backgroundColor: Colors.surface,
  borderWidth: 1,
  borderColor: Colors.border,
  borderRadius: Radius.md,
  paddingVertical: Spacing.md,
  paddingHorizontal: Spacing.lg,
  fontSize: Typography.fontSize.base,
  color: Colors.text.primary,
};

export function SignUpLocation({ navigation }) {
  const { location, setLocation } = useParticipantSignUp();
  const [address, setAddress] = useState(location?.address || '');

  const onContinue = () => {
    setLocation({ address: address.trim() || null });
    navigation.navigate('RegisterParticipant');
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.xl }}>
        Where are you located?
      </Text>

      <TextInput
        style={[inputStyle, { marginBottom: Spacing.xl }]}
        placeholder="Search"
        placeholderTextColor={Colors.text.muted}
        value={address}
        onChangeText={setAddress}
        editable={true}
      />

      <Pressable
        onPress={onContinue}
        style={({ pressed }) => ({
          backgroundColor: Colors.primary,
          paddingVertical: Spacing.md,
          borderRadius: Radius.md,
          alignItems: 'center',
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.base }}>
          Continue
        </Text>
      </Pressable>
    </ScrollView>
  );
}
