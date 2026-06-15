import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Colors } from '../constants/theme.js';

/** Standard bell — SVG on web (crisp), emoji on native APK. */
function BellIcon({ color = Colors.text.white, size = 22 }) {
  if (Platform.OS === 'web') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    );
  }

  return (
    <Text
      style={{
        fontSize: size,
        lineHeight: size + 4,
        color,
        textAlign: 'center',
      }}
    >
      🔔
    </Text>
  );
}

export function NotificationBellButton({
  unreadCount = 0,
  onPress,
  size = 44,
  iconColor = Colors.text.white,
  badgeBorderColor = Colors.primary,
}) {
  const showBadge = unreadCount > 0;
  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);
  const iconSize = Math.round(size * 0.5);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={showBadge ? `Notifications, ${badgeLabel} unread` : 'Notifications'}
      hitSlop={6}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 6,
        backgroundColor: pressed ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.18)',
        borderWidth: 1,
        borderColor: pressed ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.32)',
        transform: [{ scale: pressed ? 0.95 : 1 }],
        ...(Platform.OS === 'web'
          ? { cursor: 'pointer', transition: 'background-color 0.15s ease, transform 0.1s ease' }
          : null),
      })}
    >
      <BellIcon color={iconColor} size={iconSize} />
      {showBadge ? (
        <View
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            paddingHorizontal: 4,
            backgroundColor: Colors.status.error,
            borderWidth: 2,
            borderColor: badgeBorderColor,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              color: Colors.text.white,
              fontSize: 10,
              fontWeight: '700',
              lineHeight: 12,
              includeFontPadding: false,
            }}
          >
            {badgeLabel}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
