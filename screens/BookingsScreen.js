/**
 * Summit Staffing – Bookings Screen
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, ActivityIndicator, Alert } from 'react-native';
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

const TABS = ['all', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];

export function BookingsScreen({ navigation }) {
  const { user } = useAuthStore();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
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

  const handleAction = async (bookingId, action) => {
    const actionMap = {
      accept: { method: 'put', path: `/api/bookings/${bookingId}/accept`, label: 'Accept' },
      decline: { method: 'put', path: `/api/bookings/${bookingId}/decline`, label: 'Decline' },
      cancel: { method: 'put', path: `/api/bookings/${bookingId}/cancel`, label: 'Cancel' },
      complete: { method: 'put', path: `/api/bookings/${bookingId}/complete`, label: 'Complete' },
    };
    const a = actionMap[action];
    if (!a) return;

    Alert.alert('Confirm', `${a.label} this booking?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes',
        onPress: async () => {
          const { error } = await api[a.method](a.path);
          if (error) Alert.alert('Error', error.message);
          else loadBookings();
        },
      },
    ]);
  };

  const renderBooking = ({ item: b }) => (
    <Pressable
      onPress={() => navigation.navigate('BookingDetail', { bookingId: b.id })}
      style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.sm, ...Shadows.md }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>
            {b.service_type}
          </Text>
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 4 }}>
            {new Date(b.start_time).toLocaleDateString()}
          </Text>
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 2 }}>
            {new Date(b.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(b.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {b.hourly_rate != null && (
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 2 }}>
              {isWorker && b.status === 'pending' ? "Participant's budget: " : ""}${Number(b.hourly_rate).toFixed(2)}/hr
            </Text>
          )}
          {b.location_address && (
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 2 }}>{b.location_address}</Text>
          )}
          {b.special_instructions && (
            <Text numberOfLines={2} style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginTop: 4, fontStyle: 'italic' }}>
              "{b.special_instructions}"
            </Text>
          )}
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

      {/* Action Buttons */}
      <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md }}>
        {isWorker && b.status === 'pending' && (
          <>
            <Pressable onPress={() => handleAction(b.id, 'accept')}
              style={({ pressed }) => ({
                flex: 1, backgroundColor: Colors.status.success, paddingVertical: Spacing.sm,
                borderRadius: Radius.md, alignItems: 'center', opacity: pressed ? 0.8 : 1,
              })}>
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>Accept</Text>
            </Pressable>
            <Pressable onPress={() => handleAction(b.id, 'decline')}
              style={({ pressed }) => ({
                flex: 1, backgroundColor: Colors.status.error, paddingVertical: Spacing.sm,
                borderRadius: Radius.md, alignItems: 'center', opacity: pressed ? 0.8 : 1,
              })}>
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>Decline</Text>
            </Pressable>
          </>
        )}
        {b.status === 'pending' && !isWorker && (
          <Pressable onPress={() => handleAction(b.id, 'cancel')}
            style={({ pressed }) => ({
              flex: 1, backgroundColor: Colors.status.error, paddingVertical: Spacing.sm,
              borderRadius: Radius.md, alignItems: 'center', opacity: pressed ? 0.8 : 1,
            })}>
            <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>Cancel Booking</Text>
          </Pressable>
        )}
        {b.status === 'confirmed' && (
          <Pressable onPress={() => handleAction(b.id, 'complete')}
            style={({ pressed }) => ({
              flex: 1, backgroundColor: Colors.primary, paddingVertical: Spacing.sm,
              borderRadius: Radius.md, alignItems: 'center', opacity: pressed ? 0.8 : 1,
            })}>
            <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>Mark Complete</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Tabs */}
      <View style={{ backgroundColor: Colors.surface, ...Shadows.sm }}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={TABS}
          keyExtractor={t => t}
          contentContainerStyle={{ padding: Spacing.sm, gap: Spacing.xs }}
          renderItem={({ item: tab }) => (
            <Pressable
              onPress={() => setActiveTab(tab)}
              style={{
                paddingVertical: Spacing.xs, paddingHorizontal: Spacing.md,
                borderRadius: Radius.full,
                backgroundColor: activeTab === tab ? Colors.primary : Colors.surfaceSecondary,
              }}
            >
              <Text style={{
                fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium,
                color: activeTab === tab ? Colors.text.white : Colors.text.secondary,
              }}>
                {tab === 'all' ? 'All' : tab.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}
              </Text>
            </Pressable>
          )}
        />
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
    </View>
  );
}
