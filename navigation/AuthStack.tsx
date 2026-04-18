import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Pressable, Text } from 'react-native';

import { WelcomeScreen } from '../screens/auth/WelcomeScreen.js';
import { LoginScreen } from '../screens/auth/LoginScreen.js';
import { SignUpRoleChoice } from '../screens/auth/SignUpRoleChoice.js';
import { RegisterScreen } from '../screens/auth/RegisterScreen.js';
import { ParticipantSignUpStack } from './ParticipantSignUpStack';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen.js';
import { VerificationScreen } from '../screens/auth/VerificationScreen.js';

const headerStyle = {
  headerStyle: { backgroundColor: '#06B6D4' },
  headerTintColor: '#FFFFFF',
  headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: '#F8FAFC' },
};

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  SignUpRoleChoice: undefined;
  Register: { role?: 'worker' | 'participant' } | undefined;
  ParticipantSignUp: undefined;
  ForgotPassword: undefined;
  Verification: { email?: string } | undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export const AuthStack = () => {
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
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign in', headerShown: true }} />
      <Stack.Screen name="SignUpRoleChoice" component={SignUpRoleChoice} options={{ title: 'Sign up' }} />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Sign up' }} />
      <Stack.Screen name="ParticipantSignUp" component={ParticipantSignUpStack} options={{ headerShown: false }} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Reset Password' }} />
      <Stack.Screen name="Verification" component={VerificationScreen} options={{ title: 'Verify Email' }} />
    </Stack.Navigator>
  );
};
