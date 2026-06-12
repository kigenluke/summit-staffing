/**
 * Public landing for referral email links — validates invite and opens app stores.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Platform, Linking, ScrollView } from 'react-native';
import { api } from '../../services/api.js';
import { Colors, Spacing, Typography, Radius } from '../../constants/theme.js';
import { getPlayStoreUrl, getAppStoreUrl } from '../../utils/storeUrls.js';

function readReferParams(route) {
  const fromRoute = {
    token: route?.params?.token ? String(route.params.token).trim() : '',
    role: route?.params?.role ? String(route.params.role).trim() : '',
  };
  if (fromRoute.token) return fromRoute;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const usp = new URLSearchParams(window.location.search);
      return {
        token: String(usp.get('token') || '').trim(),
        role: String(usp.get('role') || '').trim(),
      };
    } catch (_) {}
  }
  return { token: '', role: '' };
}

export function ReferInviteScreen({ route, navigation }) {
  const [{ token, role }, setParams] = useState(() => readReferParams(route));
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const p = readReferParams(route);
    setParams(p);
  }, [route?.params?.token, route?.params?.role]);

  useEffect(() => {
    if (!token) {
      setError('This invitation link is missing a token.');
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      const qs = new URLSearchParams({ token });
      if (role) qs.set('role', role);
      const { data, error: err } = await api.get(`/api/referrals/validate?${qs.toString()}`);
      setLoading(false);
      if (err || !data?.ok) {
        setError(err?.message || data?.error || 'Invitation link is invalid or expired.');
        return;
      }
      setInvite(data);
    })();
  }, [token, role]);

  const playUrl = invite?.playStoreUrl || getPlayStoreUrl();
  const appStoreUrl = invite?.appStoreUrl || getAppStoreUrl();
  const roleLabel = invite?.role === 'worker' ? 'support worker' : 'participant';

  const openStore = (url) => {
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  };

  useEffect(() => {
    if (!invite || Platform.OS === 'web') return;
    const autoUrl = Platform.OS === 'ios' ? appStoreUrl : playUrl;
    const t = setTimeout(() => openStore(autoUrl), 1200);
    return () => clearTimeout(t);
  }, [invite, playUrl, appStoreUrl]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: Spacing.lg, backgroundColor: Colors.background }}>
        <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.status.error, marginBottom: Spacing.sm }}>
          Invitation unavailable
        </Text>
        <Text style={{ color: Colors.text.secondary }}>{error}</Text>
        <Pressable onPress={() => navigation.navigate('Welcome')} style={{ marginTop: Spacing.lg }}>
          <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.semibold }}>Back to home</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: Spacing.lg, paddingTop: Spacing.xxl }}
    >
      <Text style={{ fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm }}>
        You're invited!
      </Text>
      <Text style={{ fontSize: Typography.fontSize.base, color: Colors.text.secondary, marginBottom: Spacing.lg }}>
        <Text style={{ fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>{invite.referrerName}</Text>
        {' '}invited you to join Summit Staffing as a {roleLabel}.
      </Text>
      {invite.invitedEmail ? (
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.lg }}>
          Sign up with: {invite.invitedEmail}
        </Text>
      ) : null}

      <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.md }}>
        Download the app to get started:
      </Text>

      <Pressable
        onPress={() => openStore(playUrl)}
        style={({ pressed }) => ({
          backgroundColor: Colors.primary,
          paddingVertical: Spacing.md,
          borderRadius: Radius.md,
          alignItems: 'center',
          marginBottom: Spacing.sm,
          opacity: pressed ? 0.88 : 1,
        })}
      >
        <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>Get it on Google Play</Text>
      </Pressable>

      <Pressable
        onPress={() => openStore(appStoreUrl)}
        style={({ pressed }) => ({
          backgroundColor: Colors.text.primary,
          paddingVertical: Spacing.md,
          borderRadius: Radius.md,
          alignItems: 'center',
          marginBottom: Spacing.lg,
          opacity: pressed ? 0.88 : 1,
        })}
      >
        <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>Download on the App Store</Text>
      </Pressable>

      <Pressable
        onPress={() => {
          const signupRole = invite.role === 'worker' ? 'worker' : 'participant';
          if (signupRole === 'participant') {
            navigation.navigate('ParticipantSignUp');
          } else {
            navigation.navigate('Register', {
              role: signupRole,
              referralToken: token,
              email: invite.invitedEmail || undefined,
            });
          }
        }}
        style={{ alignItems: 'center', marginTop: Spacing.sm }}
      >
        <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.semibold }}>
          Or sign up on the web
        </Text>
      </Pressable>
    </ScrollView>
  );
}
