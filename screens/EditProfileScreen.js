/**
 * Summit Staffing – Edit Profile Screen
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Alert, ActivityIndicator, Platform, StyleSheet } from 'react-native';
import * as PlacesPkg from 'react-native-google-places-autocomplete';
import { useAuthStore } from '../store/authStore.js';
import { api, ApiConfig } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';

/** Same browser key as Google Cloud / Railway GOOGLE_MAPS_BROWSER_KEY — not sent to athletic-heart API. */
function getGooglePlacesBrowserKey() {
  if (typeof process !== 'undefined' && process.env) {
    const processKey = (
      process.env.GOOGLE_MAPS_BROWSER_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ||
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
      ''
    );
    if (processKey) return processKey;
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
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [placesUnavailable, setPlacesUnavailable] = useState(false);
  const [bio, setBio] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [maxTravelKm, setMaxTravelKm] = useState('');
  const [ndisNumber, setNdisNumber] = useState('');

  const placesRef = useRef(null);
  const lastSelectedAddressRef = useRef('');
  const PlacesAutocompleteComponent = (
    PlacesPkg?.GooglePlacesAutocomplete ||
    PlacesPkg?.default?.GooglePlacesAutocomplete ||
    PlacesPkg?.default ||
    null
  );

  const googleKey = getGooglePlacesBrowserKey();
  const isWeb = Platform.OS === 'web';
  const placesProxyBaseUrl = isWeb
    ? (typeof window !== 'undefined' ? window.location.origin : '')
    : String(ApiConfig?.baseURL || 'https://athletic-heart-backend-production.up.railway.app').replace(/\/$/, '');
  const canUsePlacesAutocomplete = !!PlacesAutocompleteComponent && !!placesProxyBaseUrl;
  const placesQueryKey = googleKey || 'places-proxy-key';

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
          setLatitude(p.latitude != null ? Number(p.latitude) : null);
          setLongitude(p.longitude != null ? Number(p.longitude) : null);
          if (isWorker) {
            setBio(p.bio || '');
            setHourlyRate(p.hourly_rate ? String(p.hourly_rate) : '');
            setMaxTravelKm(p.max_travel_km ? String(p.max_travel_km) : '');
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
    if (!loading && address && placesRef.current?.setAddressText) {
      placesRef.current.setAddressText(address);
    }
  }, [loading, address]);

  const placesRequestUrl = canUsePlacesAutocomplete
    ? { url: `${placesProxyBaseUrl}/__places-proxy`, useOnPlatform: 'all' }
    : undefined;

  const saveProfile = async () => {
    setSaving(true);
    try {
      const profileId = profile?.id;
      if (!profileId) {
        Alert.alert('Error', 'Unable to save profile right now. Please refresh and try again.');
        setSaving(false);
        return;
      }
      const endpoint = isWorker ? '/api/workers/me' : `/api/participants/${profileId}`;
      const body = { first_name: firstName, last_name: lastName, phone, address };

      // Preserve geo coords when user edits other fields only.
      // (Some address-input re-renders can temporarily clear latitude/longitude state.)
      const originalLat = profile?.latitude != null ? Number(profile.latitude) : null;
      const originalLng = profile?.longitude != null ? Number(profile.longitude) : null;
      const addressChanged = (profile?.address || '') !== (address || '');

      if (!addressChanged) {
        body.latitude = originalLat;
        body.longitude = originalLng;
      } else if (latitude != null && longitude != null) {
        body.latitude = latitude;
        body.longitude = longitude;
      } else {
        body.latitude = null;
        body.longitude = null;
      }
      if (isWorker) {
        body.bio = bio;
        body.hourly_rate = parseFloat(hourlyRate) || 0;
        body.max_travel_km = maxTravelKm ? (parseFloat(maxTravelKm) || 0) : null;
      }
      else {
        const cleanedNdis = String(ndisNumber || '').trim();
        body.ndis_number = cleanedNdis || null;
      }

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

        <View style={{ marginBottom: Spacing.md, zIndex: 2000, position: 'relative' }}>
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: 4 }}>Address</Text>
          {!canUsePlacesAutocomplete ? (
            <>
              <TextInput
                style={{
                  backgroundColor: Colors.surfaceSecondary,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  borderRadius: Radius.md,
                  paddingVertical: Spacing.sm,
                  paddingHorizontal: Spacing.md,
                  fontSize: Typography.fontSize.base,
                  color: Colors.text.primary,
                }}
                value={address}
                onChangeText={setAddress}
                placeholder="Enter address manually"
                placeholderTextColor={Colors.text.muted}
              />
              <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.xs, marginTop: Spacing.xs }}>
                {!PlacesAutocompleteComponent
                  ? 'Address suggestions are unavailable on this build. You can still type address manually.'
                  : placesUnavailable
                    ? 'Address suggestions are temporarily unavailable. You can still type address manually.'
                    : 'Start typing to see address suggestions.'}
              </Text>
            </>
          ) : (
            <PlacesAutocompleteComponent
              ref={placesRef}
              placeholder="Start typing street, suburb, or city"
              onPress={async (data, details) => {
                const selectedAddress = data.description || data.formatted_address || '';
                lastSelectedAddressRef.current = selectedAddress;
                setAddress(selectedAddress);
                let lat = details?.geometry?.location?.lat;
                let lng = details?.geometry?.location?.lng;

                if ((typeof lat !== 'number' || typeof lng !== 'number') && data?.place_id) {
                  try {
                    const detailsPath = `/api/places/details?place_id=${encodeURIComponent(
                      data.place_id
                    )}&language=en`;
                    const { data: detailsRes } = await api.get(detailsPath);
                    lat = detailsRes?.result?.geometry?.location?.lat;
                    lng = detailsRes?.result?.geometry?.location?.lng;
                  } catch (_) {}
                }

                if (typeof lat === 'number' && typeof lng === 'number') {
                  setLatitude(lat);
                  setLongitude(lng);
                  setPlacesUnavailable(false);
                } else {
                  setLatitude(null);
                  setLongitude(null);
                }
                if (placesRef.current?.blur) placesRef.current.blur();
              }}
              onFail={() => {
                // Avoid disruptive popups on transient network/key hiccups.
                setPlacesUnavailable(true);
              }}
              query={{
                key: placesQueryKey,
                language: 'en',
              }}
              requestUrl={placesRequestUrl}
              fetchDetails={false}
              debounce={300}
              minLength={2}
              enablePoweredByContainer={false}
              keyboardShouldPersistTaps="handled"
              keepResultsAfterBlur={false}
              suppressDefaultStyles
              styles={{
                container: { flex: 0 },
                textInputContainer: { backgroundColor: 'transparent' },
                textInput: {
                  backgroundColor: Colors.surfaceSecondary,
                  borderWidth: 1.5,
                  borderColor: Colors.border,
                  borderRadius: Radius.md,
                  paddingVertical: Spacing.sm,
                  paddingHorizontal: Spacing.md,
                  fontSize: Typography.fontSize.base,
                  color: Colors.text.primary,
                  height: 46,
                },
                listView: {
                  position: 'absolute',
                  top: 52,
                  left: 0,
                  right: 0,
                  zIndex: 99999,
                  elevation: 10,
                  backgroundColor: Colors.surface,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  borderRadius: Radius.md,
                  marginTop: 6,
                  maxHeight: 240,
                  overflow: 'hidden',
                  overflowY: 'auto',
                  ...Shadows.md,
                },
                row: {
                  backgroundColor: Colors.surface,
                  paddingVertical: Spacing.sm,
                  paddingHorizontal: Spacing.md,
                },
                separator: { height: StyleSheet.hairlineWidth, backgroundColor: Colors.borderLight },
                description: {
                  fontSize: Typography.fontSize.sm,
                  lineHeight: 20,
                  color: Colors.text.primary,
                },
              }}
              textInputProps={{
                placeholderTextColor: Colors.text.muted,
                onChangeText: (txt) => {
                  setAddress(txt);
                  // Keep coordinates when value is exactly the selected suggestion text.
                  if (txt === lastSelectedAddressRef.current) return;
                  // Manual typing may no longer map to selected place => clear coords.
                  setLatitude(null);
                  setLongitude(null);
                },
              }}
            />
          )}
        </View>

        {isWorker && (
          <>
            <Field label="Bio" value={bio} onChangeText={setBio} placeholder="Tell participants about yourself..." />
            <Field label="Hourly Rate ($)" value={hourlyRate} onChangeText={setHourlyRate} placeholder="e.g. 55.00" keyboardType="numeric" />
            <Field label="Travel Distance (km)" value={maxTravelKm} onChangeText={setMaxTravelKm} placeholder="e.g. 20" keyboardType="numeric" />
          </>
        )}
        {!isWorker && (
          <Field label="NDIS Number" value={ndisNumber} onChangeText={setNdisNumber} placeholder="10-digit NDIS number" />
        )}
      </View>

      <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.lg, ...Shadows.sm, position: 'relative', zIndex: -9999 }}>
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

      <View style={{ flexDirection: 'row' }}>
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
            flex: 2, marginLeft: Spacing.sm, backgroundColor: saving ? Colors.text.muted : Colors.primary,
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