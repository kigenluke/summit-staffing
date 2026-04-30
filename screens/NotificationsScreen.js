/**
 * Summit Staffing – Notifications Screen
 * Fetches real notification data from the API with pull-to-refresh,
 * mark-as-read, mark-all-read, and long-press to delete.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, Pressable, Alert, Platform, ActivityIndicator } from 'react-native';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';

const getRelativeTime = (dateStr) => {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'yesterday';
  return date.toLocaleDateString();
};

export function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    try {
      const { data } = await api.get('/api/notifications');
      if (data?.ok) {
        setNotifications(data.notifications || []);
      }
    } catch (e) {}
    setLoading(false);
  }, []);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  }, [loadNotifications]);

  const markAsRead = async (id) => {
    try {
      await api.put(`/api/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (e) {}
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/api/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (e) {}
  };

  const deleteNotification = async (id) => {
    try {
      await api.delete(`/api/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {}
  };

  const handleLongPress = (item) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Delete this notification?')) {
        deleteNotification(item.id);
      }
    } else {
      Alert.alert('Delete Notification', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteNotification(item.id) },
      ]);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        unreadCount > 0 ? (
          <Pressable onPress={markAllAsRead} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
            <Text style={{ color: Colors.text.white, fontWeight: '600', fontSize: 14 }}>Mark all read</Text>
          </Pressable>
        ) : null,
    });
  }, [navigation, unreadCount]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        renderItem={({ item: n }) => {
          const isUnread = !n.read;

          return (
            <Pressable
              onPress={() => { if (isUnread) markAsRead(n.id); }}
              onLongPress={() => handleLongPress(n)}
              style={({ pressed }) => ({
                backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg,
                marginBottom: Spacing.sm, ...Shadows.sm, flexDirection: 'row', alignItems: 'center',
                borderLeftWidth: isUnread ? 4 : 0, borderLeftColor: isUnread ? Colors.primary : 'transparent',
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ flex: 1, fontWeight: isUnread ? Typography.fontWeight.bold : Typography.fontWeight.normal, color: Colors.text.primary, fontSize: Typography.fontSize.base }}>
                    {n.title}
                  </Text>
                  {isUnread && (
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginLeft: Spacing.xs }} />
                  )}
                </View>
                {n.body ? (
                  <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 2 }}>{n.body}</Text>
                ) : null}
                <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginTop: 4 }}>
                  {getRelativeTime(n.created_at)}
                </Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
            <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>No notifications</Text>
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.xs, textAlign: 'center' }}>
              You'll receive notifications for bookings, messages, and important updates here.
            </Text>
          </View>
        }
      />
      )}
    </View>
  );
}
