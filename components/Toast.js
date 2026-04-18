/**
 * Summit Staffing – simple toast notifications
 * ToastProvider wraps the app; showToast(message, type) can be called from anywhere (e.g. errorHandler).
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../constants/theme';

let globalShow = null;

export function showToast(message, type = 'info') {
  if (globalShow) {
    globalShow(message, type);
  } else if (__DEV__) {
    // eslint-disable-next-line no-console
    console.warn('Toast:', type, message);
  }
}

const ToastContext = createContext({
  show: () => {},
  dismiss: () => {},
});

export function useToast() {
  const ctx = useContext(ToastContext);
  return { show: ctx.show, dismiss: ctx.dismiss };
}

const typeColors = {
  success: Colors.status.success,
  error: Colors.status.error,
  warning: Colors.status.warning,
  info: Colors.status.info,
};

export function ToastProvider({ children }) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [type, setType] = useState('info');
  const [opacity] = useState(() => new Animated.Value(0));

  const show = useCallback((msg, t = 'info') => {
    setMessage(String(msg));
    setType(t);
    setVisible(true);
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [opacity]);

  const dismiss = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setVisible(false);
    });
  }, [opacity]);

  useEffect(() => {
    globalShow = show;
    return () => {
      globalShow = null;
    };
  }, [show]);

  useEffect(() => {
    if (!visible || !message) return;
    const t = setTimeout(dismiss, 4000);
    return () => clearTimeout(t);
  }, [visible, message, dismiss]);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      {visible && message ? (
        <Animated.View
          style={{
            position: 'absolute',
            left: Spacing.md,
            right: Spacing.md,
            bottom: Spacing.xl,
            backgroundColor: typeColors[type] || Colors.primary,
            borderRadius: Radius.md,
            paddingVertical: Spacing.md,
            paddingHorizontal: Spacing.lg,
            opacity,
            elevation: 4,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 4,
          }}
        >
          <Text
            style={{
              color: Colors.text.white,
              fontSize: Typography.fontSize.base,
              fontWeight: Typography.fontWeight.semibold,
            }}
          >
            {message}
          </Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

/** Optional: mount for native modules that need to trigger toasts. */
export function ToastBridge() {
  return null;
}
