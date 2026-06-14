/**
 * Refer a worker or participant — share link or email invitation.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { api } from '../services/api.js';
import { PUBLIC_WEB_BASE } from '../constants/apiPublic.js';
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

  const loadLink = useCallback(async (nextRole) => {
    setLoadingLink(true);
    const { data, error } = await api.post('/api/referrals/link', { role: nextRole });
    setLoadingLink(false);
    if (error || !data?.ok) {
      notify('Error', error?.message || data?.error || 'Could not generate referral link');
      return;
    }
    setLink(buildReferralDisplayLink(data));
  }, []);

  useEffect(() => {
    loadLink(role);
  }, [role, loadLink]);

  const copyLink = async () => {
    if (!link) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        notify('Copied', 'Referral link copied to clipboard.');
        return;
      }
      notify('Referral link', link);
    } catch (_) {
      notify('Referral link', link);
    }
  };

  const sendInvite = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      notify('Email required', 'Enter a valid email address.');
      return;
    }
    setSending(true);
    const { data, error } = await api.post('/api/referrals/send', {
      role,
      email: trimmed,
    });
    setSending(false);
    if (error || !data?.ok) {
      notify('Could not send', error?.message || data?.error || 'Invitation failed');
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
        disabled={!link || loadingLink}
        style={({ pressed }) => ({
          backgroundColor: Colors.primary,
          paddingVertical: Spacing.sm,
          borderRadius: Radius.md,
          alignItems: 'center',
          marginBottom: Spacing.lg,
          opacity: !link || loadingLink || pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>Copy link</Text>
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
