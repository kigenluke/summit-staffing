/**
 * Summit Staffing – Bookings Screen
 */
import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, ActivityIndicator, Alert, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../store/authStore.js';
import { cachedApiGet, invalidateCachedGet } from '../services/cachedApi.js';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';
import { formatDateDMY, formatTime12h } from '../utils/dateFormat.js';
import { useGuardedNavigation } from '../hooks/useGuardedNavigation.js';
import {
  getBookingDisplayStatus,
  isBookingPastEnd,
  navigateToBookingOrShift,
  STATUS_TONE_COLORS,
} from '../utils/bookingDisplayStatus.js';
import { VerificationBanner } from '../components/VerificationBanner.js';
import { LoadErrorBanner } from '../components/LoadErrorBanner.js';

const TABS = ['all', 'pending', 'confirmed', 'in_progress'];

export function BookingsScreen() {
  const navigation = useGuardedNavigation();
  const { user } = useAuthStore();
  const [allBookings, setAllBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const isWorker = user?.role === 'worker';
  const isParticipant = user?.role === 'participant';

  const loadBookings = useCallback(async (force = false) => {
    setLoadError(null);
    try {
      const { data, error } = await cachedApiGet('/api/bookings?limit=100', 30000, { force });
      if (error) {
        setLoadError(error.message || 'Could not load bookings. Check your connection and try again.');
        setLoading(false);
        return;
      }
      if (data?.ok && data?.bookings) {
        setAllBookings(data.bookings);
      }
    } catch (e) {
      setLoadError(e?.message || 'Could not load bookings.');
    }
    setLoading(false);
  }, []);

  const bookings = useMemo(() => {
    if (activeTab === 'all') return allBookings;
    if (activeTab === 'pending') {
      return allBookings.filter(
        (b) => b.status === 'pending' || (b.is_open_shift && b.status === 'open')
      );
    }
    return allBookings.filter((b) => b.status === activeTab);
  }, [allBookings, activeTab]);

  useFocusEffect(
    useCallback(() => {
      loadBookings(false);
    }, [loadBookings])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadBookings(true);
    setRefreshing(false);
  }, [loadBookings]);

  const deleteOldShift = useCallback(async (target) => {
    if (deleteBusy) return;
    const id = typeof target === 'object' ? target?.id : target;
    const isOpenShift = typeof target === 'object' && Boolean(target?.is_open_shift);
    if (!id) return;

    setDeleteBusy(true);
    try {
      const { error } = isOpenShift
        ? await api.put(`/api/shifts/${id}/cancel`, null, { retries: 1 })
        : await api.put(`/api/bookings/${id}/cancel`, null, { retries: 1 });

      if (error) {
        Alert.alert('Error', error.message || 'Failed to delete old shift');
        return;
      }
      Alert.alert('Deleted', 'Old shift deleted successfully.');
      invalidateCachedGet('/api/bookings');
      await loadBookings(true);
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteBusy, loadBookings]);

  const openDeleteConfirm = useCallback((target) => {
    setDeleteConfirmTarget(typeof target === 'object' ? target : { id: target, is_open_shift: false });
  }, []);

  const closeDeleteConfirm = useCallback(() => {
    setDeleteConfirmTarget(null);
  }, []);

  const renderBooking = ({ item: b }) => {
    const isOpenShift = Boolean(b.is_open_shift);
    const isPastEnd = isBookingPastEnd(b);
    const display = getBookingDisplayStatus(b);
    const badgeColor = STATUS_TONE_COLORS[display.tone] || Colors.text.muted;
    const isNoShow = b.status === 'cancelled' && String(b.decline_reason || '').toLowerCase().includes('no-show');
    const isPastPendingOrConfirmed = !isOpenShift
      && (b.status === 'pending' || b.status === 'confirmed')
      && isPastEnd;
    const isExpiredConfirmed = !isOpenShift && b.status === 'confirmed' && isPastEnd && !b.timesheet?.clock_in_time;
    const isExpiredOpenShift = isOpenShift && isPastEnd;

    const displayTitle = isOpenShift ? (b.title || b.service_type) : b.service_type;

    return (
      <Pressable
        onPress={() => navigateToBookingOrShift(navigation, b)}
        style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.sm, ...Shadows.md }}
      >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>
            {displayTitle}
          </Text>
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 4 }}>
            {formatDateDMY(b.start_time)} • {formatTime12h(b.start_time)}
          </Text>
          {isOpenShift && isParticipant && !isPastEnd && (
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.status.warning, marginTop: 4, fontWeight: Typography.fontWeight.medium }}>
              {b.application_count || 0} applicant(s) — awaiting worker
            </Text>
          )}
          {isExpiredOpenShift && (
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.muted, marginTop: 4, fontWeight: Typography.fontWeight.medium }}>
              No worker assigned — shift time has passed
            </Text>
          )}
          {isWorker && !isOpenShift && (b.status === 'confirmed' || b.status === 'in_progress') && (b.participant_first_name || b.participant_last_name) ? (
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.primary, marginTop: 4, fontWeight: Typography.fontWeight.medium }}>
              Client: {[b.participant_first_name, b.participant_last_name].filter(Boolean).join(' ')}
            </Text>
          ) : null}
          {isExpiredConfirmed && (
            <Text style={{ fontSize: Typography.fontSize.sm, color: '#92400E', marginTop: 4, fontWeight: Typography.fontWeight.medium }}>
              Shift expired — clock-in no longer available
            </Text>
          )}
          {isNoShow && (
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.status.error, marginTop: 4, fontWeight: Typography.fontWeight.medium }}>
              No-show — worker did not clock in
            </Text>
          )}
        </View>
        <View style={{
          backgroundColor: badgeColor,
          paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full,
        }}>
          <Text style={{ color: Colors.text.white, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold }}>
            {display.label.toUpperCase()}
          </Text>
        </View>
      </View>

      {(isPastPendingOrConfirmed || isExpiredOpenShift) && (
          <Pressable
            onPress={(e) => {
              if (e?.stopPropagation) e.stopPropagation();
              openDeleteConfirm({ id: b.id, is_open_shift: isOpenShift });
            }}
            style={({ pressed }) => ({
              marginTop: Spacing.xs,
              backgroundColor: Colors.status.error,
              borderRadius: Radius.md,
              paddingVertical: 6,
              paddingHorizontal: 10,
              minHeight: 28,
              alignSelf: 'flex-start',
              minWidth: 120,
              alignItems: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: Colors.text.white, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold }}>
              Delete Old Shift
            </Text>
          </Pressable>
      )}
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ paddingHorizontal: Spacing.md, paddingTop: Spacing.sm }}>
        <VerificationBanner />
        <LoadErrorBanner
          message={loadError}
          onRetry={() => {
            setLoading(true);
            loadBookings(true);
          }}
          retrying={loading && refreshing}
        />
      </View>
      {/* Tabs */}
      <View style={{ backgroundColor: Colors.surface, ...Shadows.sm, padding: Spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
          {TABS.map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{
                flex: 1,
                paddingVertical: Spacing.xs,
                borderRadius: Radius.full,
                backgroundColor: activeTab === tab ? Colors.primary : Colors.surfaceSecondary,
                alignItems: 'center',
              }}
            >
              <Text style={{
                fontSize: Typography.fontSize.xs,
                fontWeight: Typography.fontWeight.medium,
                color: activeTab === tab ? Colors.text.white : Colors.text.secondary,
              }}>
                {tab === 'all' ? 'All' : tab.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          renderItem={renderBooking}
          ListEmptyComponent={
            <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
              <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>
                No bookings
              </Text>
              <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.xs, textAlign: 'center' }}>
                {isWorker
                  ? 'Bookings from participants will appear here.'
                  : activeTab === 'pending'
                    ? 'Posted shifts waiting for a worker will appear here.'
                    : 'Book a worker or post a shift to get started!'}
              </Text>
            </View>
          }
        />
      )}

      <Modal
        visible={!!deleteConfirmTarget}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteConfirm}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: Spacing.lg }}>
          <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, ...Shadows.md }}>
            <Text style={{ color: Colors.text.primary, fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, marginBottom: Spacing.xs }}>
              Delete old shift
            </Text>
            <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, marginBottom: Spacing.md }}>
              Are you sure you want to delete this old shift?
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <Pressable
                onPress={closeDeleteConfirm}
                style={({ pressed }) => ({
                  paddingVertical: Spacing.xs,
                  paddingHorizontal: Spacing.md,
                  borderRadius: Radius.md,
                  backgroundColor: Colors.surfaceSecondary,
                  marginRight: Spacing.xs,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ color: Colors.text.secondary, fontWeight: Typography.fontWeight.semibold }}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={deleteBusy}
                onPress={async () => {
                  const target = deleteConfirmTarget;
                  if (target) await deleteOldShift(target);
                  closeDeleteConfirm();
                }}
                style={({ pressed }) => ({
                  paddingVertical: Spacing.xs,
                  paddingHorizontal: Spacing.md,
                  borderRadius: Radius.md,
                  backgroundColor: Colors.status.error,
                  opacity: pressed || deleteBusy ? 0.85 : 1,
                })}
              >
                <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>
                  {deleteBusy ? 'Deleting…' : 'Delete'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
