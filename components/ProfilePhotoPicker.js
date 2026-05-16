/**
 * Profile photo picker + upload (web file input, native image library).
 */
import React, { useRef, useState, createElement } from 'react';
import { View, Text, Pressable, Image, ActivityIndicator, Alert, Platform } from 'react-native';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography } from '../constants/theme.js';

export function ProfilePhotoPicker({
  imageUrl,
  onImageUrlChange,
  uploadPath,
  fallbackLetter = '?',
  size = 96,
  disabled = false,
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const setFileInputRef = (el) => {
    fileInputRef.current = el;
  };

  const uploadFile = async (file) => {
    if (!uploadPath || !file) return;
    setUploading(true);
    try {
      const form = new FormData();
      if (Platform.OS === 'web') {
        form.append('file', file, file.name || 'profile.jpg');
      } else {
        form.append('file', {
          uri: file.uri,
          name: file.fileName || file.name || 'profile.jpg',
          type: file.type || 'image/jpeg',
        });
      }

      const { data, error } = await api.post(uploadPath, form);
      if (error) {
        Alert.alert('Upload failed', error.message || 'Could not upload photo');
        return;
      }

      const url =
        data?.participant?.profile_image_url
        || data?.worker?.profile_image_url
        || data?.coordinator?.profile_image_url
        || null;

      if (url && onImageUrlChange) {
        onImageUrlChange(url);
        Alert.alert('Success', 'Profile photo updated');
      }
    } catch (_) {
      Alert.alert('Upload failed', 'Could not upload photo');
    } finally {
      setUploading(false);
    }
  };

  const pickNative = () => {
    if (disabled || uploading) return;
    try {
      const pickerLib = require('react-native-image-picker');
      const launch = pickerLib?.launchImageLibrary;
      if (typeof launch !== 'function') {
        Alert.alert('Unavailable', 'Image picker is not available on this device.');
        return;
      }
      launch(
        { mediaType: 'photo', maxWidth: 800, maxHeight: 800, quality: 0.85 },
        async (response) => {
          if (response?.didCancel) return;
          if (response?.errorCode) {
            Alert.alert('Error', response.errorMessage || 'Failed to pick image');
            return;
          }
          const asset = response?.assets?.[0];
          if (!asset?.uri) return;
          await uploadFile({
            uri: asset.uri,
            fileName: asset.fileName,
            type: asset.type,
          });
        },
      );
    } catch (_) {
      Alert.alert('Unavailable', 'Image picker is not available right now.');
    }
  };

  const onWebFileChange = async (e) => {
    const file = e?.target?.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    if (!file.type?.startsWith('image/')) {
      Alert.alert('Invalid file', 'Please choose a JPG or PNG image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      Alert.alert('File too large', 'Maximum size is 10 MB.');
      return;
    }
    await uploadFile(file);
  };

  const radius = size / 2;

  return (
    <View style={{ alignItems: 'center', marginBottom: Spacing.md }}>
      <Pressable
        onPress={() => {
          if (disabled || uploading) return;
          if (Platform.OS === 'web' && fileInputRef.current) {
            fileInputRef.current.click();
          } else {
            pickNative();
          }
        }}
        disabled={disabled || uploading}
        style={({ pressed }) => ({
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: Colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          opacity: pressed ? 0.9 : disabled ? 0.6 : 1,
          borderWidth: 2,
          borderColor: Colors.border,
        })}
      >
        {uploading ? (
          <ActivityIndicator color={Colors.text.white} size="large" />
        ) : imageUrl ? (
          <Image source={{ uri: String(imageUrl) }} style={{ width: size, height: size }} resizeMode="cover" />
        ) : (
          <Text style={{ fontSize: size * 0.4, color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>
            {String(fallbackLetter || '?')[0].toUpperCase()}
          </Text>
        )}
      </Pressable>

      {Platform.OS === 'web' &&
        createElement('input', {
          ref: setFileInputRef,
          type: 'file',
          accept: 'image/jpeg,image/png,image/webp',
          style: { display: 'none' },
          onChange: onWebFileChange,
        })}

      <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.primary, marginTop: Spacing.sm }}>
        {uploading ? 'Uploading…' : 'Tap to change photo'}
      </Text>
    </View>
  );
}
