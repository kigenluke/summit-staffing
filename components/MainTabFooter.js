/**
 * Persistent bottom tab bar — visible on MainTabs and all stack screens (BookingDetail, etc.).
 */
import React, { useMemo } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useNavigation, useNavigationState, CommonActions } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore.js';
import { Colors } from '../constants/theme.js';
import { getMainTabItems, resolveActiveMainTab } from '../navigation/mainTabConfig.js';

export const MAIN_TAB_FOOTER_BASE_HEIGHT = 52;

const footerTopShadowStyle = Platform.select({
  web: {
    boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.12)',
  },
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
  },
  android: {
    elevation: 12,
  },
  default: {},
});

export function getMainTabFooterHeight(insets) {
  const bottom = insets?.bottom ?? (Platform.OS === 'web' ? 0 : 0);
  return MAIN_TAB_FOOTER_BASE_HEIGHT + Math.max(bottom, Platform.OS === 'ios' ? 8 : 4);
}

export function MainTabFooter() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const isWorker = user?.role === 'worker';
  const isCoordinator = user?.role === 'coordinator';

  const navState = useNavigationState((state) => state);
  const activeTab = useMemo(
    () => resolveActiveMainTab(navState, { isWorker, isCoordinator }),
    [navState, isWorker, isCoordinator],
  );
  const tabs = useMemo(
    () => getMainTabItems({ isWorker, isCoordinator }),
    [isWorker, isCoordinator],
  );

  const footerHeight = getMainTabFooterHeight(insets);

  const onPressTab = (tabName) => {
    navigation.dispatch(
      CommonActions.navigate({
        name: 'MainTabs',
        params: { screen: tabName },
      }),
    );
  };

  return (
    <View
      style={{
        zIndex: 10,
        backgroundColor: Colors.surface,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        ...footerTopShadowStyle,
      }}
    >
      {Platform.OS === 'android' && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -6,
            left: 0,
            right: 0,
            height: 6,
            backgroundColor: 'rgba(0, 0, 0, 0.06)',
          }}
        />
      )}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'stretch',
          minHeight: footerHeight,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 8 : 4),
        }}
      >
      {tabs.map((tab) => {
        const focused = activeTab === tab.name;
        return (
          <Pressable
            key={tab.name}
            onPress={() => onPressTab(tab.name)}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.75 : 1,
            })}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: focused ? '700' : '500',
                color: focused ? Colors.primary : Colors.text.muted,
                textAlign: 'center',
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
      </View>
    </View>
  );
}
