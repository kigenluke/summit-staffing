/**
 * Summit Staffing – Booking Detail Screen
 * Shows full booking info, clock in/out (worker), leave review (participant), invoice/payment
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Alert, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useAuthStore } from '../store/authStore.js';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';

const STATUS_COLORS = {
  pending: Colors.status.warning,
  confirmed: Colors.status.success,
  in_progress: Colors.primary,
  completed: Colors.primaryDark,
  cancelled: Colors.status.error,
};

const InfoRow = ({ label, value, icon }) => (
  <View style={{ flexDirection: 'row', marginBottom: Spacing.sm }}>
    <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.muted, width: 120 }}>{icon} {label}</Text>
    <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.primary, flex: 1 }}>{value || '—'}</Text>
  </View>
);

const Section = ({ title, children, style }) => (
  <View style={[{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadows.sm }, style]}>
    <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.md }}>
      {title}
    </Text>
    {children}
  </View>
);

export function BookingDetailScreen({ route, navigation }) {
  const { bookingId } = route.params;
  const { user } = useAuthStore();
  const isWorker = user?.role === 'worker';
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [incidentReported, setIncidentReported] = useState(false);
  const [incidentDetails, setIncidentDetails] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [showReview, setShowReview] = useState(false);

  const loadBooking = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/bookings/${bookingId}`);
      if (data?.ok) {
        const b = data.booking;
        // Backend returns timesheet separately at data.timesheet
        if (data.timesheet) b.timesheet = data.timesheet;
        setBooking(b);
      }
    } catch (e) {}
    setLoading(false);
  }, [bookingId]);

  useEffect(() => { loadBooking(); }, [loadBooking]);

  const handleAction = async (action) => {
    const map = {
      accept: { path: `/api/bookings/${bookingId}/accept`, method: 'put', label: 'Accept' },
      decline: { path: `/api/bookings/${bookingId}/decline`, method: 'put', label: 'Decline' },
      cancel: { path: `/api/bookings/${bookingId}/cancel`, method: 'put', label: 'Cancel' },
      complete: { path: `/api/bookings/${bookingId}/complete`, method: 'put', label: 'Complete' },
    };
    const a = map[action];
    const runAction = async (body) => {
      const { error } = await api[a.method](a.path, body);
      if (error) Alert.alert('Error', error.message);
      else loadBooking();
    };

    if (action === 'decline') {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const reason = window.prompt('Reason for decline (optional):', '') || '';
        await runAction({ reason: reason.trim() || undefined });
        return;
      }
      Alert.alert('Decline booking', 'Select a reason', [
        { text: 'Not available', onPress: () => runAction({ reason: 'Not available at requested time' }) },
        { text: 'Out of service area', onPress: () => runAction({ reason: 'Out of service area' }) },
        { text: 'Rate mismatch', onPress: () => runAction({ reason: 'Rate does not match required service level' }) },
        { text: 'No reason', style: 'destructive', onPress: () => runAction({}) },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }

    Alert.alert('Confirm', `${a.label} this booking?`, [
      { text: 'No', style: 'cancel' },
      { text: 'Yes', onPress: async () => {
        await runAction();
      }},
    ]);
  };

  const handleClockIn = () => {
    Alert.alert('Clock In', 'Clock in to this booking?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clock In', onPress: async () => {
        const { error } = await api.post(`/api/bookings/${bookingId}/clock-in`, { lat: -33.8688, lng: 151.2093 });
        if (error) Alert.alert('Error', error.message);
        else { Alert.alert('Success', 'Clocked in!'); loadBooking(); }
      }},
    ]);
  };

  const handleClockOut = () => {
    Alert.alert('Clock Out', 'Clock out of this booking?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clock Out', onPress: async () => {
        const { error } = await api.post(`/api/bookings/${bookingId}/clock-out`, { lat: -33.8688, lng: 151.2093 });
        if (error) Alert.alert('Error', error.message);
        else { Alert.alert('Success', 'Clocked out!'); loadBooking(); }
      }},
    ]);
  };

  const handleReview = async () => {
    if (incidentReported && incidentDetails.trim().length < 5) {
      Alert.alert('Incident details required', 'Please add at least 5 characters in incident details.');
      return;
    }

    setSubmittingReview(true);
    const { error } = await api.post('/api/reviews', {
      bookingId,
      rating: reviewRating,
      comment: reviewComment.trim() || undefined,
      incidentReported,
      incidentDetails: incidentReported ? incidentDetails.trim() : undefined,
    });
    if (error) Alert.alert('Error', error.message);
    else {
      Alert.alert('Success', 'Review submitted!');
      setShowReview(false);
      setIncidentReported(false);
      setIncidentDetails('');
      setReviewComment('');
      loadBooking();
    }
    setSubmittingReview(false);
  };

  const handleGenerateInvoice = async () => {
    const { data, error } = await api.post(`/api/invoices/generate/${bookingId}`);
    if (error) Alert.alert('Error', error.message);
    else Alert.alert('Success', `Invoice ${data?.invoice?.invoice_number || ''} generated!`);
  };

  if (loading) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>;
  }

  if (!booking) {
    return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
      <Text style={{ color: Colors.text.secondary }}>Booking not found</Text>
    </View>;
  }

  const b = booking;
  const ts = b.timesheet;
  const canMarkComplete = isWorker && b.status === 'in_progress' && !!ts?.clock_out_time;

  const isPendingAcceptance = isWorker && (b.status === 'pending' || b.status === 'confirmed');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}>
      {/* Status Badge */}
      <View style={{ alignItems: 'center', marginBottom: Spacing.lg }}>
        <View style={{ backgroundColor: STATUS_COLORS[b.status] || Colors.text.muted, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.full }}>
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.lg }}>
            {(b.status || '').replace('_', ' ').toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Booking Details */}
      <Section title=" Booking Details">
        <InfoRow icon="" label="Service" value={b.service_type} />
        <InfoRow icon="" label="Date" value={new Date(b.start_time).toLocaleDateString()} />
        <InfoRow icon="" label="Time" value={`${new Date(b.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${new Date(b.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`} />
        <InfoRow
          icon=""
          label={isWorker && b.status === 'pending' ? "Participant's budget" : "Agreed rate"}
          value={b.hourly_rate != null ? `$${Number(b.hourly_rate).toFixed(2)}/hr` : '—'}
        />
        <InfoRow icon="" label="Location" value={b.location_address} />
        <InfoRow icon="" label="Total (est.)" value={b.total_amount ? `$${Number(b.total_amount).toFixed(2)}` : '—'} />
        {!isPendingAcceptance && b.special_instructions && <InfoRow icon="" label="Notes" value={b.special_instructions} />}
        {b.status === 'cancelled' && b.decline_reason && <InfoRow icon="" label="Decline reason" value={b.decline_reason} />}
      </Section>

      {/* Timesheet */}
      {ts && (
        <Section title="⏱ Timesheet">
          <InfoRow icon="" label="Clock In" value={ts.clock_in_time ? new Date(ts.clock_in_time).toLocaleString() : 'Not clocked in'} />
          <InfoRow icon="" label="Clock Out" value={ts.clock_out_time ? new Date(ts.clock_out_time).toLocaleString() : 'Not clocked out'} />
          <InfoRow icon="⏰" label="Hours" value={ts.actual_hours ? `${Number(ts.actual_hours).toFixed(1)} hrs` : '—'} />
          {ts.notes && <InfoRow icon="" label="Notes" value={ts.notes} />}
        </Section>
      )}

      {/* Worker Actions */}
      {isWorker && b.status === 'pending' && (
        <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md }}>
          <Pressable onPress={() => handleAction('accept')} style={({ pressed }) => ({ flex: 1, backgroundColor: Colors.status.success, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center', opacity: pressed ? 0.8 : 1 })}>
            <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}> Accept</Text>
          </Pressable>
          <Pressable onPress={() => handleAction('decline')} style={({ pressed }) => ({ flex: 1, backgroundColor: Colors.status.error, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center', opacity: pressed ? 0.8 : 1 })}>
            <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}> Decline</Text>
          </Pressable>
        </View>
      )}

      {isWorker && b.status === 'confirmed' && (
        <Pressable onPress={handleClockIn} style={({ pressed }) => ({ backgroundColor: Colors.status.success, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center', marginBottom: Spacing.md, opacity: pressed ? 0.8 : 1 })}>
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.lg }}> Clock In</Text>
        </Pressable>
      )}

      {isWorker && b.status === 'in_progress' && (
        <Pressable onPress={handleClockOut} style={({ pressed }) => ({ backgroundColor: Colors.status.error, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center', marginBottom: Spacing.md, opacity: pressed ? 0.8 : 1 })}>
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.lg }}> Clock Out</Text>
        </Pressable>
      )}

      {canMarkComplete && (
        <Pressable onPress={() => handleAction('complete')} style={({ pressed }) => ({ backgroundColor: Colors.primary, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center', marginBottom: Spacing.md, opacity: pressed ? 0.8 : 1 })}>
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}> Mark Complete</Text>
        </Pressable>
      )}

      {(b.status === 'pending' || b.status === 'confirmed') && !isWorker && (
        <Pressable onPress={() => handleAction('cancel')} style={({ pressed }) => ({ backgroundColor: Colors.status.error, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center', marginBottom: Spacing.md, opacity: pressed ? 0.8 : 1 })}>
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>Cancel Booking</Text>
        </Pressable>
      )}

      {/* Generate Invoice (worker, completed) */}
      {isWorker && b.status === 'completed' && (
        <Pressable onPress={handleGenerateInvoice} style={({ pressed }) => ({ backgroundColor: Colors.primaryDark, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center', marginBottom: Spacing.md, opacity: pressed ? 0.8 : 1 })}>
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}> Generate Invoice</Text>
        </Pressable>
      )}

      {/* Leave Review (worker + participant, completed) */}
      {b.status === 'completed' && !showReview && (
        <Pressable onPress={() => setShowReview(true)} style={({ pressed }) => ({ backgroundColor: Colors.status.warning, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center', marginBottom: Spacing.md, opacity: pressed ? 0.8 : 1 })}>
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>⭐ Complete & Leave Review</Text>
        </Pressable>
      )}

      {showReview && (
        <Section title="⭐ Write a Review">
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.sm }}>Rating</Text>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md }}>
            {[1, 2, 3, 4, 5].map(n => (
              <Pressable key={n} onPress={() => setReviewRating(n)}>
                <Text style={{ fontSize: 32 }}>{n <= reviewRating ? '⭐' : ''}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={{ backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, minHeight: 80, textAlignVertical: 'top', color: Colors.text.primary, marginBottom: Spacing.md }}
            placeholder="Write your review..."
            placeholderTextColor={Colors.text.muted}
            value={reviewComment}
            onChangeText={setReviewComment}
            multiline
          />
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.xs }}>
            Any incident during this shift?
          </Text>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm }}>
            <Pressable
              onPress={() => setIncidentReported(false)}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: !incidentReported ? Colors.primary : Colors.surfaceSecondary,
                borderRadius: Radius.md,
                borderWidth: 1,
                borderColor: !incidentReported ? Colors.primary : Colors.border,
                paddingVertical: Spacing.sm,
                alignItems: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: !incidentReported ? Colors.text.white : Colors.text.secondary, fontWeight: Typography.fontWeight.semibold }}>
                No
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setIncidentReported(true)}
              style={({ pressed }) => ({
                flex: 1,
                backgroundColor: incidentReported ? Colors.status.error : Colors.surfaceSecondary,
                borderRadius: Radius.md,
                borderWidth: 1,
                borderColor: incidentReported ? Colors.status.error : Colors.border,
                paddingVertical: Spacing.sm,
                alignItems: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: incidentReported ? Colors.text.white : Colors.text.secondary, fontWeight: Typography.fontWeight.semibold }}>
                Yes
              </Text>
            </Pressable>
          </View>
          {incidentReported && (
            <TextInput
              style={{ backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, minHeight: 80, textAlignVertical: 'top', color: Colors.text.primary, marginBottom: Spacing.md }}
              placeholder="Describe incident / remarks..."
              placeholderTextColor={Colors.text.muted}
              value={incidentDetails}
              onChangeText={setIncidentDetails}
              multiline
            />
          )}
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <Pressable onPress={() => setShowReview(false)} style={({ pressed }) => ({ flex: 1, backgroundColor: Colors.surfaceSecondary, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center', opacity: pressed ? 0.8 : 1 })}>
              <Text style={{ color: Colors.text.secondary }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleReview} disabled={submittingReview} style={({ pressed }) => ({ flex: 2, backgroundColor: Colors.status.warning, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center', opacity: pressed ? 0.8 : 1 })}>
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>{submittingReview ? 'Submitting...' : 'Submit Review'}</Text>
            </Pressable>
          </View>
        </Section>
      )}
    </ScrollView>
  );
}
