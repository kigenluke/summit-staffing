import React, {useEffect, useMemo, useRef} from 'react';
import {Animated, View} from 'react-native';

import { Colors, Radius, Spacing } from '../constants/theme.js';

const SkeletonBlock = ({width, height, radius}) => {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {toValue: 1, duration: 900, useNativeDriver: true}),
        Animated.timing(shimmer, {toValue: 0, duration: 900, useNativeDriver: true}),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);

  const opacity = useMemo(() => shimmer.interpolate({inputRange: [0, 1], outputRange: [0.55, 0.95]}), [shimmer]);

  return (
    <Animated.View
      style={{
        width,
        height,
        borderRadius: radius ?? Radius.lg,
        backgroundColor: Colors.border,
        opacity,
      }}
    />
  );
};

export const SkeletonLoader = ({type = 'list', count = 3}) => {
  const items = Array.from({length: Math.max(1, Number(count) || 1)});

  if (type === 'profile') {
    return (
      <View style={{padding: Spacing.md, gap: 12}}>
        <View style={{flexDirection: 'row', gap: 12, alignItems: 'center'}}>
          <SkeletonBlock width={72} height={72} radius={36} />
          <View style={{flex: 1, gap: 10}}>
            <SkeletonBlock width={'70%'} height={16} />
            <SkeletonBlock width={'50%'} height={14} />
          </View>
        </View>
        <SkeletonBlock width={'100%'} height={100} />
      </View>
    );
  }

  if (type === 'card') {
    return (
      <View style={{padding: Spacing.md, gap: 12}}>
        {items.map((_, i) => (
          <SkeletonBlock key={i} width={'100%'} height={110} />
        ))}
      </View>
    );
  }

  if (type === 'booking_card') {
    return (
      <View style={{padding: Spacing.md, gap: 12}}>
        {items.map((_, i) => (
          <View key={i} style={{gap: 10}}>
            <SkeletonBlock width={'100%'} height={84} />
          </View>
        ))}
      </View>
    );
  }

  if (type === 'worker_card') {
    return (
      <View style={{padding: Spacing.md, gap: 12}}>
        {items.map((_, i) => (
          <SkeletonBlock key={i} width={'100%'} height={160} />
        ))}
      </View>
    );
  }

  // list
  return (
    <View style={{padding: Spacing.md, gap: 12}}>
      {items.map((_, i) => (
        <View key={i} style={{flexDirection: 'row', gap: 12, alignItems: 'center'}}>
          <SkeletonBlock width={44} height={44} radius={22} />
          <View style={{flex: 1, gap: 10}}>
            <SkeletonBlock width={'80%'} height={14} />
            <SkeletonBlock width={'60%'} height={14} />
          </View>
        </View>
      ))}
    </View>
  );
};
