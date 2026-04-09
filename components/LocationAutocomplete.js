import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, FlatList,
  Pressable, ActivityIndicator, StyleSheet
} from 'react-native';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius } from '../constants/theme.js';

export function LocationAutocomplete({ value, onChange, label = 'Address' }) {
  const [query, setQuery]             = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [open, setOpen]               = useState(false);
  const debounceRef                   = useRef(null);

  const fetchSuggestions = (text) => {
    setQuery(text);
    onChange(text);

    clearTimeout(debounceRef.current);
    if (text.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get(
          `/api/places/autocomplete?input=${encodeURIComponent(text)}`
        );
        if (data?.predictions) {
          setSuggestions(data.predictions);
          setOpen(true);
        }
      } catch (_) {}
      setLoading(false);
    }, 300);
  };

  const pick = (prediction) => {
    const picked = prediction.description;
    setQuery(picked);
    onChange(picked);
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <View style={{ marginBottom: Spacing.md, zIndex: 30 }}>
      <View>
        <TextInput
          value={query}
          onChangeText={fetchSuggestions}
          placeholder="Start typing an address or suburb"
          placeholderTextColor={Colors.text.muted}
          style={{
            backgroundColor: Colors.surfaceSecondary,
            borderWidth: 1,
            borderColor: open ? Colors.primary : Colors.border,
            borderRadius: Radius.md,
            paddingVertical: Spacing.sm,
            paddingHorizontal: Spacing.md,
            fontSize: Typography.fontSize.base,
            color: Colors.text.primary,
            height: 48,
          }}
        />
        {loading && (
          <ActivityIndicator
            size="small"
            color={Colors.primary}
            style={{ position: 'absolute', right: 12, top: 12 }}
          />
        )}
      </View>

      {open && suggestions.length > 0 && (
        <FlatList
          data={suggestions}
          keyExtractor={(item) => item.place_id}
          scrollEnabled={false}
          style={{
            backgroundColor: Colors.surface,
            borderWidth: 1,
            borderTopWidth: 0,
            borderColor: Colors.border,
            borderBottomLeftRadius: Radius.md,
            borderBottomRightRadius: Radius.md,
            maxHeight: 220,
          }}
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => pick(item)}
              style={({ pressed }) => ({
                padding: Spacing.md,
                backgroundColor: pressed
                  ? Colors.surfaceSecondary
                  : Colors.surface,
                borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                borderColor: Colors.border,
              })}
            >
              <Text style={{
                fontSize: Typography.fontSize.base,
                color: Colors.text.primary,
                fontWeight: '500',
              }}>
                {item.structured_formatting?.main_text || item.description}
              </Text>
              {item.structured_formatting?.secondary_text && (
                <Text style={{
                  fontSize: Typography.fontSize.sm,
                  color: Colors.text.muted,
                  marginTop: 2,
                }}>
                  {item.structured_formatting.secondary_text}
                </Text>
              )}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}