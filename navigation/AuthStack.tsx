import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { LoginScreen } from '../screens/auth/LoginScreen.js';
import { RegisterScreen } from '../screens/auth/RegisterScreen.js';
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
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  Verification: { email?: string } | undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export const AuthStack = () => {
  return (
    <Stack.Navigator screenOptions={headerStyle}>
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign in', headerShown: true }} />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Sign up' }} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: 'Reset Password' }} />
      <Stack.Screen name="Verification" component={VerificationScreen} options={{ title: 'Verify Email' }} />
    </Stack.Navigator>
  );
};
