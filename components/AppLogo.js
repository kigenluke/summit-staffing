import React from 'react';
import { Image } from 'react-native';

const summitLogo = require('../assets/summit-logo.png');

export function AppLogo({ width = 220, height = 120, style }) {
  return (
    <Image
      source={summitLogo}
      style={[{ width, height, resizeMode: 'contain' }, style]}
      accessibilityLabel="Summit Staffing"
    />
  );
}
