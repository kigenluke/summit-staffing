import React, { useState } from 'react';
import { View, TextInput, Pressable } from 'react-native';
import { Colors, Spacing, Typography, Radius } from '../constants/theme.js';

const defaultInputStyle = {
  backgroundColor: Colors.surface,
  borderWidth: 1,
  borderColor: Colors.border,
  borderRadius: Radius.md,
  paddingVertical: Spacing.md,
  paddingHorizontal: Spacing.lg,
  fontSize: Typography.fontSize.base,
  color: Colors.text.primary,
};

function EyeIcon({ visible, color = Colors.text.secondary, size = 20 }) {
  const eyeW = size * 0.92;
  const eyeH = size * 0.56;
  const pupil = size * 0.26;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: eyeW,
          height: eyeH,
          borderRadius: eyeH,
          borderWidth: 1.5,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: visible ? 1 : 0.45,
        }}
      >
        {visible ? (
          <View
            style={{
              width: pupil,
              height: pupil,
              borderRadius: pupil / 2,
              backgroundColor: color,
            }}
          />
        ) : null}
      </View>
      {!visible ? (
        <View
          style={{
            position: 'absolute',
            width: eyeW * 1.15,
            height: 1.5,
            backgroundColor: color,
            transform: [{ rotate: '-40deg' }],
          }}
        />
      ) : null}
    </View>
  );
}

/**
 * Password field with show/hide toggle (eye icon).
 */
export function PasswordInput({
  value,
  onChangeText,
  placeholder = '••••••••',
  editable = true,
  style,
  containerStyle,
  placeholderTextColor = Colors.text.muted,
  autoComplete = 'password',
  textContentType = 'password',
  ...rest
}) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={[{ position: 'relative' }, containerStyle]}>
      <TextInput
        style={[defaultInputStyle, { paddingRight: 48, marginBottom: 0 }, style]}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
        editable={editable}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={autoComplete}
        textContentType={textContentType}
        {...rest}
      />
      <Pressable
        onPress={() => setVisible((prev) => !prev)}
        disabled={!editable}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        style={({ pressed }) => ({
          position: 'absolute',
          right: 10,
          top: 0,
          bottom: 0,
          width: 40,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: !editable ? 0.4 : pressed ? 0.65 : 1,
        })}
        hitSlop={8}
      >
        <EyeIcon visible={visible} color={Colors.primary} />
      </Pressable>
    </View>
  );
}
