import React, { useMemo, useRef, useState, createElement } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Alert, Platform, ActivityIndicator, Image } from 'react-native';
import { api } from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';

export function AddIncidentScreen({ navigation }) {
  const { user } = useAuthStore();
  const isWorker = user?.role === 'worker';

  const [loading, setLoading] = useState(false);
  const [incidentName, setIncidentName] = useState('');
  const [incidentDetails, setIncidentDetails] = useState('');
  const [triageCategory, setTriageCategory] = useState('other');
  const [called000, setCalled000] = useState(false);

  // Web only: store {file, previewUrl}
  const [selectedImages, setSelectedImages] = useState([]);

  const canSubmit = useMemo(() => {
    const nameOk = incidentName.trim().length >= 2;
    const detailsOk = incidentDetails.trim().length >= 5;
    return isWorker && nameOk && detailsOk && !!triageCategory && typeof called000 === 'boolean' && !loading;
  }, [incidentName, incidentDetails, isWorker, loading, triageCategory, called000]);

  const imageInputRef = useRef(null);

  const onPickFilesWeb = (files) => {
    const list = Array.from(files || []);
    const mapped = list.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setSelectedImages((prev) => [...prev, ...mapped].slice(0, 5));
  };

  const removeImageAt = (idx) => {
    setSelectedImages((prev) => {
      const next = [...prev];
      const removed = next[idx];
      try {
        removed?.previewUrl && URL.revokeObjectURL(removed.previewUrl);
      } catch (_) {}
      next.splice(idx, 1);
      return next;
    });
  };

  const submit = async () => {
    if (!isWorker) return;
    if (incidentName.trim().length < 2) {
      Alert.alert('Missing name', 'Please enter incident name.');
      return;
    }
    if (incidentDetails.trim().length < 5) {
      Alert.alert('Missing details', 'Please enter incident details (min 5 characters).');
      return;
    }

    setLoading(true);
    try {
      const form = new FormData();
      form.append('incident_name', incidentName.trim());
      form.append('incident_details', incidentDetails.trim());
      form.append('triage_category', triageCategory);
      form.append('called_000', called000 ? 'true' : 'false');

      for (const it of selectedImages) {
        // field name must be "images" because multer uses upload.array('images', 5)
        form.append('images', it.file);
      }

      const { error } = await api.post('/api/incidents', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (error) {
        Alert.alert('Error', error.message || 'Could not submit incident');
        return;
      }

      setIncidentName('');
      setIncidentDetails('');
      setSelectedImages([]);
      setTriageCategory('other');
      setCalled000(false);

      Alert.alert('Incident is reported', 'Thanks for letting us know.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', 'Could not submit incident');
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
          Report Incident
        </Text>
        <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm }}>
          Upload incident images and share details. We use this information to improve safety.
        </Text>
      </View>

      <View style={{ marginBottom: Spacing.lg }}>
        <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, marginBottom: 6 }}>Incident Name</Text>
        <TextInput
          value={incidentName}
          onChangeText={setIncidentName}
          placeholder="e.g. Slip and fall"
          placeholderTextColor={Colors.text.muted}
          style={{
            backgroundColor: Colors.surface,
            borderWidth: 1,
            borderColor: Colors.border,
            borderRadius: Radius.md,
            paddingVertical: Spacing.sm,
            paddingHorizontal: Spacing.md,
            color: Colors.text.primary,
          }}
        />
      </View>

      <View style={{ marginBottom: Spacing.lg }}>
        <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, marginBottom: 6 }}>Incident Images (optional)</Text>

        {Platform.OS === 'web' ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: Colors.border,
              borderRadius: Radius.md,
              padding: Spacing.md,
              backgroundColor: Colors.surface,
              marginBottom: Spacing.sm,
            }}
          >
            {createElement('input', {
              ref: imageInputRef,
              type: 'file',
              accept: 'image/jpeg,image/png,image/webp,image/jpg',
              multiple: true,
              onChange: (e) => {
                const files = e?.target?.files;
                onPickFilesWeb(files);
              },
              style: { width: '100%' },
            })}
            <Text style={{ marginTop: Spacing.xs, color: Colors.text.muted, fontSize: Typography.fontSize.xs }}>
              You can upload up to 5 images.
            </Text>
          </View>
        ) : (
          <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.xs, marginBottom: Spacing.sm }}>
            Image upload is available on web. You can still submit incident details.
          </Text>
        )}

        {selectedImages.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {selectedImages.map((it, idx) => (
              <View
                key={it.previewUrl}
                style={{
                  width: 92,
                  height: 92,
                  borderRadius: 10,
                  backgroundColor: Colors.surfaceSecondary,
                  borderWidth: 1,
                  borderColor: Colors.borderLight,
                  overflow: 'hidden',
                  marginRight: Spacing.sm,
                  marginBottom: Spacing.sm,
                  justifyContent: 'flex-end',
                }}
              >
                <Image
                  source={{ uri: it.previewUrl }}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 26, width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
                <Pressable
                  onPress={() => removeImageAt(idx)}
                  style={({ pressed }) => ({
                    position: 'absolute',
                    right: 6,
                    top: 6,
                    backgroundColor: pressed ? `${Colors.status.error}99` : Colors.status.error,
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    alignItems: 'center',
                    justifyContent: 'center',
                  })}
                >
                  <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold, fontSize: 12 }}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={{ marginBottom: Spacing.xl }}>
        <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, marginBottom: 6 }}>Incident Details</Text>
        <TextInput
          value={incidentDetails}
          onChangeText={setIncidentDetails}
          placeholder="Describe what happened, location, and any relevant notes..."
          placeholderTextColor={Colors.text.muted}
          multiline
          numberOfLines={6}
          style={{
            backgroundColor: Colors.surface,
            borderWidth: 1,
            borderColor: Colors.border,
            borderRadius: Radius.md,
            paddingVertical: Spacing.sm,
            paddingHorizontal: Spacing.md,
            color: Colors.text.primary,
            minHeight: 130,
          }}
        />
      </View>

      <View style={{ marginBottom: Spacing.lg }}>
        <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, marginBottom: 10, fontWeight: Typography.fontWeight.semibold }}>
          Reporting Details (NDIS)
        </Text>

        {[
          { id: 'death_of_participant', label: 'Death of a participant' },
          { id: 'serious_injury', label: 'Serious injury' },
          { id: 'abuse_or_neglect', label: 'Abuse / neglect allegation' },
          { id: 'unlawful_physical_or_sexual_contact', label: 'Unlawful physical / sexual contact' },
          { id: 'sexual_misconduct', label: 'Sexual misconduct' },
          { id: 'restrictive_practice', label: 'Restrictive practice' },
          { id: 'other', label: 'Other' },
        ].map((opt) => {
          const selected = triageCategory === opt.id;
          return (
            <Pressable
              key={opt.id}
              onPress={() => setTriageCategory(opt.id)}
              style={({ pressed }) => ({
                backgroundColor: selected ? Colors.primary : Colors.surfaceSecondary,
                borderRadius: Radius.md,
                borderWidth: 1,
                borderColor: selected ? Colors.primary : Colors.border,
                paddingVertical: Spacing.sm,
                paddingHorizontal: Spacing.md,
                marginBottom: Spacing.sm,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: selected ? Colors.text.white : Colors.text.primary, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.sm }}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginBottom: Spacing.xl }}>
        <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, marginBottom: 10, fontWeight: Typography.fontWeight.semibold }}>
          Have you called 000?
        </Text>

        <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm }}>
          <Pressable
            onPress={() => setCalled000(true)}
            style={({ pressed }) => ({
              flex: 1,
              backgroundColor: called000 ? Colors.primary : Colors.surfaceSecondary,
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: called000 ? Colors.primary : Colors.border,
              paddingVertical: Spacing.sm,
              alignItems: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: called000 ? Colors.text.white : Colors.text.primary, fontWeight: Typography.fontWeight.semibold }}>
              Yes
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setCalled000(false)}
            style={({ pressed }) => ({
              flex: 1,
              backgroundColor: !called000 ? Colors.primary : Colors.surfaceSecondary,
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: !called000 ? Colors.primary : Colors.border,
              paddingVertical: Spacing.sm,
              alignItems: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: !called000 ? Colors.text.white : Colors.text.primary, fontWeight: Typography.fontWeight.semibold }}>
              No
            </Text>
          </Pressable>
        </View>

        <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.xs }}>
          If this is an emergency, call 000 immediately.
        </Text>
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
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>Submit Incident</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

