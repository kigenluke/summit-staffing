/**
 * Date field for compliance docs — calendar on web, native modal on mobile.
 */
import React, { useMemo, useState, createElement } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Colors, Spacing, Typography, Radius } from '../constants/theme.js';
import { formatDateDMY } from '../utils/dateFormat.js';

const webDateStyle = {
  width: '100%',
  boxSizing: 'border-box',
  backgroundColor: Colors.surfaceSecondary,
  borderWidth: 1,
  borderColor: Colors.border,
  borderRadius: Radius.md,
  paddingVertical: 10,
  paddingHorizontal: 12,
  fontSize: Typography.fontSize.sm,
  color: Colors.text.primary,
  cursor: 'pointer',
};

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

export function ComplianceDateField({ label, value, onChange, minDate, placeholder = 'Select date' }) {
  const [open, setOpen] = useState(false);
  const parsed = useMemo(() => fromYmd(value), [value]);
  const display = parsed ? formatDateDMY(parsed) : '';

  if (Platform.OS === 'web') {
    return (
      <View style={{ width: '100%' }}>
        <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginBottom: 4 }}>{label}</Text>
        {createElement('input', {
          type: 'date',
          value: value || '',
          min: minDate ? toYmd(minDate) : undefined,
          onChange: (e) => onChange(e?.target?.value || ''),
          style: webDateStyle,
        })}
      </View>
    );
  }

  const pickerDate = parsed || new Date();
  const NativeDatePicker = Platform.OS !== 'web' ? require('react-native-date-picker').default : null;

  return (
    <View style={{ width: '100%' }}>
      <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginBottom: 4 }}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          backgroundColor: Colors.surfaceSecondary,
          borderWidth: 1,
          borderColor: Colors.border,
          borderRadius: Radius.md,
          paddingVertical: 12,
          paddingHorizontal: Spacing.sm,
          opacity: pressed ? 0.9 : 1,
        })}
      >
        <Text style={{ color: display ? Colors.text.primary : Colors.text.muted, fontSize: Typography.fontSize.sm }}>
          {display || placeholder}
        </Text>
      </Pressable>
      {value ? (
        <Pressable onPress={() => onChange('')} style={{ marginTop: 4 }}>
          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.status.error, fontWeight: Typography.fontWeight.semibold }}>Clear</Text>
        </Pressable>
      ) : null}
      {NativeDatePicker ? (
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
      ) : null}
    </View>
  );
}

export { toYmd, fromYmd };
