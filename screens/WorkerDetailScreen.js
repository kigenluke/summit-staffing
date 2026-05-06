/**
 * Summit Staffing – Worker Detail Screen
 */
import React, { useState } from 'react';
import { createElement } from 'react';
import { View, Text, ScrollView, Pressable, Alert, TextInput, Platform } from 'react-native';
import { api } from '../services/api.js';
let DateTimePicker = null;
if (Platform.OS !== 'web') {
  try {
    DateTimePicker = require('@react-native-community/datetimepicker').default;
  } catch (_) {
    DateTimePicker = null;
  }
}
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';
import { SERVICE_TYPES, getServiceTypeSuggestions } from '../constants/serviceTypes.js';

const webInputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  backgroundColor: Colors.surfaceSecondary,
  borderRadius: Radius.md,
  borderWidth: 1,
  borderColor: Colors.border,
  paddingVertical: Spacing.sm,
  paddingHorizontal: Spacing.md,
  fontSize: Typography.fontSize.base,
  color: Colors.text.primary,
  marginBottom: Spacing.sm,
};

function WebDateInput({ value, onChange }) {
  return createElement('input', {
    type: 'date',
    value: value || '',
    onChange: (e) => onChange(e.target.value),
    style: webInputStyle,
    min: new Date().toISOString().slice(0, 10),
  });
}

function WebTimeInput({ value, onChange }) {
  return createElement('input', {
    type: 'time',
    value: value || '',
    onChange: (e) => onChange(e.target.value),
    style: webInputStyle,
  });
}

const Section = ({ title, children }) => (
  <View style={{ marginBottom: Spacing.lg }}>
    <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm }}>
      {title}
    </Text>
    {children}
  </View>
);

function toDateOnly(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function mergeDateAndTime(dateOnly, timeDate) {
  const out = new Date(dateOnly);
  out.setHours(timeDate.getHours(), timeDate.getMinutes(), 0, 0);
  return out;
}

export function WorkerDetailScreen({ route, navigation }) {
  const { worker } = route.params;
  const [booking, setBooking] = useState(false);
  const [serviceType, setServiceType] = useState('');
  const [serviceTypeQuery, setServiceTypeQuery] = useState('');
  const [showServiceSuggestions, setShowServiceSuggestions] = useState(false);
  const [bookingDate, setBookingDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toDateOnly(d);
  });
  const [startTimeDate, setStartTimeDate] = useState(() => {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    return d;
  });
  const [endTimeDate, setEndTimeDate] = useState(() => {
    const d = new Date();
    d.setHours(17, 0, 0, 0);
    return d;
  });
  const [instructions, setInstructions] = useState('');
  const [proposedHourlyRate, setProposedHourlyRate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const isWeb = Platform.OS === 'web';
  const tomorrowStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };
  const [webDateText, setWebDateText] = useState(() => tomorrowStr());
  const [webStartTimeText, setWebStartTimeText] = useState('09:00');
  const [webEndTimeText, setWebEndTimeText] = useState('17:00');

  const startDateTime = mergeDateAndTime(bookingDate, startTimeDate);
  const endDateTime = mergeDateAndTime(bookingDate, endTimeDate);

  const getStartEndForSubmit = () => {
    if (isWeb && webDateText && webStartTimeText && webEndTimeText) {
      const [sy, sm, sd] = webDateText.split('-').map(Number);
      const [sh, smin] = webStartTimeText.split(':').map(Number);
      const [eh, emin] = webEndTimeText.split(':').map(Number);
      const s = new Date(sy, sm - 1, sd, sh, smin, 0, 0);
      const e = new Date(sy, sm - 1, sd, eh, emin, 0, 0);
      return { start: s, end: e };
    }
    return { start: startDateTime, end: endDateTime };
  };

  const handleBook = async () => {
    if (!serviceType.trim()) { Alert.alert('Error', 'Please enter a service type'); return; }
    const rate = proposedHourlyRate.trim() ? parseFloat(proposedHourlyRate.replace(/,/g, '')) : NaN;
    if (isNaN(rate) || rate < 0) {
      Alert.alert('Error', 'Please enter your budget (hourly rate in $). You set the rate; the worker can accept or decline.');
      return;
    }
    const { start, end } = getStartEndForSubmit();
    if (end <= start) {
      Alert.alert('Error', 'End time must be after start time');
      return;
    }
    if (isWeb && (!webDateText || !webStartTimeText || !webEndTimeText)) {
      Alert.alert('Error', 'Please enter date and start/end time');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await api.post('/api/bookings', {
        worker_id: worker.id,
        service_type: serviceType.trim(),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        proposed_hourly_rate: rate,
        special_instructions: instructions.trim() || undefined,
      });
      if (error) {
        Alert.alert('Error', error.message || 'Failed to create booking');
      } else {
        Alert.alert('Success', 'Booking request sent!', [
          { text: 'OK', onPress: () => { setBooking(false); navigation.navigate('Bookings'); } },
        ]);
      }
    } catch (e) {
      Alert.alert('Error', 'Something went wrong');
    }
    setSubmitting(false);
  };

  const inputStyle = {
    backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.md, borderWidth: 1,
    borderColor: Colors.border, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    fontSize: Typography.fontSize.base, color: Colors.text.primary, marginBottom: Spacing.sm,
  };

  const serviceSuggestions = getServiceTypeSuggestions(serviceTypeQuery || serviceType);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}>
      {/* Header */}
      <View style={{ alignItems: 'center', marginBottom: Spacing.xl }}>
        <View style={{
          width: 96, height: 96, borderRadius: 48, backgroundColor: Colors.primary,
          alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
        }}>
          <Text style={{ fontSize: 40, color: Colors.text.white }}>{worker.first_name?.[0]?.toUpperCase() || '?'}</Text>
        </View>
        <Text style={{ fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>
          {worker.first_name} {worker.last_name}
        </Text>
        {worker.verification_status === 'verified' && (
          <Text style={{ color: Colors.status.success, marginTop: Spacing.xs }}> Verified Worker</Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm, gap: Spacing.lg }}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.primary }}>
              ${worker.hourly_rate || '—'}
            </Text>
            <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted }}>per hour</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.status.warning }}>
               {Number(worker.rating || 0).toFixed(1)}
            </Text>
            <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted }}>{worker.total_reviews || 0} reviews</Text>
          </View>
        </View>
      </View>

      {/* Bio */}
      {worker.bio && (
        <Section title="About">
          <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, ...Shadows.sm }}>
            <Text style={{ color: Colors.text.secondary, lineHeight: 22 }}>{worker.bio}</Text>
          </View>
        </Section>
      )}

      {/* Contact */}
      <Section title="Contact">
        <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, ...Shadows.sm }}>
          {worker.phone && <Text style={{ color: Colors.text.secondary, marginBottom: 4 }}> {worker.phone}</Text>}
          {worker.address && <Text style={{ color: Colors.text.secondary }}> {worker.address}</Text>}
          {!worker.phone && !worker.address && <Text style={{ color: Colors.text.muted }}>No contact info available</Text>}
        </View>
      </Section>

      {/* Book Button / Form */}
      {!booking ? (
        <Pressable
          onPress={() => setBooking(true)}
          style={({ pressed }) => ({
            backgroundColor: Colors.primary, paddingVertical: Spacing.md, borderRadius: Radius.md,
            alignItems: 'center', opacity: pressed ? 0.8 : 1, marginTop: Spacing.md,
          })}
        >
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.lg }}>
             Book This Worker
          </Text>
        </Pressable>
      ) : (
        <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, ...Shadows.md }}>
          <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, marginBottom: Spacing.md, color: Colors.text.primary }}>
            Create Booking
          </Text>
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: 4 }}>Service Type</Text>
          <TextInput
            style={inputStyle}
            placeholder="e.g. cleaning, personal care..."
            placeholderTextColor={Colors.text.muted}
            value={serviceTypeQuery || serviceType}
            onChangeText={(text) => {
              setServiceTypeQuery(text);
              setShowServiceSuggestions(true);
              if (SERVICE_TYPES.includes(text)) {
                setServiceType(text);
                setServiceTypeQuery('');
                setShowServiceSuggestions(false);
              } else {
                setServiceType(text);
              }
            }}
            onFocus={() => setShowServiceSuggestions(true)}
            onBlur={() => setTimeout(() => setShowServiceSuggestions(false), 200)}
          />
          {showServiceSuggestions && (serviceTypeQuery || !serviceType) && serviceSuggestions.length > 0 && (
            <View style={{ backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.md, marginBottom: Spacing.sm, maxHeight: 180 }}>
              {serviceSuggestions.map((st) => (
                <Pressable
                  key={st}
                  onPress={() => {
                    setServiceType(st);
                    setServiceTypeQuery('');
                    setShowServiceSuggestions(false);
                  }}
                  style={{ padding: Spacing.sm, paddingHorizontal: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border }}
                >
                  <Text style={{ fontSize: Typography.fontSize.sm, color: st === serviceType ? Colors.primary : Colors.text.primary, fontWeight: st === serviceType ? Typography.fontWeight.bold : Typography.fontWeight.normal }}>{st}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: 4 }}>Your budget (hourly rate $)</Text>
          <TextInput
            style={inputStyle}
            placeholder="e.g. 55.00"
            placeholderTextColor={Colors.text.muted}
            value={proposedHourlyRate}
            onChangeText={setProposedHourlyRate}
            keyboardType="decimal-pad"
          />
          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginTop: -4, marginBottom: Spacing.sm }}>
            You set the rate; the worker can accept or decline. NDIS price guide max ~$60.48/hr weekday (reference only).
          </Text>

          {isWeb ? (
            <>
              <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: 4 }}>Date</Text>
              <WebDateInput value={webDateText} onChange={setWebDateText} />
              <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: 4 }}>Start Time</Text>
              <WebTimeInput value={webStartTimeText} onChange={setWebStartTimeText} />
              <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: 4 }}>End Time</Text>
              <WebTimeInput value={webEndTimeText} onChange={setWebEndTimeText} />
            </>
          ) : (
            <>
              <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: 4 }}>Date</Text>
              <Pressable
                onPress={() => setShowDatePicker(true)}
                style={[inputStyle, { justifyContent: 'center' }]}
              >
                <Text style={{ color: Colors.text.primary }}>
                   {bookingDate.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                </Text>
              </Pressable>
              {showDatePicker && DateTimePicker && (
                <DateTimePicker
                  value={bookingDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  minimumDate={toDateOnly(new Date())}
                  onChange={(e, selectedDate) => {
                    setShowDatePicker(false);
                    if (selectedDate) setBookingDate(toDateOnly(selectedDate));
                  }}
                />
              )}

              <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: 4 }}>Start Time</Text>
              <Pressable
                onPress={() => setShowStartTimePicker(true)}
                style={[inputStyle, { justifyContent: 'center' }]}
              >
                <Text style={{ color: Colors.text.primary }}>
                   {startTimeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </Pressable>
              {showStartTimePicker && DateTimePicker && (
                <DateTimePicker
                  value={startTimeDate}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(e, selectedTime) => {
                    setShowStartTimePicker(false);
                    if (selectedTime) setStartTimeDate(selectedTime);
                  }}
                />
              )}

              <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: 4 }}>End Time</Text>
              <Pressable
                onPress={() => setShowEndTimePicker(true)}
                style={[inputStyle, { justifyContent: 'center' }]}
              >
                <Text style={{ color: Colors.text.primary }}>
                   {endTimeDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </Pressable>
              {showEndTimePicker && DateTimePicker && (
                <DateTimePicker
                  value={endTimeDate}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(e, selectedTime) => {
                    setShowEndTimePicker(false);
                    if (selectedTime) setEndTimeDate(selectedTime);
                  }}
                />
              )}
            </>
          )}

          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: 4 }}>Special Instructions (optional)</Text>
          <TextInput style={[inputStyle, { height: 80, textAlignVertical: 'top' }]} placeholder="Any notes for the worker..."
            placeholderTextColor={Colors.text.muted} value={instructions} onChangeText={setInstructions} multiline />

          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md }}>
            <Pressable
              onPress={() => setBooking(false)}
              style={({ pressed }) => ({
                flex: 1, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center',
                backgroundColor: Colors.surfaceSecondary, opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: Colors.text.secondary, fontWeight: Typography.fontWeight.semibold }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleBook}
              disabled={submitting}
              style={({ pressed }) => ({
                flex: 2, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center',
                backgroundColor: submitting ? Colors.text.muted : Colors.primary, opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>
                {submitting ? 'Sending...' : 'Confirm Booking'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* View Reviews */}
      <Pressable
        onPress={() => navigation.navigate('Reviews', { workerId: worker.id })}
        style={({ pressed }) => ({
          backgroundColor: Colors.surface, borderWidth: 2, borderColor: '#F59E0B',
          paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center',
          opacity: pressed ? 0.8 : 1, marginTop: Spacing.md,
        })}
      >
        <Text style={{ color: '#F59E0B', fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.base }}>
           View Reviews ({worker.total_reviews || 0})
        </Text>
      </Pressable>

      {/* Message Button */}
      <Pressable
        onPress={() => navigation.navigate('Messages')}
        style={({ pressed }) => ({
          backgroundColor: Colors.surface, borderWidth: 2, borderColor: Colors.primary,
          paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center',
          opacity: pressed ? 0.8 : 1, marginTop: Spacing.md,
        })}
      >
        <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.base }}>
           Send Message
        </Text>
      </Pressable>
    </ScrollView>
  );
}
