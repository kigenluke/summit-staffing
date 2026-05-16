/**
 * Participant compliance document upload (required before posting shifts).
 */
import React, { useEffect, useState, useCallback, createElement } from 'react';
import { View, Text, ScrollView, Pressable, Alert, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/api.js';
import { useAccountAccess } from '../context/WorkerGateContext.js';
import { ComplianceSubmitPanel } from '../components/ComplianceSubmitPanel.js';
import { Colors, Spacing, Typography, Radius } from '../constants/theme.js';
import { getComplianceProgress, getLatestDocumentForType, REQUIRED_PARTICIPANT_COMPLIANCE_DOCS } from '../utils/complianceProgress.js';
import { DocumentViewLink } from '../components/DocumentViewLink.js';

const DOC_TYPES = [
  { key: 'ndis_screening', label: 'NDIS Screening' },
  { key: 'wwcc', label: 'WWCC / Blue Card' },
  { key: 'police_check', label: 'Police Check' },
  { key: 'first_aid', label: 'First Aid' },
  { key: 'insurance', label: 'Insurance' },
];

const DOC_STATUS_COLORS = {
  pending: Colors.status.warning,
  approved: Colors.status.success,
  rejected: Colors.status.error,
};

export function ParticipantComplianceScreen() {
  const navigation = useNavigation();
  const { refresh, syncFromParticipantProfile } = useAccountAccess();
  const [participant, setParticipant] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDocType, setSelectedDocType] = useState('ndis_screening');
  const [selectedDocFile, setSelectedDocFile] = useState(null);
  const [docIssueDate, setDocIssueDate] = useState('');
  const [docExpiryDate, setDocExpiryDate] = useState('');
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

  const uploadDocumentNow = async () => {
    if (!participant?.id) return;
    if (!selectedDocFile) {
      Alert.alert('Missing file', 'Please choose a file first.');
      return;
    }
    setUploadingDoc(true);
    try {
      const form = new FormData();
      if (Platform.OS === 'web') {
        form.append('file', selectedDocFile, selectedDocFile.name || 'document');
      } else {
        form.append('file', selectedDocFile);
      }
      form.append('documentType', selectedDocType);
      if (docIssueDate) form.append('issue_date', docIssueDate);
      if (docExpiryDate) form.append('expiry_date', docExpiryDate);

      const { error } = await api.post('/api/participants/me/documents', form);
      if (error) {
        Alert.alert('Upload failed', error.message || 'Could not upload document');
      } else {
        Alert.alert('Uploaded', 'Document saved. Upload all required documents, then tap Submit for verification.');
        setSelectedDocFile(null);
        setDocIssueDate('');
        setDocExpiryDate('');
        await load();
        await refresh();
      }
    } catch (_) {
      Alert.alert('Upload failed', 'Could not upload document');
    }
    setUploadingDoc(false);
  };

  const progress = getComplianceProgress(documents, REQUIRED_PARTICIPANT_COMPLIANCE_DOCS);

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

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.background }} contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}>
      <Text style={{ fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm }}>
        Compliance documents
      </Text>
      <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.lg }}>
        Upload your documents before you can post shifts or use the rest of the app. Status: {participant?.verification_status || 'pending'}.
      </Text>

      {DOC_TYPES.map((dt) => {
        const doc = getLatestDocumentForType(documents, dt.key);
        return (
          <View
            key={dt.key}
            style={{
              paddingVertical: Spacing.sm,
              borderBottomWidth: 1,
              borderBottomColor: Colors.borderLight,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: Colors.text.primary, flex: 1 }}>{dt.label}</Text>
              {doc ? (
                <View style={{ backgroundColor: DOC_STATUS_COLORS[doc.status] || Colors.text.muted, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.full }}>
                  <Text style={{ color: Colors.text.white, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold }}>{doc.status}</Text>
                </View>
              ) : (
                <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted }}>Required</Text>
              )}
            </View>
            {doc?.file_url ? (
              <View style={{ marginTop: 4 }}>
                <DocumentViewLink url={doc.file_url} label="View uploaded file" />
                {doc.rejection_reason ? (
                  <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.status.error, marginTop: 2 }}>
                    Rejected: {doc.rejection_reason}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}

      <View style={{ marginTop: Spacing.lg, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, backgroundColor: Colors.surface }}>
        <Text style={{ fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary, marginBottom: Spacing.sm }}>Upload document</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.sm }}>
          {DOC_TYPES.map((dt) => (
            <Pressable
              key={dt.key}
              onPress={() => setSelectedDocType(dt.key)}
              style={{
                borderRadius: Radius.full,
                paddingHorizontal: Spacing.sm,
                paddingVertical: 5,
                borderWidth: 1,
                borderColor: selectedDocType === dt.key ? Colors.primary : Colors.border,
                backgroundColor: selectedDocType === dt.key ? `${Colors.primary}22` : Colors.surfaceSecondary,
              }}
            >
              <Text style={{ fontSize: Typography.fontSize.xs, color: selectedDocType === dt.key ? Colors.primary : Colors.text.secondary }}>{dt.label}</Text>
            </Pressable>
          ))}
        </View>

        {Platform.OS === 'web' ? (
          <View style={{ marginBottom: Spacing.sm }}>
            {createElement('input', {
              type: 'file',
              accept: 'application/pdf,image/jpeg,image/png',
              onChange: (e) => setSelectedDocFile(e?.target?.files?.[0] || null),
              style: { width: '100%' },
            })}
          </View>
        ) : (
          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginBottom: Spacing.sm }}>
            Use the web app to upload PDF or image files for now.
          </Text>
        )}

        <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginBottom: Spacing.sm }}>
          Selected: {selectedDocFile?.name || 'None'}
        </Text>

        <Pressable
          onPress={uploadDocumentNow}
          disabled={uploadingDoc}
          style={({ pressed }) => ({
            backgroundColor: uploadingDoc ? Colors.text.muted : Colors.primary,
            borderRadius: Radius.md,
            paddingVertical: Spacing.md,
            alignItems: 'center',
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>
            {uploadingDoc ? 'Uploading…' : 'Upload'}
          </Text>
        </Pressable>
      </View>

      <ComplianceSubmitPanel
        progress={progress}
        verificationSubmittedAt={participant?.verification_submitted_at}
        verificationStatus={participant?.verification_status}
        onSubmit={handleSubmitVerification}
      />

      <Pressable onPress={() => navigation.goBack()} style={{ marginTop: Spacing.lg, alignItems: 'center' }}>
        <Text style={{ color: Colors.primary }}>Back</Text>
      </Pressable>
    </ScrollView>
  );
}
