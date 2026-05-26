/**
 * Shown when a coordinator is viewing a managed participant account.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useFocusEffect, CommonActions } from '@react-navigation/native';
import {
  getActiveCoordinatorImpersonationStash,
  restoreCoordinatorFromImpersonationStash,
} from '../store/authStore.js';
import { Colors, Spacing, Typography, Radius } from '../constants/theme.js';

export function CoordinatorReturnBanner({ navigation, participantUserId }) {
  const [visible, setVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!participantUserId) {
        setVisible(false);
        return undefined;
      }
      let cancelled = false;
      (async () => {
        try {
          const stash = await getActiveCoordinatorImpersonationStash(participantUserId);
          if (!cancelled) setVisible(Boolean(stash));
        } catch (_) {
          if (!cancelled) setVisible(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [participantUserId]),
  );

  const returnToCoordinatorAccount = useCallback(async () => {
    const ok = await restoreCoordinatorFromImpersonationStash();
    if (!ok) return;
    setVisible(false);
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'MainTabs', params: { screen: 'Home' } }],
      }),
    );
  }, [navigation]);

  if (!visible) return null;

  return (
    <View
      style={{
        marginBottom: Spacing.md,
        padding: Spacing.md,
        backgroundColor: Colors.surfaceSecondary,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: Colors.primary,
      }}
    >
      <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.xs }}>
        Coordinator view
      </Text>
      <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, marginBottom: Spacing.sm }}>
        You are using this participant&apos;s account. When finished, return to your coordinator login.
      </Text>
      <Pressable
        onPress={returnToCoordinatorAccount}
        style={({ pressed }) => ({
          backgroundColor: Colors.primary,
          borderRadius: Radius.md,
          paddingVertical: Spacing.sm,
          alignItems: 'center',
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>
          Back to coordinator account
        </Text>
      </Pressable>
    </View>
  );
}
