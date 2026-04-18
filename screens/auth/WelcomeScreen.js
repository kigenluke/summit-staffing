/**
 * Summit Staffing – Welcome / Landing Screen
 * Full-screen hero image with sign-up and log-in buttons.
 */
import React from 'react';
import { View, Text, Pressable, ImageBackground, StatusBar, useWindowDimensions } from 'react-native';
import { Colors, Spacing, Typography, Radius } from '../../constants/theme.js';

// Import works in both Vite (web → URL string) and Metro (native → asset id)
import welcomeImage from '../../welcome.jpg';

export function WelcomeScreen({ navigation }) {
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 768;
  // Vite gives string URL; Metro gives number. ImageBackground accepts both.
  const source = typeof welcomeImage === 'string' ? { uri: welcomeImage } : welcomeImage;
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ImageBackground
        source={source}
        style={{ flex: 1, width: '100%', height: '100%' }}
        resizeMode={isTablet ? 'contain' : 'cover'}
        imageStyle={{ backgroundColor: '#000' }}
      >
        {/* Dark overlay for readability */}
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' }}>
          {/* Summit Staffing text */}
          <View style={{ position: 'absolute', top: 70, left: 0, right: 0, alignItems: 'center' }}>
            <Text style={{
              fontSize: 34, fontWeight: Typography.fontWeight.bold, color: '#FFFFFF',
              textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6,
              letterSpacing: 1,
            }}>
              Summit Staffing
            </Text>
          </View>

          {/* Bottom buttons */}
          <View style={{
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.xl,
            paddingBottom: Spacing.xxl + 20,
            alignItems: 'center',
          }}>
            <Pressable
              onPress={() => navigation.navigate('SignUpRoleChoice')}
              style={({ pressed }) => ({
                width: '100%', backgroundColor: Colors.primary, paddingVertical: 16,
                borderRadius: Radius.md, alignItems: 'center', marginBottom: Spacing.md,
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
                width: '100%', borderWidth: 2, borderColor: '#FFFFFF',
                paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center',
                backgroundColor: 'rgba(255,255,255,0.15)',
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
