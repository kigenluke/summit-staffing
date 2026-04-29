import React from 'react';
import { View } from 'react-native';

export function NavChevron({ direction = 'left', color = '#fff', size = 22 }) {
  const thickness = Math.max(2, Math.round(size / 9));
  const arm = Math.round(size * 0.45);
  const rotate = direction === 'right' ? '-135deg' : '45deg';
  const marginLeft = direction === 'left' ? Math.round(size * 0.12) : 0;
  const marginRight = direction === 'right' ? Math.round(size * 0.12) : 0;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: arm,
          height: arm,
          borderLeftWidth: thickness,
          borderBottomWidth: thickness,
          borderColor: color,
          transform: [{ rotate }],
          marginLeft,
          marginRight,
        }}
      />
    </View>
  );
}

