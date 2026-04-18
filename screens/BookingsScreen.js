/**
 * Summit Staffing – Bookings Screen
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, ActivityIndicator, Alert, Platform } from 'react-native';
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

  const renderBooking = ({ item: b }) => (
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
    </Pressable>
  );

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
    </View>
  );
}
