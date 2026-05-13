import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View, Alert, Platform, ActivityIndicator } from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { Colors, Radius, Shadows, Spacing, Typography } from '../constants/theme.js';
import { api } from '../services/api.js';
import { stashCoordinatorAndEnterParticipantSession } from '../store/authStore.js';

export function CoordinatorParticipantManageScreen({ route, navigation }) {
  const participant = route.params?.participant || {};
  const name = `${participant.first_name || ''} ${participant.last_name || ''}`.trim() || 'Participant';
  const participantId = participant.id;
  const [opening, setOpening] = useState(false);

  const confirmOpenParticipantAccount = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return Promise.resolve(
        window.confirm(
          'You will use this participant\'s account the same as if they had signed in. You can return to your coordinator account from Profile.',
        ),
      );
    }
    return new Promise((resolve) => {
      Alert.alert(
        'Open participant account',
        'You will use this participant\'s account the same as if they had signed in. Return to your coordinator account from Profile.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Continue', onPress: () => resolve(true) },
        ],
      );
    });
  };

  const openParticipantAccount = async () => {
    if (!participantId || opening) return;
    const ok = await confirmOpenParticipantAccount();
    if (!ok) return;
    setOpening(true);
    try {
      const path = `/api/coordinator/managed-participants/${encodeURIComponent(participantId)}/session-as-participant`;
      const { data, error } = await api.post(path, {});
      if (error) {
        const msg = error.message || 'Could not open participant account';
        if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(msg);
        else Alert.alert('Error', msg);
        return;
      }
      if (!data?.ok || !data?.token || !data?.user) {
        const msg = data?.error || 'Could not open participant account';
        if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(msg);
        else Alert.alert('Error', msg);
        return;
      }
      await stashCoordinatorAndEnterParticipantSession(data.token, data.user);
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'MainTabs', params: { screen: 'Home' } }],
        }),
      );
    } catch (e) {
      const msg = e?.message || 'Could not open participant account';
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(msg);
      else Alert.alert('Error', msg);
    } finally {
      setOpening(false);
    }
  };

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
          Management
        </Text>
        <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, marginBottom: Spacing.md }}>
          Use Profile → "Return to coordinator account" when finished.
        </Text>
        <Pressable
          onPress={openParticipantAccount}
          disabled={!participantId || opening}
          style={({ pressed }) => ({
            backgroundColor: Colors.primary,
            borderRadius: Radius.md,
            paddingVertical: 12,
            alignItems: 'center',
            opacity: pressed ? 0.85 : !participantId || opening ? 0.5 : 1,
          })}
        >
          {opening ? (
            <ActivityIndicator color={Colors.text.white} />
          ) : (
            <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>
              Open participant account
            </Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  );
}
