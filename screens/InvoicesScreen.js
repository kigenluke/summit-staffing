/**
 * Summit Staffing – Invoices Screen
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, ActivityIndicator, Alert, Platform } from 'react-native';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';
import { formatDateDMY } from '../utils/dateFormat.js';
import { LoadErrorBanner } from '../components/LoadErrorBanner.js';
import { alertApiError } from '../utils/userAlert.js';

const STATUS_COLORS = { draft: Colors.text.muted, sent: Colors.status.info, paid: Colors.status.success };

function showUserAlert(title, message) {
  const body = message ? String(message) : '';
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(body ? `${title}\n\n${body}` : title);
    return;
  }
  Alert.alert(title, body || undefined);
}

export function InvoicesScreen() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [sendingId, setSendingId] = useState(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const { data, error } = await api.get('/api/invoices?limit=50', { retries: 2 });
      if (error) {
        const msg = error.status === 403
          ? (error.message || 'Your profile may not be set up to view invoices yet.')
          : (error.message || 'Could not load invoices.');
        setLoadError(msg);
        setLoading(false);
        return;
      }
      if (data?.ok && data?.invoices) setInvoices(data.invoices);
    } catch (e) {
      setLoadError(e?.message || 'Could not load invoices.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);

  const runSend = useCallback(async (id, resend = false) => {
    if (sendingId) return;
    setSendingId(id);
    try {
      const suffix = resend ? '?resend=true' : '';
      const { data, error } = await api.post(
        `/api/invoices/${id}/send${suffix}`,
        resend ? { resend: true } : {},
        { timeoutMs: 120000 },
      );
      if (error) {
        let msg = error.message || 'Failed to send invoice email';
        if (error.status === 403) {
          msg = error.message || 'You do not have permission to send this invoice.';
        } else if (error.status === 502 || /mailgun|email could not be sent/i.test(msg)) {
          msg = error.message || 'Invoice email could not be sent.';
        }
        if (error.response?.hint) {
          msg = `${msg}\n\n${error.response.hint}`;
        }
        showUserAlert('Could not send', msg);
        return;
      }
      const to = data?.emailedTo ? ` to ${data.emailedTo}` : '';
      showUserAlert(
        resend ? 'Invoice resent' : 'Invoice sent',
        resend
          ? `Updated invoice with full PDF and details was emailed${to}.`
          : `Invoice emailed${to} successfully.`,
      );
      await load();
    } finally {
      setSendingId(null);
    }
  }, [load, sendingId]);

  const sendInvoice = useCallback((id, resend = false) => {
    const message = resend
      ? 'A fresh email will be sent with the complete invoice details and PDF attachment (participant, worker, hours, EFT reference, etc.).'
      : 'Send this invoice by email to the plan manager or participant?';

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(resend ? 'Send this invoice again with full details?' : 'Send this invoice by email?')) {
        runSend(id, resend);
      }
      return;
    }

    Alert.alert(
      resend ? 'Send invoice again?' : 'Send invoice?',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: resend ? 'Send again' : 'Send', onPress: () => runSend(id, resend) },
      ],
    );
  }, [runSend]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <FlatList
          data={invoices}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xxl, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          ListHeaderComponent={loadError ? (
            <LoadErrorBanner message={loadError} onRetry={() => { setLoading(true); load(); }} retrying={refreshing} />
          ) : null}
          ListEmptyComponent={!loadError ? (
            <Text style={{ color: Colors.text.secondary, textAlign: 'center', marginTop: Spacing.xl }}>No invoices yet</Text>
          ) : null}
          renderItem={({ item: inv }) => {
            const busy = sendingId === inv.id;
            const canSend = inv.status === 'draft';
            const canResend = inv.status === 'sent' || inv.status === 'paid';

            return (
            <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.sm, ...Shadows.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, fontSize: Typography.fontSize.lg }}>
                    #{inv.invoice_number}
                  </Text>
                  <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 2 }}>
                    {inv.service_description || inv.service_type || 'NDIS Service'}
                  </Text>
                  {(inv.participant_first_name || inv.worker_first_name) && (
                    <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginTop: 4 }}>
                      {inv.participant_first_name || inv.participant_last_name
                        ? `Participant: ${[inv.participant_first_name, inv.participant_last_name].filter(Boolean).join(' ')}`
                        : ''}
                      {inv.worker_first_name ? `${inv.participant_first_name ? ' · ' : ''}Worker: ${[inv.worker_first_name, inv.worker_last_name].filter(Boolean).join(' ')}` : ''}
                    </Text>
                  )}
                  {inv.ndis_support_item_code ? (
                    <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginTop: 2 }}>
                      NDIS item: {inv.ndis_support_item_code}
                    </Text>
                  ) : null}
                  {inv.service_date && <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginTop: 2 }}>
                     Service date: {formatDateDMY(inv.service_date)}
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
                  {inv.hours ? `${Number(inv.hours).toFixed(2)}h @ $${Number(inv.rate || 0).toFixed(2)}/hr` : ''}
                </Text>
                {inv.eft_reference ? (
                  <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted }}>Ref: {inv.eft_reference}</Text>
                ) : inv.gst > 0 ? (
                  <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted }}>GST: ${Number(inv.gst).toFixed(2)}</Text>
                ) : null}
              </View>
              {canSend && (
                <Pressable
                  onPress={() => sendInvoice(inv.id, false)}
                  disabled={busy}
                  style={({ pressed }) => ({ backgroundColor: Colors.primary, paddingVertical: Spacing.sm, borderRadius: Radius.md, alignItems: 'center', marginTop: Spacing.md, opacity: pressed || busy ? 0.8 : 1 })}
                >
                  <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>
                    {busy ? 'Sending…' : 'Send invoice'}
                  </Text>
                </Pressable>
              )}
              {canResend && (
                <Pressable
                  onPress={() => sendInvoice(inv.id, true)}
                  disabled={busy}
                  style={({ pressed }) => ({
                    backgroundColor: Colors.surfaceSecondary,
                    borderWidth: 1,
                    borderColor: Colors.primary,
                    paddingVertical: Spacing.sm,
                    borderRadius: Radius.md,
                    alignItems: 'center',
                    marginTop: Spacing.md,
                    opacity: pressed || busy ? 0.8 : 1,
                  })}
                >
                  <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.semibold }}>
                    {busy ? 'Sending…' : 'Send again (full details + PDF)'}
                  </Text>
                </Pressable>
              )}
            </View>
          );}}
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
