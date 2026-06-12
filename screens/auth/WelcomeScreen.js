/**
 * Summit Staffing – Welcome / Landing Screen
 * Portrait hero (both subjects centered) on phones; landscape original on wide screens.
 */
import React, { useEffect, useMemo } from 'react';
import { View, Text, Pressable, ImageBackground, StatusBar, useWindowDimensions, Platform } from 'react-native';
import { Colors, Spacing, Typography, Radius } from '../../constants/theme.js';

import welcomeLandscape from '../../welcome.jpg';
import welcomePortrait from '../../welcome-hero.jpg';

export function WelcomeScreen({ navigation }) {
  const { width, height } = useWindowDimensions();
  const isPortraitLayout = height >= width;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      const usp = new URLSearchParams(window.location.search);
      const referToken = usp.get('token');
      const referRole = usp.get('role') || undefined;
      const onReferPath = (window.location.pathname || '').replace(/\/$/, '').endsWith('/refer');
      if (referToken && (onReferPath || referRole)) {
        navigation.replace('ReferInvite', {
          token: referToken.trim(),
          role: referRole,
        });
        return;
      }
      const token = usp.get('coordinatorInvite');
      if (!token) return;
      const em = usp.get('email') || undefined;
      navigation.replace('Register', {
        role: 'coordinator',
        coordinatorInviteToken: token.trim(),
        email: em,
      });
    } catch (_) {}
  }, [navigation]);

  const source = useMemo(() => {
    const asset = isPortraitLayout ? welcomePortrait : welcomeLandscape;
    return typeof asset === 'string' ? { uri: asset } : asset;
  }, [isPortraitLayout]);

  const imageStyle =
    Platform.OS === 'web'
      ? {
          width: '100%',
          height: '100%',
          minHeight: '100vh',
          objectFit: 'cover',
          objectPosition: 'center center',
        }
      : { width, height };

  return (
    <View style={{ flex: 1, width: '100%', height: '100%', backgroundColor: '#000' }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ImageBackground
        source={source}
        style={{ flex: 1, width: '100%', height: '100%' }}
        resizeMode="cover"
        imageStyle={imageStyle}
      >
        <View style={{ flex: 1, width: '100%', backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
          <View style={{ position: 'absolute', top: 56, left: 0, right: 0, alignItems: 'center', paddingHorizontal: Spacing.md }}>
            <Text
              style={{
                fontSize: 32,
                fontWeight: Typography.fontWeight.bold,
                color: '#FFFFFF',
                textShadowColor: 'rgba(0,0,0,0.75)',
                textShadowOffset: { width: 0, height: 2 },
                textShadowRadius: 8,
                letterSpacing: 1,
                textAlign: 'center',
              }}
            >
              Summit Staffing
            </Text>
            <Text
              style={{
                marginTop: Spacing.sm,
                fontSize: Typography.fontSize.sm,
                fontWeight: Typography.fontWeight.semibold,
                color: 'rgba(255,255,255,0.95)',
                textShadowColor: 'rgba(0,0,0,0.65)',
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 6,
                textAlign: 'center',
              }}
            >
              Trusted support, Australia-wide
            </Text>
          </View>

          <View
            style={{
              paddingHorizontal: Spacing.lg,
              paddingTop: Spacing.md,
              paddingBottom: Spacing.xxl + 16,
              alignItems: 'center',
            }}
          >
            <Pressable
              onPress={() => navigation.navigate('SignUpRoleChoice')}
              style={({ pressed }) => ({
                width: '100%',
                maxWidth: 400,
                backgroundColor: Colors.primary,
                paddingVertical: 16,
                borderRadius: Radius.md,
                alignItems: 'center',
                marginBottom: Spacing.md,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: '#FFFFFF', fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold }}>
                Create a new account
              </Text>
            </Pressable>

            <Pressable
              onPress={() => navigation.navigate('Login')}
              style={({ pressed }) => ({
                width: '100%',
                maxWidth: 400,
                borderWidth: 2,
                borderColor: '#FFFFFF',
                paddingVertical: 14,
                borderRadius: Radius.md,
                alignItems: 'center',
                backgroundColor: 'rgba(255,255,255,0.12)',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: '#FFFFFF', fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.bold }}>
                Log In
              </Text>
            </Pressable>
          </View>
        </View>
      </ImageBackground>
    </View>
  );
}
