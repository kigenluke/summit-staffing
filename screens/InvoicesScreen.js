/**
 * Summit Staffing – Invoices Screen
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';

const STATUS_COLORS = { draft: Colors.text.muted, sent: Colors.status.info, paid: Colors.status.success };

export function InvoicesScreen() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/api/invoices?limit=50');
      if (data?.ok && data?.invoices) setInvoices(data.invoices);
    } catch (e) {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const sendInvoice = async (id) => {
    const { error } = await api.post(`/api/invoices/${id}/send`);
    if (error) Alert.alert('Error', error.message);
    else { Alert.alert('Success', 'Invoice sent via email!'); load(); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <FlatList
          data={invoices}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          renderItem={({ item: inv }) => (
            <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.sm, ...Shadows.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, fontSize: Typography.fontSize.lg }}>
                    #{inv.invoice_number}
                  </Text>
                  <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 2 }}>
                    {inv.service_description || 'NDIS Service'}
                  </Text>
                  {inv.service_date && <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginTop: 2 }}>
                     {new Date(inv.service_date).toLocaleDateString()}
                  </Text>}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.primary, fontSize: Typography.fontSize.lg }}>
                    ${Number(inv.total || 0).toFixed(2)}
                  </Text>
                  <View style={{ backgroundColor: STATUS_COLORS[inv.status] || Colors.text.muted, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.full, marginTop: 4 }}>
                    <Text style={{ color: Colors.text.white, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold, textTransform: 'uppercase' }}>{inv.status}</Text>
                  </View>
                </View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.borderLight }}>
                <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted }}>
                  {inv.hours ? `${inv.hours}h @ $${inv.rate}/hr` : ''}
                </Text>
                {inv.gst > 0 && <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted }}>GST: ${Number(inv.gst).toFixed(2)}</Text>}
              </View>
              {inv.status === 'draft' && (
                <Pressable onPress={() => sendInvoice(inv.id)}
                  style={({ pressed }) => ({ backgroundColor: Colors.primary, paddingVertical: Spacing.sm, borderRadius: Radius.md, alignItems: 'center', marginTop: Spacing.md, opacity: pressed ? 0.8 : 1 })}>
                  <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}> Send Invoice</Text>
                </Pressable>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
              <Text style={{ fontSize: 48, marginBottom: Spacing.md }}></Text>
              <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>No invoices yet</Text>
              <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.xs, textAlign: 'center' }}>
                Invoices are generated after bookings are completed.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
