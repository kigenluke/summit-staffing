/**
 * Participant: search coordinator by email and request account management.
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
  const [hasSearched, setHasSearched] = useState(false);
  const [result, setResult] = useState(null);

  const runSearch = async () => {
    const q = email.trim();
    if (!q) {
      Alert.alert('Email required', 'Enter an email address to search.');
      return;
    }
    setSearching(true);
    setHasSearched(true);
    setResult(null);
    try {
      const { data, error } = await api.get(`/api/participants/search-coordinator?email=${encodeURIComponent(q)}`);
      if (error || !data?.ok) {
        Alert.alert('Search failed', error?.message || data?.error || 'Could not search.');
        setSearching(false);
        return;
      }
      setResult(data.coordinator);
    } catch (_) {
      Alert.alert('Search failed', 'Could not search.');
    }
    setSearching(false);
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
        <Text style={{ fontSize: Typography.fontSize.base, color: Colors.text.secondary, marginBottom: Spacing.md }}>
          Search coordinator by email to invite them to manage your account
        </Text>

        <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: Colors.text.primary, marginBottom: Spacing.sm }}>
          Email
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
          onPress={runSearch}
          disabled={searching}
          style={({ pressed }) => ({
            backgroundColor: Colors.primary,
            borderRadius: Radius.md,
            paddingVertical: Spacing.md,
            alignItems: 'center',
            opacity: pressed || searching ? 0.85 : 1,
            marginBottom: Spacing.lg,
          })}
        >
          {searching ? (
            <ActivityIndicator color={Colors.text.white} />
          ) : (
            <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>Search</Text>
          )}
        </Pressable>

        {!hasSearched || searching ? null : result === null ? (
          <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, ...Shadows.sm }}>
            <Text style={{ color: Colors.text.secondary, textAlign: 'center' }}>No coordinator found for this email.</Text>
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
                <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>Request</Text>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
