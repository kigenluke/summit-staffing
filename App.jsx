/**
 * Summit Staffing – React Native app root
 * Wraps navigation and toast; shows Auth or Main stack based on auth state.
 */

import React, { useEffect } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { ToastProvider } from './components/Toast.js';
import { AppNavigator } from './navigation/AppNavigator';
import { Colors } from './constants/theme.js';
import { rehydrateAuth } from './store/authStore.js';

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

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <ScrollView style={{ flex: 1, backgroundColor: '#FFF', padding: 30, paddingTop: 80 }}>
          <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#EF4444', marginBottom: 16 }}>
            App Error
          </Text>
          <Text style={{ fontSize: 14, color: '#333', fontFamily: 'monospace' }}>
            {String(this.state.error?.message || this.state.error)}
          </Text>
          <Text style={{ fontSize: 12, color: '#666', marginTop: 12, fontFamily: 'monospace' }}>
            {String(this.state.error?.stack || '')}
          </Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  useEffect(() => {
    rehydrateAuth();
  }, []);
  return (
    <ErrorBoundary>
      <View style={appWrapperStyle}>
        <ToastProvider>
          <NavigationContainer theme={navTheme}>
            <AppNavigator />
          </NavigationContainer>
        </ToastProvider>
      </View>
    </ErrorBoundary>
  );
}
