/**
 * Participant: invite a coordinator by email (primary). Optional lookup if they already have an account.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';

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

export function ParticipantSearchCoordinatorScreen() {
  const [email, setEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [result, setResult] = useState(null);

  const runSearch = async () => {
    const q = email.trim();
    if (!q) {
      Alert.alert('Email required', 'Enter an email address to look up.');
      return;
    }
    setSearching(true);
    setHasSearched(true);
    setResult(null);
    try {
      const { data, error } = await api.get(`/api/participants/search-coordinator?email=${encodeURIComponent(q)}`);
      if (error || !data?.ok) {
        Alert.alert('Lookup failed', error?.message || data?.error || 'Could not look up coordinator.');
        setSearching(false);
        return;
      }
      setResult(data.coordinator);
    } catch (_) {
      Alert.alert('Lookup failed', 'Could not look up coordinator.');
    }
    setSearching(false);
  };

  const sendInviteEmail = async () => {
    const q = email.trim();
    if (!q || !q.includes('@')) {
      Alert.alert('Email required', 'Enter a valid email address.');
      return;
    }
    setInviting(true);
    try {
      const { data, error } = await api.post('/api/participants/invite-coordinator', { email: q });
      if (error) {
        Alert.alert('Invite failed', error.message || 'Could not send invitation.');
        setInviting(false);
        return;
      }
      if (!data?.ok) {
        Alert.alert('Invite failed', data?.error || 'Could not send invitation.');
        setInviting(false);
        return;
      }
      if (data.mode === 'existing_coordinator' && data.coordinator) {
        setResult(data.coordinator);
        Alert.alert(
          'Already on Summit Staffing',
          'This email already has a coordinator account. Tap Request access below to ask them to manage your account.',
        );
        setInviting(false);
        return;
      }
      if (data.mode === 'invited') {
        Alert.alert(
          'Invitation sent',
          'We emailed them a link to create a coordinator account. When they sign up with that link and this email, they will be connected to manage your account.',
        );
      }
    } catch (_) {
      Alert.alert('Invite failed', 'Could not send invitation.');
    }
    setInviting(false);
  };

  const sendRequest = async () => {
    if (!result?.user_id) return;
    setRequesting(true);
    try {
      const { data, error } = await api.post('/api/participants/request-coordinator', {
        coordinatorUserId: result.user_id,
      });
      if (error || !data?.ok) {
        Alert.alert('Request failed', error?.message || data?.error || 'Could not send request.');
        setRequesting(false);
        return;
      }
      Alert.alert('Request sent', 'The coordinator will be notified to approve your request.');
    } catch (_) {
      Alert.alert('Request failed', 'Could not send request.');
    }
    setRequesting(false);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm }}>
          Invite your coordinator
        </Text>
        <Text style={{ fontSize: Typography.fontSize.base, color: Colors.text.secondary, marginBottom: Spacing.md }}>
          Enter their email and send an invitation. This is usually a one-time setup. If they already have a Summit Staffing coordinator account, you can look them up instead and request access.
        </Text>

        <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: Colors.text.primary, marginBottom: Spacing.sm }}>
          Coordinator email
        </Text>
        <TextInput
          style={[inputStyle, { marginBottom: Spacing.md }]}
          placeholder="coordinator@example.com"
          placeholderTextColor={Colors.text.muted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <Pressable
          onPress={sendInviteEmail}
          disabled={inviting}
          style={({ pressed }) => ({
            backgroundColor: Colors.primary,
            borderRadius: Radius.md,
            paddingVertical: Spacing.md,
            alignItems: 'center',
            opacity: pressed || inviting ? 0.85 : 1,
            marginBottom: Spacing.sm,
          })}
        >
          {inviting ? (
            <ActivityIndicator color={Colors.text.white} />
          ) : (
            <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>Send email invitation</Text>
          )}
        </Pressable>

        <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginBottom: Spacing.md, textAlign: 'center' }}>
          They will receive a sign-up link (email must be configured on the server).
        </Text>

        <Pressable
          onPress={runSearch}
          disabled={searching}
          style={({ pressed }) => ({
            backgroundColor: Colors.surface,
            borderWidth: 2,
            borderColor: Colors.primary,
            borderRadius: Radius.md,
            paddingVertical: Spacing.md,
            alignItems: 'center',
            opacity: pressed || searching ? 0.85 : 1,
            marginBottom: Spacing.lg,
          })}
        >
          {searching ? (
            <ActivityIndicator color={Colors.primary} />
          ) : (
            <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.semibold }}>Look up existing coordinator</Text>
          )}
        </Pressable>

        {!hasSearched || searching ? null : result === null ? (
          <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, ...Shadows.sm }}>
            <Text style={{ color: Colors.text.secondary, textAlign: 'center', marginBottom: Spacing.sm }}>
              No coordinator account found for this email yet.
            </Text>
            <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.xs, textAlign: 'center' }}>
              Use “Send email invitation” above so they can create an account from the link.
            </Text>
          </View>
        ) : (
          <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, ...Shadows.sm }}>
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.muted, marginBottom: Spacing.xs }}>Coordinator</Text>
            <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>
              {result.display_name}
            </Text>
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.xs }}>{result.email}</Text>
            <Pressable
              onPress={sendRequest}
              disabled={requesting}
              style={({ pressed }) => ({
                marginTop: Spacing.md,
                backgroundColor: Colors.status.success,
                borderRadius: Radius.md,
                paddingVertical: Spacing.md,
                alignItems: 'center',
                opacity: pressed || requesting ? 0.85 : 1,
              })}
            >
              {requesting ? (
                <ActivityIndicator color={Colors.text.white} />
              ) : (
                <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>Request to manage my account</Text>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
