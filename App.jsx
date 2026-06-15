/**
 * Summit Staffing – React Native app root
 * Wraps navigation and toast; shows Auth or Main stack based on auth state.
 */

import React, { useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Platform, Linking } from 'react-native';
import { NavigationContainer, createNavigationContainerRef, CommonActions } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from './components/Toast.js';
import RootWithOptionalStripe from './components/RootWithOptionalStripe';
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

/** Web + APK: open reset-password / verify-email from email links. */
export const navigationRef = createNavigationContainerRef();

function authRouteFromUrl(url) {
  try {
    const u = new URL(url);
    const token = String(u.searchParams.get('token') || '').trim();
    if (!token) return null;
    const pathPart = (u.pathname || '').replace(/^\//, '').split('/')[0] || '';
    const hostPart = String(u.hostname || '').split('/')[0] || '';
    const route = pathPart || hostPart;
    if (route === 'reset-password') return { screen: 'ResetPassword', token };
    if (route === 'verify-email') return { screen: 'Verification', token };
  } catch (_) {}
  return null;
}

function navigateAuthDeepLink(url) {
  if (!url || !navigationRef.isReady()) return;
  const hit = authRouteFromUrl(url);
  if (!hit) return;
  navigationRef.dispatch(CommonActions.navigate({ name: hit.screen, params: { token: hit.token } }));
}

function consumeWebAuthDeepLink() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  navigateAuthDeepLink(window.location.href);
}

function consumeNativeAuthDeepLink() {
  if (Platform.OS === 'web') return;
  Linking.getInitialURL()
    .then((url) => navigateAuthDeepLink(url))
    .catch(() => {});
}

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

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const sub = Linking.addEventListener('url', ({ url }) => navigateAuthDeepLink(url));
    return () => sub.remove();
  }, []);

  const onNavReady = useCallback(() => {
    consumeWebAuthDeepLink();
    consumeNativeAuthDeepLink();
  }, []);

  return (
    <ErrorBoundary>
      <View style={appWrapperStyle}>
        <ToastProvider>
          <SafeAreaProvider>
            <RootWithOptionalStripe>
              <NavigationContainer ref={navigationRef} theme={navTheme} onReady={onNavReady}>
                <AppNavigator />
              </NavigationContainer>
            </RootWithOptionalStripe>
          </SafeAreaProvider>
        </ToastProvider>
      </View>
    </ErrorBoundary>
  );
}
