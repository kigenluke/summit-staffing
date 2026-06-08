import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useWorkerGate } from '../context/WorkerGateContext.js';
import { Colors, Spacing, Typography, Radius } from '../constants/theme.js';

/** Compact banner when expired docs are detected (e.g. on screens that still render beneath the gate). */
export function ExpiredDocumentsBanner() {
  const navigation = useNavigation();
  const { accessPhase, expiredDocuments } = useWorkerGate();
  if (accessPhase !== 'documents_expired' || !expiredDocuments?.length) return null;

  const firstType = expiredDocuments[0]?.documentType;

  return (
    <Pressable
      onPress={() => navigation.navigate('WorkerManage', { focusDocument: firstType || 'ndis_screening' })}
      style={({ pressed }) => ({
        backgroundColor: Colors.primaryDark,
        borderRadius: Radius.md,
        padding: Spacing.md,
        marginBottom: Spacing.md,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold, marginBottom: 4 }}>
        Documents expired
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: Typography.fontSize.sm }}>
        {expiredDocuments.length} document{expiredDocuments.length === 1 ? '' : 's'} need renewal — tap to update
      </Text>
    </Pressable>
  );
}
