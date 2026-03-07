import React, {useEffect, useMemo, useState} from 'react';
import {Animated, StatusBar, Text, View} from 'react-native';

import {AppNavigator} from './navigation/AppNavigator';
import {ErrorBoundary} from './components/ErrorBoundary';
import {ToastBridge, ToastProvider} from './components/Toast';
import {Colors, Spacing} from './constants/theme';
import * as notificationService from './services/notificationService';

const useNetInfoSafe = () => {
  try {
    const NetInfo = require('@react-native-community/netinfo');
    return NetInfo;
  } catch (e) {
    return null;
  }
};

const OfflineBanner = ({visible}) => {
  const hasAnimated = Boolean(Animated?.timing) && Boolean(Animated?.Value) && Boolean(Animated?.View);
  const y = React.useRef(hasAnimated ? new Animated.Value(-60) : null).current;

  useEffect(() => {
    if (!hasAnimated || !y) return;
    Animated.timing(y, {toValue: visible ? 0 : -60, duration: 220, useNativeDriver: true}).start();
  }, [visible, y, hasAnimated]);

  if (!hasAnimated) {
    if (!visible) return null;
    return (
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          backgroundColor: Colors.error,
          paddingTop: 10,
          paddingBottom: 10,
          paddingHorizontal: Spacing.md,
        }}>
        <Text style={{color: Colors.text.white, fontWeight: '900', textAlign: 'center'}}>No internet connection</Text>
      </View>
    );
  }

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        transform: [{translateY: y}],
        backgroundColor: Colors.error,
        paddingTop: 10,
        paddingBottom: 10,
        paddingHorizontal: Spacing.md,
      }}>
      <Text style={{color: Colors.text.white, fontWeight: '900', textAlign: 'center'}}>No internet connection</Text>
    </Animated.View>
  );
};

export const App = () => {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let netUnsub = null;
    const NetInfo = useNetInfoSafe();
    if (NetInfo?.addEventListener) {
      netUnsub = NetInfo.addEventListener((state) => {
        const isOffline = state?.isConnected === false;
        setOffline(Boolean(isOffline));
      });
    }

    let cleanup = null;
    notificationService
      .initNotifications()
      .then((res) => {
        cleanup = res?.cleanup;
      })
      .catch(() => {});

    return () => {
      try {
        netUnsub?.();
        cleanup?.();
      } catch (e) {
        void e;
      }
    };
  }, []);

  return (
    <ToastProvider>
      <ToastBridge />
      <ErrorBoundary>
        <StatusBar barStyle="dark-content" />
        <View style={{flex: 1, backgroundColor: Colors.background}}>
          <AppNavigator />
          <OfflineBanner visible={offline} />
        </View>
      </ErrorBoundary>
    </ToastProvider>
  );
};
