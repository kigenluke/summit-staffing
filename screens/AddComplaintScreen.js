import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Alert, Platform, ActivityIndicator } from 'react-native';
import { api } from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';

export function AddComplaintScreen({ navigation }) {
  const { user } = useAuthStore();
  const isWorker = user?.role === 'worker';

  const [loading, setLoading] = useState(false);
  const [complaintDetails, setComplaintDetails] = useState('');

  const canSubmit = useMemo(() => {
    const detailsOk = complaintDetails.trim().length >= 5;
    return isWorker && detailsOk && !loading;
  }, [complaintDetails, isWorker, loading]);

  const submit = async () => {
    if (!isWorker) return;
    if (complaintDetails.trim().length < 5) {
      Alert.alert('Missing details', 'Please enter complaint details (min 5 characters).');
      return;
    }

    setLoading(true);
    try {
      const { error } = await api.post('/api/complaints', {
        complaint_details: complaintDetails.trim(),
      });

      if (error) {
        Alert.alert('Error', error.message || 'Could not submit complaint');
        return;
      }

      setComplaintDetails('');
      Alert.alert('Complaint submitted', 'We will let you know shortly.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', 'Could not submit complaint');
    } finally {
      setLoading(false);
    }
  };

  if (!isWorker) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', padding: Spacing.lg }}>
        <Text style={{ color: Colors.status.warning, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.lg }}>
          This feature is for worker accounts only.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
    >
      <View style={{ marginBottom: Spacing.lg, borderRadius: Radius.lg, backgroundColor: Colors.surface, ...Shadows.sm, padding: Spacing.lg }}>
        <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: 6 }}>
          Submit Complaint
        </Text>
        <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm }}>
          Write what happened and share the relevant details. We'll review it and follow up.
        </Text>
      </View>

      <View style={{ marginBottom: Spacing.xl }}>
        <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, marginBottom: 6 }}>Complaint Details</Text>
        <TextInput
          value={complaintDetails}
          onChangeText={setComplaintDetails}
          placeholder="Describe your complaint in detail..."
          placeholderTextColor={Colors.text.muted}
          multiline
          numberOfLines={8}
          style={{
            backgroundColor: Colors.surface,
            borderWidth: 1,
            borderColor: Colors.border,
            borderRadius: Radius.md,
            paddingVertical: Spacing.sm,
            paddingHorizontal: Spacing.md,
            color: Colors.text.primary,
            minHeight: 150,
          }}
        />
      </View>

      <Pressable
        onPress={submit}
        disabled={!canSubmit}
        style={({ pressed }) => ({
          backgroundColor: canSubmit ? Colors.primary : Colors.text.muted,
          opacity: pressed ? 0.9 : 1,
          borderRadius: Radius.md,
          paddingVertical: Spacing.md,
          alignItems: 'center',
          ...(canSubmit ? {} : { cursor: Platform.OS === 'web' ? 'not-allowed' : undefined }),
        })}
      >
        {loading ? (
          <ActivityIndicator size="small" color={Colors.text.white} />
        ) : (
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>Submit Complaint</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

