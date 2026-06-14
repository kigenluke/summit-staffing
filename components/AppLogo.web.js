import React from 'react';
import { Image } from 'react-native';

export function AppLogo({ width = 220, height = 120, style }) {
  return (
    <Image
      source={{ uri: '/summit-logo.png' }}
      style={[{ width, height, resizeMode: 'contain' }, style]}
      accessibilityLabel="Summit Staffing"
    />
  );
}
