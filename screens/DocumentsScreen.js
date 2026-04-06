/**
 * Summit Staffing – Documents Screen
 * Displays invoices as document cards with status badges.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { api } from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';

const getStatusColor = (status) => {
  switch (status) {
    case 'paid': return Colors.status.success;
    case 'pending': case 'draft': return Colors.status.warning;
    case 'overdue': return Colors.status.error;
    default: return Colors.text.muted;
  }
};

export function DocumentsScreen({ navigation }) {
  const { user } = useAuthStore();
  const isWorker = user?.role === 'worker';
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDocuments = useCallback(async () => {
    try {
      const { data } = await api.get('/api/invoices');
      if (data?.ok) {
        setDocuments(data.invoices || []);
      }
    } catch (e) {}
    setLoading(false);
  }, []);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDocuments();
    setRefreshing(false);
  }, [loadDocuments]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListHeaderComponent={
          <View>
            <View style={{ backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md }}>
              <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.white }}>
                Your Documents
              </Text>
              <Text style={{ fontSize: Typography.fontSize.sm, color: 'rgba(255,255,255,0.85)', marginTop: Spacing.xs }}>
                View your invoices and service documents below.
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md }}>
              <Pressable
                onPress={() => navigation.navigate(isWorker ? 'WorkerManage' : 'Invoices')}
                style={({ pressed }) => ({
                  flex: 1,
                  backgroundColor: Colors.surface,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  borderRadius: Radius.md,
                  paddingVertical: Spacing.sm,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.9 : 1,
                  ...Shadows.sm,
                })}
              >
                <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.semibold }}>
                  Add Documents
                </Text>
              </Pressable>

              <Pressable
                onPress={() => navigation.navigate('Payments')}
                style={({ pressed }) => ({
                  flex: 1,
                  backgroundColor: Colors.primary,
                  borderRadius: Radius.md,
                  paddingVertical: Spacing.sm,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.9 : 1,
                  ...Shadows.sm,
                })}
              >
                <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>
                  Add Bank Details
                </Text>
              </Pressable>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.sm, ...Shadows.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, fontSize: Typography.fontSize.base }}>
                  {item.service_description || item.invoice_number || 'Document'}
                </Text>
                {item.service_date && (
                  <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 4 }}>
                    {new Date(item.service_date).toLocaleDateString()}
                  </Text>
                )}
              </View>
              <View style={{ backgroundColor: getStatusColor(item.status), paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: Radius.full }}>
                <Text style={{ color: Colors.text.white, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, textTransform: 'uppercase' }}>
                  {item.status}
                </Text>
              </View>
            </View>
            {item.total != null && (
              <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginTop: Spacing.sm }}>
                ${parseFloat(item.total).toFixed(2)}
              </Text>
            )}
            {item.invoice_number && (
              <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginTop: 4 }}>
                Invoice #{item.invoice_number}
              </Text>
            )}
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: Spacing.xl }} />
          ) : (
            <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
              <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>
                No documents yet
              </Text>
              <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.xs, textAlign: 'center' }}>
                Your invoices and service documents will appear here once bookings are completed.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}
