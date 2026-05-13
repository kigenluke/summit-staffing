/**
 * Coordinator & participant: pending connection requests with Approve / Decline (or Withdraw).
 */
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, Alert, ActivityIndicator, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../store/authStore.js';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';
import { formatDateDMY } from '../utils/dateFormat.js';

function notify(title, message) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message || undefined);
  }
}

const ActionRow = ({ children }) => (
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm }}>
    {children}
  </View>
);

export function AccessRequestsScreen() {
  const { user } = useAuthStore();
  const isCoordinator = user?.role === 'coordinator';
  const isParticipant = user?.role === 'participant';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [legacy, setLegacy] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    const path = isCoordinator ? '/api/coordinator/access-requests' : '/api/participants/me/access-requests';
    const { data, error } = await api.get(path);
    if (error || !data?.ok) {
      setIncoming([]);
      setOutgoing([]);
      setLoading(false);
      return;
    }
    setIncoming(data.incoming || []);
    setOutgoing(data.outgoing || []);
    setLegacy(Boolean(data.legacy_no_initiator_column));
    setLoading(false);
  }, [isCoordinator]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const run = async (requestId, fn) => {
    setBusyId(requestId);
    try {
      await fn();
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (!isCoordinator && !isParticipant) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: Spacing.lg, backgroundColor: Colors.background }}>
        <Text style={{ color: Colors.text.secondary, textAlign: 'center' }}>This screen is for coordinators and participants.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const approveCoordinatorSide = (requestId) =>
    run(requestId, async () => {
      const { data, error } = await api.post(`/api/coordinator/requests/${requestId}/approve-participant`);
      if (error || !data?.ok) notify('Could not approve', error?.message || data?.error || '');
      else notify('Approved', 'You can now help manage this participant account.');
    });

  const declineCoordinatorSide = (requestId) =>
    run(requestId, async () => {
      const { data, error } = await api.post(`/api/coordinator/requests/${requestId}/reject-participant`);
      if (error || !data?.ok) notify('Could not decline', error?.message || data?.error || '');
      else notify('Declined', 'The participant was notified.');
    });

  const withdrawCoordinatorSide = (requestId) =>
    run(requestId, async () => {
      const { data, error } = await api.post(`/api/coordinator/requests/${requestId}/withdraw`);
      if (error || !data?.ok) notify('Could not withdraw', error?.message || data?.error || '');
      else notify('Withdrawn', 'Your request was cancelled.');
    });

  const approveParticipantSide = (requestId) =>
    run(requestId, async () => {
      const { data, error } = await api.post(`/api/coordinator/requests/${requestId}/approve`);
      if (error || !data?.ok) notify('Could not approve', error?.message || data?.error || '');
      else notify('Approved', 'This coordinator can now help manage your account.');
    });

  const declineParticipantSide = (requestId) =>
    run(requestId, async () => {
      const { data, error } = await api.post(`/api/participants/me/access-requests/${requestId}/reject`);
      if (error || !data?.ok) notify('Could not decline', error?.message || data?.error || '');
      else notify('Declined', 'The coordinator was notified.');
    });

  const RequestCard = ({ title, rows, emptyHint, renderActions }) => (
    <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadows.sm }}>
      <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm }}>
        {title}
      </Text>
      {rows.length === 0 ? (
        <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.sm }}>{emptyHint}</Text>
      ) : (
        rows.map((row, idx) => (
          <View
            key={row.id}
            style={{
              borderTopWidth: idx === 0 ? 0 : 1,
              borderTopColor: Colors.borderLight,
              paddingTop: idx === 0 ? 0 : Spacing.md,
              marginTop: idx === 0 ? 0 : Spacing.md,
            }}
          >
            {renderActions(row)}
          </View>
        ))
      )}
    </View>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {legacy ? (
        <View style={{ marginBottom: Spacing.md, padding: Spacing.md, backgroundColor: '#FFFBEB', borderRadius: Radius.md }}>
          <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm }}>
            This database is missing the request &quot;initiator&quot; column. Run the latest schema migration on coordinator_participant_access for incoming/outgoing lists to separate correctly.
          </Text>
        </View>
      ) : null}

      {isCoordinator ? (
        <>
          <RequestCard
            title="Needs your action"
            rows={incoming}
            emptyHint="No pending requests from participants."
            renderActions={(row) => {
              const p = row.participant || {};
              const name = p.display_name || p.email || 'Participant';
              return (
                <View>
                  <Text style={{ fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>{name}</Text>
                  <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, marginTop: 2 }}>{p.email || ''}</Text>
                  <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.xs, marginTop: 4 }}>
                    Requested {row.requested_at ? formatDateDMY(new Date(row.requested_at)) : ''}
                  </Text>
                  <ActionRow>
                    <Pressable
                      disabled={busyId != null}
                      onPress={() => approveCoordinatorSide(row.id)}
                      style={({ pressed }) => ({
                        backgroundColor: Colors.status.success,
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        borderRadius: Radius.md,
                        opacity: pressed || busyId ? 0.85 : 1,
                      })}
                    >
                      <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>Approve</Text>
                    </Pressable>
                    <Pressable
                      disabled={busyId != null}
                      onPress={() => declineCoordinatorSide(row.id)}
                      style={({ pressed }) => ({
                        backgroundColor: Colors.status.error,
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        borderRadius: Radius.md,
                        opacity: pressed || busyId ? 0.85 : 1,
                      })}
                    >
                      <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>Decline</Text>
                    </Pressable>
                  </ActionRow>
                </View>
              );
            }}
          />
          <RequestCard
            title="Waiting on participant"
            rows={outgoing}
            emptyHint="You have no outgoing requests waiting for a participant response."
            renderActions={(row) => {
              const p = row.participant || {};
              const name = p.display_name || p.email || 'Participant';
              return (
                <View>
                  <Text style={{ fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>{name}</Text>
                  <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, marginTop: 2 }}>{p.email || ''}</Text>
                  <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.xs, marginTop: 4 }}>
                    Sent {row.requested_at ? formatDateDMY(new Date(row.requested_at)) : ''}
                  </Text>
                  <ActionRow>
                    <Pressable
                      disabled={busyId != null}
                      onPress={() => withdrawCoordinatorSide(row.id)}
                      style={({ pressed }) => ({
                        backgroundColor: Colors.text.secondary,
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        borderRadius: Radius.md,
                        opacity: pressed || busyId ? 0.85 : 1,
                      })}
                    >
                      <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>Withdraw request</Text>
                    </Pressable>
                  </ActionRow>
                </View>
              );
            }}
          />
        </>
      ) : (
        <>
          <RequestCard
            title="Needs your action"
            rows={incoming}
            emptyHint="No coordinator requests waiting for you."
            renderActions={(row) => {
              const c = row.coordinator || {};
              const name = c.display_name || c.email || 'Coordinator';
              return (
                <View>
                  <Text style={{ fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>{name}</Text>
                  <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, marginTop: 2 }}>{c.email || ''}</Text>
                  <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.xs, marginTop: 4 }}>
                    Requested {row.requested_at ? formatDateDMY(new Date(row.requested_at)) : ''}
                  </Text>
                  <ActionRow>
                    <Pressable
                      disabled={busyId != null}
                      onPress={() => approveParticipantSide(row.id)}
                      style={({ pressed }) => ({
                        backgroundColor: Colors.status.success,
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        borderRadius: Radius.md,
                        opacity: pressed || busyId ? 0.85 : 1,
                      })}
                    >
                      <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>Approve</Text>
                    </Pressable>
                    <Pressable
                      disabled={busyId != null}
                      onPress={() => declineParticipantSide(row.id)}
                      style={({ pressed }) => ({
                        backgroundColor: Colors.status.error,
                        paddingVertical: 10,
                        paddingHorizontal: 16,
                        borderRadius: Radius.md,
                        opacity: pressed || busyId ? 0.85 : 1,
                      })}
                    >
                      <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>Decline</Text>
                    </Pressable>
                  </ActionRow>
                </View>
              );
            }}
          />
          <RequestCard
            title="Waiting on coordinator"
            rows={outgoing}
            emptyHint="You have no pending requests sent to coordinators."
            renderActions={(row) => {
              const c = row.coordinator || {};
              const name = c.display_name || c.email || 'Coordinator';
              return (
                <View>
                  <Text style={{ fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>{name}</Text>
                  <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, marginTop: 2 }}>{c.email || ''}</Text>
                  <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.xs, marginTop: 4 }}>
                    Sent {row.requested_at ? formatDateDMY(new Date(row.requested_at)) : ''}
                  </Text>
                  <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.sm, marginTop: Spacing.sm }}>
                    Waiting for the coordinator to approve.
                  </Text>
                </View>
              );
            }}
          />
        </>
      )}
    </ScrollView>
  );
}
