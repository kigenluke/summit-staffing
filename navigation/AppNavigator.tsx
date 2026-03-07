/**
 * Summit Staffing – root navigator: Auth stack when logged out, Main stack when logged in.
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore.js';
import { AuthStack } from './AuthStack';
import { HomeScreen } from '../screens/HomeScreen.js';

const Stack = createNativeStackNavigator();

export function AppNavigator() {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <AuthStack />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Summit Staffing' }} />
    </Stack.Navigator>
  );
}
