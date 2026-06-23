/**
 * Google Places address field — debounced, uncontrolled text to avoid re-fetch on unrelated parent re-renders.
 */
import React, { useRef, useState, useMemo, useCallback, useImperativeHandle, forwardRef } from 'react';
import { View, TextInput, Platform } from 'react-native';
import * as PlacesPkg from 'react-native-google-places-autocomplete';
import { PRODUCTION_API_URL } from '../constants/apiPublic.js';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';

function getGooglePlacesBrowserKey() {
  if (typeof process !== 'undefined' && process.env) {
    return (
      process.env.GOOGLE_MAPS_BROWSER_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ||
      process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
      ''
    );
  }
  return '';
}

const PlacesAutocompleteComponent = (
  PlacesPkg?.GooglePlacesAutocomplete ||
  PlacesPkg?.default?.GooglePlacesAutocomplete ||
  PlacesPkg?.default ||
  null
);

const isWeb = Platform.OS === 'web';
const placesProxyBaseUrl = isWeb
  ? (typeof window !== 'undefined' ? window.location.origin : '')
  : PRODUCTION_API_URL.replace(/\/$/, '');
const canUsePlacesAutocomplete = !!PlacesAutocompleteComponent && !!placesProxyBaseUrl;
const placesQueryKey = getGooglePlacesBrowserKey() || 'places-proxy-key';

const PLACES_QUERY = Object.freeze({
  key: placesQueryKey,
  language: 'en',
});

const PLACES_REQUEST_URL = canUsePlacesAutocomplete
  ? Object.freeze({ url: `${placesProxyBaseUrl}/__places-proxy`, useOnPlatform: 'all' })
  : undefined;

const INLINE_STYLES = {
  container: { flex: 1 },
  textInput: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text.primary,
    marginBottom: 0,
  },
  listView: {
    ...(isWeb
      ? { position: 'relative', top: 0, left: 0, right: 0, marginTop: 0 }
      : { position: 'absolute', top: 44, left: 0, right: 0 }),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    maxHeight: 220,
    overflow: 'auto',
    zIndex: 3000,
    ...Shadows.sm,
  },
  row: {
    padding: Spacing.md,
    backgroundColor: '#FFFFFF',
  },
  description: { color: Colors.text.primary, fontSize: Typography.fontSize.sm },
  separator: { height: 1, backgroundColor: Colors.borderLight },
};

export const LocationAutocompleteField = React.memo(
  forwardRef(function LocationAutocompleteField(
    {
      initialAddress = '',
      onAddressChange,
      onPlaceSelected,
      placeholder = 'Start typing your address',
      fallbackInputStyle,
      containerStyle,
    },
    ref
  ) {
    const placesRef = useRef(null);
    const lastSelectedRef = useRef('');
    const syncedAddressRef = useRef('');
    const [focused, setFocused] = useState(false);

    const applyAddressToInput = useCallback((text) => {
      const addr = String(text || '');
      lastSelectedRef.current = addr;
      syncedAddressRef.current = addr;
      if (placesRef.current?.setAddressText) {
        placesRef.current.setAddressText(addr);
      } else if (placesRef.current?.clear && !addr) {
        placesRef.current.clear();
      }
    }, []);

    useImperativeHandle(ref, () => ({
      clear() {
        applyAddressToInput('');
      },
      setAddressText(text) {
        applyAddressToInput(text);
      },
    }));

    React.useEffect(() => {
      const addr = String(initialAddress || '');
      if (addr === syncedAddressRef.current) return;
      applyAddressToInput(addr);
      const t = setTimeout(() => applyAddressToInput(addr), 120);
      return () => clearTimeout(t);
    }, [initialAddress, applyAddressToInput]);

    const handleTextChange = useCallback(
      (text) => {
        onAddressChange?.(text, { fromSelection: text === lastSelectedRef.current });
        setFocused(true);
      },
      [onAddressChange]
    );

    const handlePlacePress = useCallback(
      async (data, details) => {
        const desc = data?.description || data?.formatted_address || '';
        lastSelectedRef.current = desc;
        let lat = details?.geometry?.location?.lat;
        let lng = details?.geometry?.location?.lng;

        if ((typeof lat !== 'number' || typeof lng !== 'number') && data?.place_id) {
          try {
            const detailsPath = `/api/places/details?place_id=${encodeURIComponent(data.place_id)}&language=en`;
            const { data: detailsRes } = await api.get(detailsPath);
            lat = detailsRes?.result?.geometry?.location?.lat;
            lng = detailsRes?.result?.geometry?.location?.lng;
          } catch (_) {}
        }

        onPlaceSelected?.({
          address: desc,
          lat: typeof lat === 'number' ? lat : null,
          lng: typeof lng === 'number' ? lng : null,
        });
        if (placesRef.current?.setAddressText) placesRef.current.setAddressText(desc);
        if (placesRef.current?.blur) placesRef.current.blur();
        setFocused(false);
      },
      [onPlaceSelected]
    );

    const textInputProps = useMemo(
      () => ({
        placeholderTextColor: Colors.text.muted,
        onFocus: () => setFocused(true),
        onBlur: () => {
          setTimeout(() => setFocused(false), 150);
        },
        onChangeText: handleTextChange,
      }),
      [handleTextChange]
    );

    if (!canUsePlacesAutocomplete) {
      return (
        <TextInput
          style={fallbackInputStyle}
          value={initialAddress}
          placeholder={placeholder}
          placeholderTextColor={Colors.text.muted}
          onChangeText={(text) => onAddressChange?.(text, { fromSelection: false })}
        />
      );
    }

    return (
      <View style={containerStyle}>
        <PlacesAutocompleteComponent
          ref={placesRef}
          placeholder={placeholder}
          fetchDetails={false}
          minLength={3}
          debounce={700}
          onPress={handlePlacePress}
          query={PLACES_QUERY}
          requestUrl={PLACES_REQUEST_URL}
          styles={INLINE_STYLES}
          listViewDisplayed={focused ? 'auto' : false}
          keyboardShouldPersistTaps="handled"
          isRowScrollable
          enablePoweredByContainer={false}
          keepResultsAfterBlur={false}
          textInputProps={textInputProps}
        />
      </View>
    );
  })
);

LocationAutocompleteField.displayName = 'LocationAutocompleteField';
