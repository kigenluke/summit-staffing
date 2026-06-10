/**
 * Optional participant compliance document upload.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/api.js';
import { useAccountAccess } from '../context/WorkerGateContext.js';
import { ComplianceDocumentsPanel } from '../components/ComplianceDocumentsPanel.js';
import { Colors, Spacing, Typography } from '../constants/theme.js';
import { REQUIRED_PARTICIPANT_COMPLIANCE_DOCS } from '../utils/complianceProgress.js';

const DOC_TYPES = [
  { key: 'ndis_screening', label: 'NDIS Screening' },
  { key: 'wwcc', label: 'WWCC / Blue Card' },
  { key: 'police_check', label: 'Police Check' },
  { key: 'first_aid', label: 'First Aid' },
  { key: 'insurance', label: 'Insurance' },
];

export function ParticipantComplianceScreen() {
  const navigation = useNavigation();
  const { refresh, syncFromParticipantProfile } = useAccountAccess();
  const [participant, setParticipant] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await api.get('/api/participants/me');
      if (error) {
        Alert.alert('Error', error.message);
      } else if (data?.ok) {
        setParticipant(data.participant);
        setDocuments(data.documents || []);
        syncFromParticipantProfile(data.participant, data.documents || []);
      }
    } finally {
      setLoading(false);
    }
  }, [syncFromParticipantProfile]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async ({ documentType, file, issueDate, expiryDate }) => {
    if (!participant?.id) return;
    setUploadingDoc(true);
    try {
      const form = new FormData();
      if (Platform.OS === 'web') {
        form.append('file', file, file.name || 'document');
      } else {
        form.append('file', {
          uri: file.uri,
          name: file.name || 'document.jpg',
          type: file.type || 'image/jpeg',
        });
      }
      form.append('documentType', documentType);
      if (issueDate) form.append('issue_date', issueDate);
      if (expiryDate) form.append('expiry_date', expiryDate);

      const { error } = await api.post('/api/participants/me/documents', form);
      if (error) {
        Alert.alert('Upload failed', error.message || 'Could not upload document');
        throw error;
      }
      Alert.alert('Uploaded', `${DOC_TYPES.find((d) => d.key === documentType)?.label || 'Document'} saved successfully.`);
      await load();
      await refresh();
    } catch (e) {
      if (e && !e.response) Alert.alert('Upload failed', 'Could not upload document');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleSubmitVerification = async () => {
    const { data, error } = await api.post('/api/participants/me/submit-verification', {});
    if (error) {
      Alert.alert('Submit failed', error.message || 'Could not submit');
      return;
    }
    if (data?.ok) {
      Alert.alert('Submitted', data.message || 'Awaiting verification. An admin will review your documents.');
      await load();
      await refresh();
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const statusLabel = participant?.verification_status || 'pending';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}>
      <ComplianceDocumentsPanel
        title="Compliance documents"
        subtitle={`Optional compliance documents. Account status: ${statusLabel}.`}
        docTypes={DOC_TYPES}
        documents={documents}
        requiredTypes={REQUIRED_PARTICIPANT_COMPLIANCE_DOCS}
        onUpload={handleUpload}
        uploading={uploadingDoc}
        verificationSubmittedAt={participant?.verification_submitted_at}
        verificationStatus={participant?.verification_status}
        onSubmitVerification={handleSubmitVerification}
      />

      <Pressable onPress={() => navigation.goBack()} style={{ marginTop: Spacing.lg, alignItems: 'center', paddingVertical: Spacing.sm }}>
        <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.semibold }}>Back</Text>
      </Pressable>
    </ScrollView>
  );
}
