/**
 * Styled date field for compliance docs — calendar on web, native modal on mobile.
 */
import React, { useMemo, useRef, useState, createElement } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';
import { formatDateDMY } from '../utils/dateFormat.js';

function toYmd(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromYmd(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function FieldShell({ label, required, helper, error, focused, filled, children, onPress }) {
  const borderColor = error
    ? Colors.status.error
    : focused
      ? Colors.primary
      : filled
        ? `${Colors.primary}55`
        : Colors.border;

  return (
    <View style={{ width: '100%' }}>
      <Text
        style={{
          fontSize: Typography.fontSize.sm,
          fontWeight: Typography.fontWeight.semibold,
          color: error ? Colors.status.error : Colors.text.primary,
          marginBottom: 6,
        }}
      >
        {label}
        {required ? <Text style={{ color: Colors.status.error }}> *</Text> : null}
      </Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${filled ? 'date selected' : 'tap to pick date'}`}
        style={({ pressed, hovered }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          width: '100%',
          backgroundColor: Colors.surface,
          borderWidth: 1.5,
          borderColor,
          borderRadius: Radius.lg,
          paddingVertical: 14,
          paddingHorizontal: Spacing.md,
          opacity: pressed ? 0.92 : 1,
          ...(Platform.OS === 'web' && hovered && !error
            ? { backgroundColor: `${Colors.primary}06`, borderColor: Colors.primary }
            : null),
          ...Shadows.sm,
        })}
      >
        {children}
      </Pressable>
      {error ? (
        <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.status.error, marginTop: 6, fontWeight: Typography.fontWeight.medium }}>
          {error}
        </Text>
      ) : helper ? (
        <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginTop: 6, lineHeight: 16 }}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

function DateValue({ display, placeholder, filled }) {
  return (
    <Text
      style={{
        flex: 1,
        flexShrink: 1,
        fontSize: Typography.fontSize.sm,
        fontWeight: filled ? Typography.fontWeight.semibold : Typography.fontWeight.normal,
        color: filled ? Colors.text.primary : Colors.text.muted,
      }}
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      {display || placeholder}
    </Text>
  );
}

export function ComplianceDateField({
  label,
  value,
  onChange,
  minDate,
  placeholder = 'Select date',
  required = false,
  helper,
  error,
}) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const parsed = useMemo(() => fromYmd(value), [value]);
  const display = parsed ? formatDateDMY(parsed) : '';
  const filled = Boolean(display);

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    setFocused(true);
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch (_) {
        // fall through to click
      }
    }
    el.click?.();
  };

  if (Platform.OS === 'web') {
    return (
      <FieldShell
        label={label}
        required={required}
        helper={helper}
        error={error}
        focused={focused}
        filled={filled}
        onPress={openPicker}
      >
        <Text style={{ fontSize: 18, lineHeight: 22 }}>📅</Text>
        <DateValue display={display} placeholder={placeholder} filled={filled} />
        {createElement('input', {
          ref: inputRef,
          type: 'date',
          value: value || '',
          min: minDate ? toYmd(minDate) : undefined,
          required,
          onChange: (e) => {
            onChange(e?.target?.value || '');
            setFocused(false);
          },
          onBlur: () => setFocused(false),
          onFocus: () => setFocused(true),
          style: {
            position: 'absolute',
            opacity: 0,
            width: 1,
            height: 1,
            pointerEvents: 'none',
          },
          'aria-hidden': true,
          tabIndex: -1,
        })}
      </FieldShell>
    );
  }

  const pickerDate = parsed || minDate || new Date();
  const NativeDatePicker = require('react-native-date-picker').default;

  return (
    <FieldShell
      label={label}
      required={required}
      helper={helper}
      error={error}
      focused={open}
      filled={filled}
      onPress={() => setOpen(true)}
    >
      <Text style={{ fontSize: 18, lineHeight: 22 }}>📅</Text>
      <DateValue display={display} placeholder={placeholder} filled={filled} />
      <NativeDatePicker
        modal
        open={open}
        date={pickerDate}
        mode="date"
        minimumDate={minDate || undefined}
        onConfirm={(selected) => {
          setOpen(false);
          onChange(toYmd(selected));
        }}
        onCancel={() => setOpen(false)}
      />
    </FieldShell>
  );
}

export { toYmd, fromYmd };
