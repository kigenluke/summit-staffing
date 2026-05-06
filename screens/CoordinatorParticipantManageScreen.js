import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Colors, Radius, Shadows, Spacing, Typography } from '../constants/theme.js';

export function CoordinatorParticipantManageScreen({ route, navigation }) {
  const participant = route.params?.participant || {};
  const name = `${participant.first_name || ''} ${participant.last_name || ''}`.trim() || 'Participant';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: Spacing.lg }}>
      <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, ...Shadows.sm }}>
        <Text style={{ fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>
          {name}
        </Text>
        <Text style={{ color: Colors.text.secondary, marginTop: Spacing.xs }}>{participant.email || 'No email'}</Text>
        <Text style={{ color: Colors.text.secondary, marginTop: Spacing.xs }}>{participant.phone || 'No phone'}</Text>
        <Text style={{ color: Colors.text.secondary, marginTop: Spacing.xs }}>{participant.address || 'No address'}</Text>
      </View>

      <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginTop: Spacing.md, ...Shadows.sm }}>
        <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.semibold, marginBottom: Spacing.sm }}>
          Management Actions
        </Text>
        <Pressable
          onPress={() => navigation.navigate('Bookings')}
          style={({ pressed }) => ({
            backgroundColor: Colors.primary,
            borderRadius: Radius.md,
            paddingVertical: 12,
            alignItems: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>
            Open bookings area
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
