/**
 * Summit Staffing – Bookings Screen
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, ActivityIndicator, Alert, Modal } from 'react-native';
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

const TABS = ['all', 'pending', 'confirmed', 'in_progress'];

export function BookingsScreen({ navigation }) {
  const { user } = useAuthStore();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [deleteConfirmBookingId, setDeleteConfirmBookingId] = useState(null);
  const isWorker = user?.role === 'worker';

  const loadBookings = useCallback(async () => {
    try {
      const query = activeTab !== 'all' ? `?status=${activeTab}` : '?limit=100';
      const { data } = await api.get(`/api/bookings${query}`);
      if (data?.ok && data?.bookings) {
        setBookings(data.bookings);
      }
    } catch (e) {}
    setLoading(false);
  }, [activeTab]);

  useEffect(() => { setLoading(true); loadBookings(); }, [loadBookings]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadBookings();
    setRefreshing(false);
  }, [loadBookings]);

  const deleteOldShift = useCallback(async (bookingId) => {
    const { error } = await api.put(`/api/bookings/${bookingId}/cancel`);
    if (error) {
      Alert.alert('Error', error.message || 'Failed to delete old shift');
      return;
    }
    Alert.alert('Deleted', 'Old shift deleted successfully.');
    loadBookings();
  }, [loadBookings]);

  const openDeleteConfirm = useCallback((bookingId) => {
    setDeleteConfirmBookingId(bookingId);
  }, []);

  const closeDeleteConfirm = useCallback(() => {
    setDeleteConfirmBookingId(null);
  }, []);

  const renderBooking = ({ item: b }) => {
    const isPastPendingOrConfirmed = (b.status === 'pending' || b.status === 'confirmed')
      && b.end_time
      && (new Date(b.end_time).getTime() < Date.now());

    return (
      <Pressable
        onPress={() => navigation.navigate('BookingDetail', { bookingId: b.id })}
        style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.sm, ...Shadows.md }}
      >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>
            {b.service_type}
          </Text>
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 4 }}>
            {new Date(b.start_time).toLocaleDateString()} • {new Date(b.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <View style={{
          backgroundColor: STATUS_COLORS[b.status] || Colors.text.muted,
          paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full,
        }}>
          <Text style={{ color: Colors.text.white, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold }}>
            {(b.status || '').replace('_', ' ').toUpperCase()}
          </Text>
        </View>
      </View>

      {isPastPendingOrConfirmed && (
          <Pressable
            onPress={(e) => {
              if (e?.stopPropagation) e.stopPropagation();
              openDeleteConfirm(b.id);
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
                {isWorker ? 'Bookings from participants will appear here.' : 'Book a worker to get started!'}
              </Text>
            </View>
          }
        />
      )}

      <Modal
        visible={!!deleteConfirmBookingId}
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
                onPress={async () => {
                  const id = deleteConfirmBookingId;
                  closeDeleteConfirm();
                  if (id) await deleteOldShift(id);
                }}
                style={({ pressed }) => ({
                  paddingVertical: Spacing.xs,
                  paddingHorizontal: Spacing.md,
                  borderRadius: Radius.md,
                  backgroundColor: Colors.status.error,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
