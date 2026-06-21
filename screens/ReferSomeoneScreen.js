/**
 * Refer a worker or participant — share link or email invitation.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { api } from '../services/api.js';
import { PUBLIC_WEB_BASE } from '../constants/apiPublic.js';
import { copyToClipboard } from '../utils/clipboard.js';
import { Colors, Spacing, Typography, Radius } from '../constants/theme.js';

const inputStyle = {
  backgroundColor: Colors.surface,
  borderWidth: 1,
  borderColor: Colors.border,
  borderRadius: Radius.md,
  paddingVertical: Spacing.md,
  paddingHorizontal: Spacing.lg,
  fontSize: Typography.fontSize.base,
  color: Colors.text.primary,
};

/** Always rebuild as https://summitstaffing.com.au/refer?token=…&role=… */
function buildReferralDisplayLink(data) {
  const role = data?.role === 'participant' ? 'participant' : 'worker';
  const token = data?.token;
  if (token) {
    return `${PUBLIC_WEB_BASE}/refer?token=${encodeURIComponent(token)}&role=${encodeURIComponent(role)}`;
  }
  const url = data?.link;
  if (!url || typeof url !== 'string') return '';
  const referMatch = url.match(/refer\?([^#\s]+)/i);
  const qs = referMatch?.[1] || (url.includes('?') ? url.split('?').pop() : '');
  const params = new URLSearchParams(qs);
  const fromUrlToken = params.get('token');
  const fromUrlRole = params.get('role');
  if (fromUrlToken && fromUrlRole) {
    return `${PUBLIC_WEB_BASE}/refer?token=${encodeURIComponent(fromUrlToken)}&role=${encodeURIComponent(fromUrlRole)}`;
  }
  return url;
}

function notify(title, message) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

export function ReferSomeoneScreen({ route }) {
  const initialRole = route?.params?.role === 'participant' ? 'participant' : 'worker';
  const [role, setRole] = useState(initialRole);
  const [link, setLink] = useState('');
  const [email, setEmail] = useState('');
  const [loadingLink, setLoadingLink] = useState(false);
  const [sending, setSending] = useState(false);
  const [copying, setCopying] = useState(false);

  const loadLink = useCallback(async (nextRole) => {
    setLoadingLink(true);
    try {
      await api.get('/health', { timeoutMs: 20000, retries: 1 }).catch(() => {});
      const { data, error, status } = await api.post(
        '/api/referrals/link',
        { role: nextRole },
        { retries: 2, timeoutMs: 60000 },
      );
      if (error || !data?.ok) {
        let msg = error?.message || data?.error || 'Could not generate referral link';
        if (status === 401) {
          msg = 'Your session expired. Please sign out and sign in again, then try Refer someone.';
        } else if (status === 404 || /route not found/i.test(msg)) {
          msg = 'Referrals are not available on this server yet. Update the app or try again after the server is updated.';
        } else if (status === 408 || /took too long/i.test(msg)) {
          msg = 'The server is slow to respond. Check your connection and try again.';
        }
        notify('Could not load referral link', msg);
        return;
      }
      setLink(buildReferralDisplayLink(data));
    } finally {
      setLoadingLink(false);
    }
  }, []);

  useEffect(() => {
    loadLink(role);
  }, [role, loadLink]);

  const copyLink = async () => {
    if (!link || copying) return;
    setCopying(true);
    try {
      const copied = await copyToClipboard(link);
      if (copied) notify('Copied', 'Referral link copied to clipboard.');
      else notify('Referral link', link);
    } catch (_) {
      notify('Referral link', link);
    } finally {
      setCopying(false);
    }
  };

  const sendInvite = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      notify('Email required', 'Enter a valid email address.');
      return;
    }
    setSending(true);
    const { data, error, status } = await api.post(
      '/api/referrals/send',
      { role, email: trimmed },
      { retries: 1, timeoutMs: 60000 },
    );
    setSending(false);
    if (error || !data?.ok) {
      let msg = error?.message || data?.error || 'Invitation failed';
      if (status === 503 && /mailgun|email/i.test(msg)) {
        msg = 'Could not send email right now (Mailgun). You can still copy the referral link below and share it manually.';
      }
      notify('Could not send', msg);
      if (data?.token || data?.link) setLink(buildReferralDisplayLink(data));
      return;
    }
    notify('Invitation sent', data.message || `Referral email sent to ${trimmed}.`);
    setEmail('');
    if (data.token || data.link) setLink(buildReferralDisplayLink(data));
  };

  const roleLabel = role === 'worker' ? 'support worker' : 'participant';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm }}>
        Refer someone
      </Text>
      <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.lg }}>
        Share your link or send an email. When they accept, they can download Summit Staffing from the app store.
      </Text>

      <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary, marginBottom: Spacing.sm }}>
        Who are you referring?
      </Text>
      <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg }}>
        {(['worker', 'participant']).map((key) => {
          const active = role === key;
          return (
            <Pressable
              key={key}
              onPress={() => setRole(key)}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: Spacing.sm,
                borderRadius: Radius.md,
                borderWidth: 1.5,
                borderColor: active ? Colors.primary : Colors.border,
                backgroundColor: active ? `${Colors.primary}18` : Colors.surface,
                alignItems: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: active ? Colors.primary : Colors.text.primary, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.sm }}>
                {key === 'worker' ? 'Refer a worker' : 'Refer a participant'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary, marginBottom: Spacing.sm }}>
        Your referral link ({roleLabel})
      </Text>
      {loadingLink ? (
        <ActivityIndicator color={Colors.primary} style={{ marginBottom: Spacing.md }} />
      ) : (
        <View style={[inputStyle, { marginBottom: Spacing.sm }]}>
          <Text selectable style={{ fontSize: Typography.fontSize.sm, color: Colors.text.primary }}>
            {link || '—'}
          </Text>
        </View>
      )}
      <Pressable
        onPress={copyLink}
        disabled={!link || loadingLink || copying}
        style={({ pressed }) => ({
          backgroundColor: Colors.primary,
          paddingVertical: Spacing.sm,
          borderRadius: Radius.md,
          alignItems: 'center',
          marginBottom: Spacing.lg,
          opacity: !link || loadingLink || copying || pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>
          {copying ? 'Copying…' : 'Copy link'}
        </Text>
      </Pressable>

      <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary, marginBottom: Spacing.sm }}>
        Send by email
      </Text>
      <TextInput
        style={[inputStyle, { marginBottom: Spacing.md }]}
        placeholder="friend@example.com"
        placeholderTextColor={Colors.text.muted}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoCorrect={false}
        editable={!sending}
      />
      <Pressable
        onPress={sendInvite}
        disabled={sending}
        style={({ pressed }) => ({
          backgroundColor: Colors.primary,
          paddingVertical: Spacing.md,
          borderRadius: Radius.md,
          alignItems: 'center',
          opacity: sending || pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>
          {sending ? 'Sending…' : 'Send invitation email'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
