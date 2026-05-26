import React, { useState } from 'react';
import {
  Pressable,
  Text,
  Linking,
  Platform,
  Modal,
  View,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Colors, Typography, Radius, Spacing } from '../constants/theme.js';

function guessMimeFromUrl(url) {
  const path = String(url || '').toLowerCase().split('?')[0];
  if (/\.pdf$/i.test(path)) return 'pdf';
  if (/\.(jpe?g|png|gif|webp)$/i.test(path)) return 'image';
  if (path.includes('/image/upload/') || path.includes('/raw/upload/')) {
    return path.includes('/raw/upload/') ? 'pdf' : 'image';
  }
  return 'unknown';
}

export function openDocumentUrl(url) {
  const target = String(url || '').trim();
  if (!target) return;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(target, '_blank', 'noopener,noreferrer');
    return;
  }
  Linking.openURL(target).catch(() => {});
}

function DocumentPreviewModal({ visible, url, onClose }) {
  const kind = guessMimeFromUrl(url);
  const isImage = kind === 'image';
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  if (!visible || !url) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: Spacing.lg }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={onClose} />
        <View
          style={{
            zIndex: 1,
            backgroundColor: Colors.surface,
            borderRadius: Radius.lg,
            overflow: 'hidden',
            minHeight: 120,
            maxHeight: '90%',
          }}
        >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingHorizontal: Spacing.md,
                paddingVertical: Spacing.sm,
                borderBottomWidth: 1,
                borderBottomColor: Colors.border,
              }}
            >
              <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, flex: 1 }}>
                Document preview
              </Text>
              <Pressable onPress={onClose} hitSlop={12}>
                <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.semibold }}>Close</Text>
              </Pressable>
            </View>

            {isImage && !failed ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', padding: Spacing.md, minHeight: 200 }}>
                {loading ? (
                  <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.xl }} />
                ) : null}
                <Image
                  source={{ uri: url }}
                  style={{ width: '100%', height: 400 }}
                  resizeMode="contain"
                  onLoadStart={() => {
                    setLoading(true);
                    setFailed(false);
                  }}
                  onLoadEnd={() => setLoading(false)}
                  onError={() => {
                    setLoading(false);
                    setFailed(true);
                  }}
                />
              </View>
            ) : (
              <View style={{ padding: Spacing.lg, alignItems: 'center' }}>
                <Text style={{ fontSize: 40, marginBottom: Spacing.sm }}>{kind === 'pdf' ? '📄' : '📎'}</Text>
                <Text style={{ color: Colors.text.secondary, textAlign: 'center', marginBottom: Spacing.md }}>
                  {kind === 'pdf'
                    ? 'PDF preview opens in your device viewer.'
                    : failed
                      ? 'Could not load preview. Open the file externally.'
                      : 'Preview not available for this file type.'}
                </Text>
                <Pressable
                  onPress={() => {
                    onClose();
                    openDocumentUrl(url);
                  }}
                  style={({ pressed }) => ({
                    backgroundColor: Colors.primary,
                    borderRadius: Radius.md,
                    paddingVertical: Spacing.sm,
                    paddingHorizontal: Spacing.lg,
                    opacity: pressed ? 0.9 : 1,
                  })}
                >
                  <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>Open document</Text>
                </Pressable>
              </View>
            )}
        </View>
      </View>
    </Modal>
  );
}

export function DocumentViewLink({ url, label = 'View document', style }) {
  const [previewOpen, setPreviewOpen] = useState(false);

  if (!url) return null;

  const handlePress = () => {
    if (Platform.OS === 'web') {
      openDocumentUrl(url);
      return;
    }
    setPreviewOpen(true);
  };

  return (
    <>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          {
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: `${Colors.primary}14`,
            paddingHorizontal: Spacing.sm,
            paddingVertical: 5,
            borderRadius: Radius.full,
            borderWidth: 1,
            borderColor: `${Colors.primary}40`,
            opacity: pressed ? 0.85 : 1,
          },
          style,
        ]}
      >
        <Text style={{ marginRight: 4 }}>👁</Text>
        <Text
          style={{
            color: Colors.primaryDark,
            fontSize: Typography.fontSize.xs,
            fontWeight: Typography.fontWeight.semibold,
          }}
        >
          {label}
        </Text>
      </Pressable>
      {Platform.OS !== 'web' ? (
        <DocumentPreviewModal visible={previewOpen} url={url} onClose={() => setPreviewOpen(false)} />
      ) : null}
    </>
  );
}
