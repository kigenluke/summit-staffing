/**
 * Summit Staffing – Edit Profile Screen
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Alert, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import PlacesPkg from 'react-native-google-places-autocomplete';
import { useAuthStore } from '../store/authStore.js';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';
import { LocationAutocomplete } from '../components/LocationAutoComplete.js';

const { GooglePlacesAutocomplete } = PlacesPkg;

/** Same browser key as Google Cloud / Railway GOOGLE_MAPS_BROWSER_KEY — not sent to athletic-heart API. */
function getGooglePlacesBrowserKey() {
  try {
    const env = import.meta.env;
    if (env?.VITE_GOOGLE_MAPS_BROWSER_KEY) return env.VITE_GOOGLE_MAPS_BROWSER_KEY;
    if (env?.VITE_GOOGLE_MAPS_API_KEY) return env.VITE_GOOGLE_MAPS_API_KEY;
  } catch (_) { }
  if (typeof process !== 'undefined' && process.env) {
    return (
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ||
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
      ''
    );
  }
  return '';
}

const Field = ({ label, value, onChangeText, placeholder, keyboardType, editable = true }) => (
  <View style={{ marginBottom: Spacing.md }}>
    <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: 4 }}>{label}</Text>
    <TextInput
      style={{
        backgroundColor: editable ? Colors.surfaceSecondary : Colors.border,
        borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
        paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
        fontSize: Typography.fontSize.base, color: Colors.text.primary,
      }}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={Colors.text.muted}
      keyboardType={keyboardType}
      editable={editable}
    />
  </View>
);

export function EditProfileScreen({ navigation }) {
  const { user } = useAuthStore();
  const isWorker = user?.role === 'worker';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [bio, setBio] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [ndisNumber, setNdisNumber] = useState('');

  const placesRef = useRef(null);
  const googleKey = getGooglePlacesBrowserKey();
  const isWeb = Platform.OS === 'web';
  // On web, the local /__places-proxy injects GOOGLE_MAPS_* from .env.local.
  // Library still requires a `query.key` field, so we pass a harmless placeholder if needed.
  const placesQueryKey = googleKey || (isWeb ? 'web-proxy-key' : '');

  const loadProfile = useCallback(async () => {
    try {
      const endpoint = isWorker ? '/api/workers/me' : '/api/participants/me';
      const { data } = await api.get(endpoint);
      if (data?.ok) {
        const p = isWorker ? data.worker : data.participant;
        if (p) {
          setProfile(p);
          setFirstName(p.first_name || '');
          setLastName(p.last_name || '');
          setPhone(p.phone || '');
          setAddress(p.address || '');
          if (isWorker) {
            setBio(p.bio || '');
            setHourlyRate(p.hourly_rate ? String(p.hourly_rate) : '');
          } else {
            setNdisNumber(p.ndis_number || '');
          }
        }
      }
    } catch (e) { }
    setLoading(false);
  }, [isWorker]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  useEffect(() => {
    if (!loading && address && placesRef.current?.setAddressText) {
      placesRef.current.setAddressText(address);
    }
  }, [loading, address]);

  const placesRequestUrl =
    Platform.OS === 'web' && typeof window !== 'undefined'
      ? { url: `${window.location.origin}/__places-proxy`, useOnPlatform: 'web' }
      : undefined;

  const saveProfile = async () => {
    setSaving(true);
    try {
      const endpoint = isWorker ? '/api/workers/me' : '/api/participants/me';
      const body = { first_name: firstName, last_name: lastName, phone, address };
      if (isWorker) { body.bio = bio; body.hourly_rate = parseFloat(hourlyRate) || 0; }
      else { body.ndis_number = ndisNumber; }

      const { data, error } = await api.put(endpoint, body);
      if (error) {
        Alert.alert('Error', error.message || 'Failed to save');
      } else {
        Alert.alert('Success', 'Profile updated!');
        navigation.goBack();
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to save profile');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
    >
      <View style={{ alignItems: 'center', marginBottom: Spacing.lg }}>
        <View style={{
          width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primary,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 32, color: Colors.text.white }}>
            {(firstName || user?.email || '?')[0].toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadows.sm, overflow: 'visible' }}>
        <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.md }}>
          Personal Information
        </Text>

        <Field label="First Name" value={firstName} onChangeText={setFirstName} placeholder="First name" />
        <Field label="Last Name" value={lastName} onChangeText={setLastName} placeholder="Last name" />
        <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="Phone number" keyboardType="phone-pad" />

        <View style={{ marginBottom: Spacing.md, zIndex: 20 }}>
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: 4 }}>
            Address
          </Text>
          <LocationAutocomplete
            value={address}
            onChange={setAddress}
          />
        </View>

        {isWorker && (
          <>
            <Field label="Bio" value={bio} onChangeText={setBio} placeholder="Tell participants about yourself..." />
            <Field label="Hourly Rate ($)" value={hourlyRate} onChangeText={setHourlyRate} placeholder="e.g. 55.00" keyboardType="numeric" />
          </>
        )}
        {!isWorker && (
          <Field label="NDIS Number" value={ndisNumber} onChangeText={setNdisNumber} placeholder="10-digit NDIS number" />
        )}
      </View>

      <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.lg, ...Shadows.sm }}>
        <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.md }}>
          Account Information
        </Text>
        <View style={{ marginBottom: Spacing.sm }}>
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.muted }}>Email</Text>
          <Text style={{ color: Colors.text.primary }}>{user?.email}</Text>
        </View>
        <View style={{ marginBottom: Spacing.sm }}>
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.muted }}>Role</Text>
          <Text style={{ color: Colors.text.primary, textTransform: 'capitalize' }}>{user?.role}</Text>
        </View>
        {isWorker && profile?.verification_status && (
          <View>
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.muted }}>Verification</Text>
            <Text style={{ color: profile.verification_status === 'verified' ? Colors.status.success : Colors.status.warning }}>
              {profile.verification_status === 'verified' ? 'Verified' : profile.verification_status}
            </Text>
          </View>
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => ({
            flex: 1, backgroundColor: Colors.surfaceSecondary, paddingVertical: Spacing.md,
            borderRadius: Radius.md, alignItems: 'center', opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ color: Colors.text.secondary, fontWeight: Typography.fontWeight.semibold }}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={saveProfile}
          disabled={saving}
          style={({ pressed }) => ({
            flex: 2, backgroundColor: saving ? Colors.text.muted : Colors.primary,
            paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center',
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
