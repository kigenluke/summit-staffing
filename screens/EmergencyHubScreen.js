/**
 * Emergency hub — quick access from main tab bar (000, crisis lines, help & incident).
 */
import React from 'react';
import { View, Text, ScrollView, Pressable, Linking } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';
import { useAuthStore } from '../store/authStore.js';

const btnPrimary = (pressed) => ({
  backgroundColor: Colors.status.error,
  borderRadius: Radius.md,
  paddingVertical: Spacing.md,
  paddingHorizontal: Spacing.lg,
  alignItems: 'center',
  marginBottom: Spacing.sm,
  opacity: pressed ? 0.88 : 1,
});

const btnSecondary = (pressed) => ({
  backgroundColor: Colors.surface,
  borderWidth: 2,
  borderColor: Colors.primary,
  borderRadius: Radius.md,
  paddingVertical: Spacing.md,
  paddingHorizontal: Spacing.lg,
  alignItems: 'center',
  marginBottom: Spacing.sm,
  opacity: pressed ? 0.88 : 1,
});

export function EmergencyHubScreen({ navigation }) {
  const { user } = useAuthStore();
  const canReportIncident = user?.role === 'participant' || user?.role === 'worker';

  const openTel = (digits) => () => {
    Linking.openURL(`tel:${digits.replace(/\s/g, '')}`);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
    >
      <Text style={{ fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.xs }}>
        Emergency & crisis
      </Text>
      <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.lg }}>
        If someone is seriously ill or injured, or life or property is threatened, call Triple Zero (000) immediately.
      </Text>

      <Pressable onPress={openTel('000')} style={({ pressed }) => btnPrimary(pressed)}>
        <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.lg }}>
          Call 000 — Police, Fire, Ambulance
        </Text>
      </Pressable>

      <Pressable onPress={openTel('131114')} style={({ pressed }) => btnSecondary(pressed)}>
        <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.base }}>
          Lifeline — 13 11 14
        </Text>
      </Pressable>

      <View style={{ marginTop: Spacing.md, backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, ...Shadows.sm }}>
        <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary, marginBottom: Spacing.sm }}>
          More in the app
        </Text>
        <Pressable
          onPress={() => navigation.navigate('Help')}
          style={({ pressed }) => ({
            paddingVertical: Spacing.sm,
            borderBottomWidth: 1,
            borderBottomColor: Colors.border,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.medium }}>Help & Support — emergency numbers</Text>
        </Pressable>
        {canReportIncident ? (
          <Pressable
            onPress={() => navigation.navigate('AddIncident')}
            style={({ pressed }) => ({
              paddingVertical: Spacing.sm,
              marginTop: Spacing.xs,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.medium }}>Report an incident</Text>
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}
