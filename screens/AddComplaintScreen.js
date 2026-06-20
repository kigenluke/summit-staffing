import React, { useMemo, useState, useRef, createElement } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Alert, Platform, ActivityIndicator, Image } from 'react-native';
import { api } from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';
import { MinLengthHint, SubmitRequirements } from '../components/MinLengthHint.js';

const MIN_DETAILS_LEN = 5;

export function AddComplaintScreen({ navigation }) {
  const { user } = useAuthStore();
  const isWorker = user?.role === 'worker';
  const isParticipant = user?.role === 'participant';
  const canUse = isWorker || isParticipant;
  const complaintEndpoint = isWorker ? '/api/complaints' : '/api/participants/me/complaints';

  const [loading, setLoading] = useState(false);
  const [complaintDetails, setComplaintDetails] = useState('');
  const [selectedImages, setSelectedImages] = useState([]);
  const imageInputRef = useRef(null);

  const canSubmit = useMemo(() => {
    const detailsOk = complaintDetails.trim().length >= MIN_DETAILS_LEN;
    return canUse && detailsOk && !loading;
  }, [complaintDetails, canUse, loading]);

  const submitRequirements = useMemo(() => [
    { label: `Complaint details — at least ${MIN_DETAILS_LEN} characters`, met: complaintDetails.trim().length >= MIN_DETAILS_LEN },
  ], [complaintDetails]);

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

  const addPhotosNative = () => {
    if (selectedImages.length >= 5) return;
    try {
      const pickerLib = require('react-native-image-picker');
      const launch = pickerLib?.launchImageLibrary;
      if (typeof launch !== 'function') {
        Alert.alert('Unavailable', 'Image picker is not available on this device.');
        return;
      }
      launch(
        { mediaType: 'photo', selectionLimit: Math.min(5, 5 - selectedImages.length) },
        (response) => {
          if (response?.didCancel) return;
          if (response?.errorCode) {
            Alert.alert('Error', response.errorMessage || 'Failed to pick image');
            return;
          }
          const assets = response?.assets || [];
          const mapped = assets.map((a) => ({
            file: {
              uri: a.uri,
              name: a.fileName || `photo_${Date.now()}.jpg`,
              type: a.type || 'image/jpeg',
            },
            previewUrl: a.uri,
          }));
          setSelectedImages((prev) => [...prev, ...mapped].slice(0, 5));
        },
      );
    } catch (_) {
      Alert.alert('Unavailable', 'Image picker is not available right now.');
    }
  };

  const submit = async () => {
    if (!canUse) return;
    if (complaintDetails.trim().length < MIN_DETAILS_LEN) {
      Alert.alert('Missing details', `Please enter complaint details (minimum ${MIN_DETAILS_LEN} characters).`);
      return;
    }

    setLoading(true);
    try {
      const form = new FormData();
      form.append('complaint_details', complaintDetails.trim());
      for (const it of selectedImages) {
        form.append('images', it.file);
      }

      const { error } = await api.post(complaintEndpoint, form);

      if (error) {
        const hint = error.response?.hint;
        Alert.alert('Error', hint ? `${error.message}\n\n${hint}` : error.message || 'Could not submit complaint');
        return;
      }

      setComplaintDetails('');
      setSelectedImages([]);
      Alert.alert('Complaint submitted', 'We will let you know shortly.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', 'Could not submit complaint');
    } finally {
      setLoading(false);
    }
  };

  if (!canUse) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center', padding: Spacing.lg }}>
        <Text style={{ color: Colors.status.warning, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.lg }}>
          This feature is for participant and worker accounts only.
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
          Describe what happened. You can attach up to 5 images (optional). We will review and follow up.
        </Text>
      </View>

      <View style={{ marginBottom: Spacing.lg }}>
        <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, marginBottom: 6 }}>Complaint images (optional)</Text>

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
                onPickFilesWeb(e?.target?.files);
              },
              style: { width: '100%' },
            })}
            <Text style={{ marginTop: Spacing.xs, color: Colors.text.muted, fontSize: Typography.fontSize.xs }}>
              Up to 5 images.
            </Text>
          </View>
        ) : (
          <View>
            <Pressable
              onPress={addPhotosNative}
              disabled={selectedImages.length >= 5}
              style={({ pressed }) => ({
                alignSelf: 'flex-start',
                backgroundColor: Colors.surfaceSecondary,
                borderWidth: 1,
                borderColor: Colors.border,
                borderRadius: Radius.md,
                paddingVertical: Spacing.sm,
                paddingHorizontal: Spacing.md,
                opacity: selectedImages.length >= 5 ? 0.5 : pressed ? 0.85 : 1,
                marginBottom: Spacing.sm,
              })}
            >
              <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.semibold }}>
                Add photos (up to 5)
              </Text>
            </Pressable>
            <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.xs }}>
              {selectedImages.length}/5 selected
            </Text>
          </View>
        )}

        {selectedImages.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: Spacing.sm }}>
            {selectedImages.map((it, idx) => (
              <View
                key={`${it.previewUrl}-${idx}`}
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
                }}
              >
                <Image
                  source={{ uri: it.previewUrl }}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
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
        <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm, marginBottom: 6 }}>
          Complaint details <Text style={{ color: Colors.text.muted }}>(minimum {MIN_DETAILS_LEN} characters)</Text>
        </Text>
        <TextInput
          value={complaintDetails}
          onChangeText={setComplaintDetails}
          placeholder={`Describe your complaint in detail (min ${MIN_DETAILS_LEN} characters)...`}
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
            textAlignVertical: 'top',
          }}
        />
        <MinLengthHint value={complaintDetails} min={MIN_DETAILS_LEN} />
      </View>

      {!canSubmit && !loading ? <SubmitRequirements items={submitRequirements} /> : null}

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
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>
            {canSubmit ? 'Submit Complaint' : `Write at least ${MIN_DETAILS_LEN} characters to send`}
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}
