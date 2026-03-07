/**
 * Summit Staffing – React Native app root
 * Wraps navigation and toast; shows Auth or Main stack based on auth state.
 */

import React from 'react';
import { View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { ToastProvider } from './components/Toast.js';
import { AppNavigator } from './navigation/AppNavigator.js';
import { Colors } from './constants/theme.js';

const navTheme = {
  dark: false,
  colors: {
    primary: Colors.primary,
    background: Colors.background,
    card: Colors.surface,
    text: Colors.text.primary,
    border: Colors.border,
    notification: Colors.status.error,
  },
};

const appWrapperStyle = { flex: 1, backgroundColor: Colors.background };

export default function App() {
  return (
    <View style={appWrapperStyle}>
      <ToastProvider>
        <NavigationContainer theme={navTheme}>
          <AppNavigator />
        </NavigationContainer>
      </ToastProvider>
    </View>
  );
}
