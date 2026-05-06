import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, RefreshControl, Text, View } from 'react-native';
import { useAuthStore } from '../store/authStore.js';
import { api } from '../services/api.js';
import { Colors, Radius, Shadows, Spacing, Typography } from '../constants/theme.js';

const getTimeGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

export function CoordinatorDashboardScreen({ navigation }) {
  const { user } = useAuthStore();
  const [firstName, setFirstName] = useState('');
  const [participants, setParticipants] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ visible: false, participant: null });

  const loadData = useCallback(async () => {
    try {
      const listRes = await api.get('/api/coordinator/participants');
      setFirstName((user?.email || '').split('@')[0] || '');
      if (listRes?.data?.ok) {
        setParticipants(listRes.data.participants || []);
      }
    } catch (_) {}
  }, [user?.email]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const requestAccess = async (participant) => {
    try {
      const { data, error } = await api.post(`/api/coordinator/participants/${participant.id}/request`);
      if (error || !data?.ok) {
        Alert.alert('Request failed', error?.message || data?.error || 'Could not send request');
        return;
      }
      setParticipants((prev) => prev.map((item) => (
        item.id === participant.id ? { ...item, request_status: 'pending' } : item
      )));
    } catch (_) {
      Alert.alert('Request failed', 'Could not send request');
    }
  };

  const openManage = (participant) => {
    navigation.navigate('CoordinatorParticipantManage', { participant });
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <FlatList
        data={participants}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListHeaderComponent={(
          <View style={{
            backgroundColor: Colors.primary,
            borderRadius: Radius.lg,
            padding: Spacing.lg,
            marginBottom: Spacing.lg,
            ...Shadows.md
          }}
          >
            <Text style={{ color: Colors.text.white, fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.medium }}>
              {getTimeGreeting()}
            </Text>
            <Text style={{ color: Colors.text.white, fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, marginTop: 4 }}>
              {firstName || user?.email || 'Coordinator'}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>
              Coordinator Dashboard
            </Text>
          </View>
        )}
        renderItem={({ item }) => {
          const status = item.request_status || 'none';
          const isApproved = status === 'approved';
          const isPending = status === 'pending';
          const title = `${item.first_name || ''} ${item.last_name || ''}`.trim() || item.email || 'Participant';
          return (
            <View style={{
              backgroundColor: Colors.surface,
              borderRadius: Radius.lg,
              padding: Spacing.md,
              marginBottom: Spacing.sm,
              ...Shadows.sm
            }}
            >
              <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.base }}>
                {title}
              </Text>
              <Text style={{ color: Colors.text.secondary, marginTop: 2 }}>
                {item.email || 'No email'}
              </Text>
              <Text style={{ color: Colors.text.muted, marginTop: 2 }}>
                {item.phone || item.address || 'No additional details'}
              </Text>
              <View style={{ marginTop: Spacing.sm, alignItems: 'flex-start' }}>
                {isApproved ? (
                  <Pressable
                    onPress={() => openManage(item)}
                    style={({ pressed }) => ({
                      backgroundColor: Colors.status.success,
                      borderRadius: Radius.md,
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>Manage</Text>
                  </Pressable>
                ) : isPending ? (
                  <View style={{ backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.md, paddingVertical: 10, paddingHorizontal: 16 }}>
                    <Text style={{ color: Colors.text.secondary, fontWeight: Typography.fontWeight.semibold }}>Pending</Text>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setConfirmModal({ visible: true, participant: item })}
                    style={({ pressed }) => ({
                      backgroundColor: Colors.primary,
                      borderRadius: Radius.md,
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>Request</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        }}
      />

      <Modal visible={confirmModal.visible} transparent animationType="fade" onRequestClose={() => setConfirmModal({ visible: false, participant: null })}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: Spacing.lg }}>
          <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg }}>
            <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>
              Send request?
            </Text>
            <Text style={{ color: Colors.text.secondary, marginTop: Spacing.sm }}>
              Participant approval ke baad aapko account manage access mil jayegi.
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: Spacing.lg, gap: Spacing.sm }}>
              <Pressable onPress={() => setConfirmModal({ visible: false, participant: null })}>
                <Text style={{ color: Colors.text.secondary, fontWeight: Typography.fontWeight.semibold }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  const p = confirmModal.participant;
                  setConfirmModal({ visible: false, participant: null });
                  if (p) await requestAccess(p);
                }}
              >
                <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.bold }}>OK</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
