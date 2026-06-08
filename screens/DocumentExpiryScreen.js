/**
 * Full-screen notice when one or more compliance documents have expired (workers).
 * Inspired by onboarding “missing documents” flows — Summit cyan brand colours.
 */
import React from 'react';
import { View, Text, Pressable, ScrollView, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAccountAccess } from '../context/WorkerGateContext.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';
import { formatDateDMY } from '../utils/dateFormat.js';
import { SUPPORT_EMAIL, openSupportDocumentsEmail } from '../utils/verificationPrompt.js';

export function DocumentExpiryScreen() {
  const navigation = useNavigation();
  const { expiredDocuments, refresh } = useAccountAccess();
  const expired = expiredDocuments || [];
  const firstType = expired[0]?.documentType;

  const onUpdateDocuments = () => {
    navigation.navigate('WorkerManage', {
      focusDocument: firstType || 'ndis_screening',
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.xl,
          paddingBottom: 120,
          alignItems: 'center',
        }}
      >
        {/* Hero circle — sample-style illustration area */}
        <View
          style={{
            width: 200,
            height: 200,
            borderRadius: 100,
            backgroundColor: `${Colors.primary}18`,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: Spacing.xl,
          }}
        >
          <View
            style={{
              width: 120,
              height: 120,
              borderRadius: 60,
              backgroundColor: Colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: `${Colors.primary}44`,
              ...Shadows.sm,
            }}
          >
            <Text style={{ fontSize: 48 }}>📄</Text>
          </View>
        </View>

        <Text
          style={{
            fontSize: Typography.fontSize.xxl,
            fontWeight: Typography.fontWeight.bold,
            color: Colors.text.primary,
            textAlign: 'center',
            marginBottom: Spacing.sm,
          }}
        >
          Documents expired
        </Text>

        <Text
          style={{
            fontSize: Typography.fontSize.base,
            color: Colors.text.secondary,
            textAlign: 'center',
            lineHeight: 24,
            marginBottom: Spacing.lg,
            maxWidth: 340,
          }}
        >
          One or more compliance documents are past their expiry date. Upload renewed copies to keep your account active and receive shifts.
        </Text>

        {expired.length > 0 && (
          <View
            style={{
              width: '100%',
              maxWidth: 400,
              backgroundColor: Colors.surface,
              borderRadius: Radius.lg,
              padding: Spacing.md,
              marginBottom: Spacing.lg,
              borderWidth: 1,
              borderColor: Colors.border,
              ...Shadows.sm,
            }}
          >
            <Text
              style={{
                fontSize: Typography.fontSize.sm,
                fontWeight: Typography.fontWeight.semibold,
                color: Colors.text.primary,
                marginBottom: Spacing.sm,
              }}
            >
              Expired documents
            </Text>
            {expired.map((item) => (
              <View
                key={item.documentType}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: Spacing.sm,
                  borderBottomWidth: 1,
                  borderBottomColor: Colors.borderLight,
                }}
              >
                <Text style={{ flex: 1, color: Colors.text.primary, fontWeight: Typography.fontWeight.medium }}>
                  {item.label}
                </Text>
                <Text style={{ color: Colors.status.warning, fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold }}>
                  {item.expiry_date ? `Expired ${formatDateDMY(item.expiry_date)}` : 'Expired'}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Pressable
          onPress={onUpdateDocuments}
          style={({ pressed }) => ({
            backgroundColor: Colors.primary,
            paddingVertical: Spacing.md,
            paddingHorizontal: Spacing.xl,
            borderRadius: Radius.full,
            minWidth: 260,
            alignItems: 'center',
            opacity: pressed ? 0.9 : 1,
            marginBottom: Spacing.md,
            ...Shadows.md,
          })}
        >
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.base }}>
            Update documents
          </Text>
        </Pressable>

        <Pressable onPress={() => refresh()} style={{ padding: Spacing.sm }}>
          <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.semibold }}>I&apos;ve uploaded — refresh</Text>
        </Pressable>

        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.muted, textAlign: 'center', marginTop: Spacing.md }}>
          Questions?{' '}
          <Text onPress={openSupportDocumentsEmail} style={{ color: Colors.primary, textDecorationLine: 'underline' }}>
            {SUPPORT_EMAIL}
          </Text>
        </Text>
      </ScrollView>

      {/* Bottom banner — sample-style sticky alert */}
      <Pressable
        onPress={onUpdateDocuments}
        style={({ pressed }) => ({
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: Colors.primaryDark,
          paddingVertical: Spacing.md,
          paddingHorizontal: Spacing.lg,
          opacity: pressed ? 0.92 : 1,
        })}
      >
        <Text style={{ color: Colors.text.white, textAlign: 'center', fontSize: Typography.fontSize.base }}>
          You have expired documents —{' '}
          <Text style={{ fontWeight: Typography.fontWeight.bold, textDecorationLine: 'underline' }}>tap to renew</Text>
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}
