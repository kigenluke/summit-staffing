import React, {useEffect, useMemo, useRef} from 'react';
import {ActivityIndicator, Animated, SafeAreaView, Text} from 'react-native';

import { Colors, Spacing, Typography } from '../constants/theme.js';
import { AppLogo } from './AppLogo.js';

export const LoadingScreen = ({message, transparent}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {toValue: 1, duration: 180, useNativeDriver: true}).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {toValue: 1, duration: 700, useNativeDriver: true}),
        Animated.timing(pulse, {toValue: 0, duration: 700, useNativeDriver: true}),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, pulse]);

  const scale = useMemo(() => pulse.interpolate({inputRange: [0, 1], outputRange: [1, 1.05]}), [pulse]);

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: transparent ? 'rgba(0,0,0,0.25)' : Colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        padding: Spacing.md,
      }}>
      <Animated.View style={{opacity, alignItems: 'center', justifyContent: 'center', gap: 12}}>
        <Animated.View style={{transform: [{scale}]}}>
          <AppLogo width={120} height={64} />
        </Animated.View>

        <ActivityIndicator size="large" color={Colors.primary} />

        {message ? (
          <Text style={{color: Colors.text.secondary, textAlign: 'center', fontSize: Typography.fontSize.base, fontWeight: '700'}}>
            {message}
          </Text>
        ) : null}
      </Animated.View>
    </SafeAreaView>
  );
};
