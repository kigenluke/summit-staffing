/**
 * Summit Staffing – Edit Profile Screen
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../store/authStore.js';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';

/** Address suggestions: only via backend GET /api/maps/autocomplete (Railway env keys — no Vite/Google key in frontend). */

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
  const [addressFocused, setAddressFocused] = useState(false);
  const [addressPredictions, setAddressPredictions] = useState([]);
  const [loadingAddressPredictions, setLoadingAddressPredictions] = useState(false);
  const [addressSuggestError, setAddressSuggestError] = useState('');
  const [addressSuggestHint, setAddressSuggestHint] = useState('');
  const [bio, setBio] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [ndisNumber, setNdisNumber] = useState('');
  const addressDebounceRef = useRef(null);

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
    } catch (e) {}
    setLoading(false);
  }, [isWorker]);

  useEffect(() => { loadProfile(); }, [loadProfile]);
  useEffect(() => {
    return () => {
      if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);
    };
  }, []);

  const fetchAddressPredictions = useCallback(async (query) => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setAddressPredictions([]);
      setAddressSuggestError('');
      setAddressSuggestHint('');
      setLoadingAddressPredictions(false);
      return;
    }

    setLoadingAddressPredictions(true);
    setAddressSuggestError('');
    setAddressSuggestHint('');
    try {
      const { data, error } = await api.get(`/api/maps/autocomplete?input=${encodeURIComponent(trimmed)}`);
      if (!error && data?.ok && Array.isArray(data.predictions)) {
        setAddressPredictions(data.predictions);
        return;
      }

      if (error) {
        setAddressPredictions([]);
        const msg = (error.message || '').trim();
        const is404 = error.status === 404 || msg === 'Route not found';
        const isNet = error.status === 0 || /failed to fetch|networkerror|load failed/i.test(msg);
        if (is404) {
          setAddressSuggestError('Address search is not available on this API (404).');
          setAddressSuggestHint(
            'Deploy the latest backend to Railway (it must include GET /api/maps/autocomplete). Set VITE_PROXY_TARGET in .env.local to that Railway service URL and restart npm run web.',
          );
        } else if (isNet) {
          setAddressSuggestError(msg || 'Network error.');
          setAddressSuggestHint('Check internet; DevTools → Network → turn OFF "Offline". Ensure VITE_PROXY_TARGET points to your Railway API.');
        } else {
          setAddressSuggestError(msg || 'Could not load suggestions.');
          setAddressSuggestHint('Railway: set GOOGLE_MAPS_SERVER_KEY or GOOGLE_MAPS_API_KEY (or BROWSER_KEY) and enable Places API for that key.');
        }
        return;
      }

      setAddressPredictions([]);
      setAddressSuggestError(data?.error || 'Could not load suggestions.');
      setAddressSuggestHint(
        'Railway env: GOOGLE_MAPS_* + Places API enabled. Server keys must not be "HTTP referrer only" restrictions.',
      );
    } catch (e) {
      setAddressPredictions([]);
      setAddressSuggestError((e && e.message) || 'Could not load suggestions.');
      setAddressSuggestHint('Check VITE_PROXY_TARGET and Railway backend.');
    } finally {
      setLoadingAddressPredictions(false);
    }
  }, []);

  const handleAddressChange = useCallback((text) => {
    setAddress(text);
    if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);
    if (text.trim().length < 3) {
      setAddressPredictions([]);
      setAddressSuggestError('');
      setAddressSuggestHint('');
      return;
    }
    addressDebounceRef.current = setTimeout(() => {
      fetchAddressPredictions(text);
    }, 300);
  }, [fetchAddressPredictions]);

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
    >
      {/* Avatar */}
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

      {/* Editable Fields */}
      <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadows.sm }}>
        <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.md }}>
          Personal Information
        </Text>

        <Field label="First Name" value={firstName} onChangeText={setFirstName} placeholder="First name" />
        <Field label="Last Name" value={lastName} onChangeText={setLastName} placeholder="Last name" />
        <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="Phone number" keyboardType="phone-pad" />
        <View style={{ marginBottom: Spacing.md, zIndex: 10 }}>
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: 4 }}>Address</Text>
          <TextInput
            style={{
              backgroundColor: Colors.surfaceSecondary,
              borderWidth: 2,
              borderColor: addressFocused ? Colors.primary : Colors.border,
              borderRadius: Radius.md,
              paddingVertical: Spacing.sm,
              paddingHorizontal: Spacing.md,
              fontSize: Typography.fontSize.base,
              color: Colors.text.primary,
            }}
            value={address}
            onChangeText={handleAddressChange}
            placeholder="Start typing street, suburb, or city"
            placeholderTextColor={Colors.text.muted}
            onFocus={() => {
              setAddressFocused(true);
              if (address.trim().length >= 3) fetchAddressPredictions(address);
            }}
            onBlur={() => {
              // Keep list visible briefly so item taps are registered.
              setTimeout(() => setAddressFocused(false), 120);
            }}
          />
          {addressFocused && (
            <View
              style={{
                marginTop: Spacing.sm,
                borderWidth: 1,
                borderColor: Colors.primaryLight,
                borderRadius: Radius.md,
                backgroundColor: Colors.surface,
                overflow: 'hidden',
                ...Shadows.lg,
                maxHeight: 280,
              }}
            >
              <View style={{ paddingVertical: Spacing.xs, paddingHorizontal: Spacing.md, backgroundColor: Colors.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                <Text style={{ fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold, color: Colors.text.secondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Address suggestions
                </Text>
              </View>
              {loadingAddressPredictions ? (
                <View style={{ paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={{ color: Colors.text.muted, marginTop: Spacing.sm }}>Searching places…</Text>
                </View>
              ) : addressSuggestError ? (
                <View style={{ paddingVertical: Spacing.md, paddingHorizontal: Spacing.md }}>
                  <Text style={{ color: Colors.status.error, fontSize: Typography.fontSize.sm }}>{addressSuggestError}</Text>
                  <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.xs, marginTop: Spacing.xs }}>
                    {addressSuggestHint}
                  </Text>
                </View>
              ) : addressPredictions.length > 0 ? (
                <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                  {addressPredictions.slice(0, 8).map((item) => (
                    <Pressable
                      key={item.place_id}
                      onPress={() => {
                        setAddress(item.description || '');
                        setAddressPredictions([]);
                        setAddressSuggestError('');
                        setAddressSuggestHint('');
                        setAddressFocused(false);
                      }}
                      style={({ pressed }) => ({
                        paddingVertical: Spacing.md,
                        paddingHorizontal: Spacing.md,
                        borderBottomWidth: 1,
                        borderBottomColor: Colors.borderLight,
                        backgroundColor: pressed ? 'rgba(34, 211, 238, 0.18)' : Colors.surface,
                      })}
                    >
                      <Text style={{ color: Colors.text.primary, fontSize: Typography.fontSize.base }}>{item.description}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : address.trim().length >= 3 ? (
                <View style={{ paddingVertical: Spacing.md, paddingHorizontal: Spacing.md }}>
                  <Text style={{ color: Colors.text.muted }}>No matches yet — try a street name or suburb.</Text>
                </View>
              ) : null}
            </View>
          )}
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

      {/* Read-only Account Info */}
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

      {/* Buttons */}
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
