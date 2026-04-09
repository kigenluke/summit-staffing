/**
 * Summit Staffing – Participant sign-up flow (onboarding steps + register)
 */
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Pressable, Text } from 'react-native';
import { ParticipantSignUpProvider } from '../context/ParticipantSignUpContext.js';
import { SignUpWhoNeedsSupport } from '../screens/auth/SignUpWhoNeedsSupport.js';
import { SignUpWhenStart } from '../screens/auth/SignUpWhenStart.js';
import { SignUpOver18 } from '../screens/auth/SignUpOver18.js';
import { SignUpFunding } from '../screens/auth/SignUpFunding.js';
import { SignUpLocation } from '../screens/auth/SignUpLocation.js';
import { RegisterParticipantScreen } from '../screens/auth/RegisterParticipantScreen.js';

const headerStyle = {
  headerStyle: { backgroundColor: '#06B6D4' },
  headerTintColor: '#FFFFFF',
  headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: '#F8FAFC' },
};

export type ParticipantSignUpParamList = {
  SignUpWhoNeedsSupport: undefined;
  SignUpWhenStart: undefined;
  SignUpOver18: undefined;
  SignUpFunding: undefined;
  SignUpLocation: undefined;
  RegisterParticipant: undefined;
};

const Stack = createNativeStackNavigator<ParticipantSignUpParamList>();

function ParticipantSignUpNavigator() {
  return (
    <Stack.Navigator
      screenOptions={({ navigation }) => ({
        ...headerStyle,
        headerBackTitleVisible: false,
        headerLeft: ({ canGoBack, tintColor }) => canGoBack ? (
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => ({ paddingRight: 12, opacity: pressed ? 0.7 : 1 })}
            hitSlop={8}
          >
            <Text style={{ color: tintColor || '#FFFFFF', fontSize: 24, fontWeight: '700', lineHeight: 24 }}>
              ←
            </Text>
          </Pressable>
        ) : null,
      })}
      initialRouteName="SignUpWhoNeedsSupport"
    >
      <Stack.Screen name="SignUpWhoNeedsSupport" component={SignUpWhoNeedsSupport} options={{ title: 'Sign up' }} />
      <Stack.Screen name="SignUpWhenStart" component={SignUpWhenStart} options={{ title: 'Sign up' }} />
      <Stack.Screen name="SignUpOver18" component={SignUpOver18} options={{ title: 'Sign up' }} />
      <Stack.Screen name="SignUpFunding" component={SignUpFunding} options={{ title: 'Sign up' }} />
      <Stack.Screen name="SignUpLocation" component={SignUpLocation} options={{ title: 'Sign up' }} />
      <Stack.Screen name="RegisterParticipant" component={RegisterParticipantScreen} options={{ title: 'Sign up' }} />
    </Stack.Navigator>
  );
}

export function ParticipantSignUpStack() {
  return (
    <ParticipantSignUpProvider>
      <ParticipantSignUpNavigator />
    </ParticipantSignUpProvider>
  );
}
