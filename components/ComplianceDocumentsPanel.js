/**
 * Compliance document checklist + upload UI (participants & workers).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState, createElement } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { ComplianceSubmitPanel } from './ComplianceSubmitPanel.js';
import { DocumentViewLink } from './DocumentViewLink.js';
import { ComplianceDateField, fromYmd } from './ComplianceDateField.js';
import {
  getComplianceProgress,
  getLatestDocumentForType,
  DOC_TYPE_LABELS,
} from '../utils/complianceProgress.js';
import { formatDateDMY } from '../utils/dateFormat.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';

const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
const MAX_FILE_MB = 10;

const STATUS_META = {
  approved: { label: 'Approved', color: Colors.status.success, bg: Colors.status.success, icon: '✓' },
  pending: { label: 'Pending review', color: Colors.status.warning, bg: Colors.status.warning, icon: '⏳' },
  rejected: { label: 'Rejected', color: Colors.status.error, bg: Colors.status.error, icon: '!' },
  missing: { label: 'Not uploaded', color: Colors.primary, bg: Colors.primary, icon: '+' },
};

function PlusIcon({ color = Colors.text.white, size = 20 }) {
  const thickness = Math.max(2, Math.round(size / 10));
  const arm = Math.round(size * 0.55);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: arm,
          height: thickness,
          backgroundColor: color,
          borderRadius: thickness / 2,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: thickness,
          height: arm,
          backgroundColor: color,
          borderRadius: thickness / 2,
        }}
      />
    </View>
  );
}

function DocStatusIcon({ status }) {
  const meta = STATUS_META[status] || STATUS_META.missing;
  const isPlus = status === 'missing';
  return (
    <View
      style={{
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: meta.bg,
        alignItems: 'center',
        justifyContent: 'center',
        ...Shadows.sm,
      }}
    >
      {isPlus ? (
        <PlusIcon color={Colors.text.white} size={20} />
      ) : (
        <Text
          style={{
            color: Colors.text.white,
            fontWeight: Typography.fontWeight.bold,
            fontSize: 18,
            textAlign: 'center',
            ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
          }}
        >
          {meta.icon}
        </Text>
      )}
    </View>
  );
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file) {
  if (!file) return 'Choose a file first.';
  const type = file.type || '';
  const name = String(file.name || '').toLowerCase();
  const okType = ACCEPTED_MIME.includes(type) || name.endsWith('.pdf') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png');
  if (!okType) return 'Use PDF, JPG, or PNG only.';
  const size = file.size || 0;
  if (size > MAX_FILE_MB * 1024 * 1024) return `File must be under ${MAX_FILE_MB} MB.`;
  return null;
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.missing;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: `${meta.color}18`,
        paddingHorizontal: Spacing.sm,
        paddingVertical: 4,
        borderRadius: Radius.full,
      }}
    >
      <Text style={{ color: meta.color, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold }}>
        {meta.label}
      </Text>
    </View>
  );
}

function DocumentTypeCard({ docType, doc, selected, required, onSelect }) {
  const status = doc?.status || 'missing';

  return (
    <Pressable
      onPress={() => onSelect(docType.key)}
      style={({ pressed }) => ({
        borderRadius: Radius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.sm,
        backgroundColor: selected ? `${Colors.primary}12` : Colors.surface,
        borderWidth: 1.5,
        borderColor: selected ? Colors.primary : Colors.border,
        opacity: pressed ? 0.92 : 1,
        ...Shadows.sm,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
        <DocStatusIcon status={status} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm }}>
            <Text style={{ flex: 1, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary, fontSize: Typography.fontSize.base }}>
              {docType.label}
            </Text>
            {required ? (
              <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.primary, fontWeight: Typography.fontWeight.semibold }}>Required</Text>
            ) : null}
          </View>
          <View style={{ marginTop: 6 }}>
            <StatusBadge status={status} />
          </View>
          {doc?.expiry_date ? (
            <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginTop: 4 }}>
              Expires {formatDateDMY(doc.expiry_date)}
            </Text>
          ) : null}
          {doc?.rejection_reason ? (
            <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.status.error, marginTop: 4 }}>
              {doc.rejection_reason}
            </Text>
          ) : null}
          {doc?.file_url ? (
            <View style={{ marginTop: 6 }}>
              <DocumentViewLink url={doc.file_url} label="View uploaded file" />
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function FileDropZone({ file, onFileSelected, disabled }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const setInputRef = (el) => {
    inputRef.current = el;
  };

  const applyFile = (nextFile) => {
    const err = validateFile(nextFile);
    if (err) {
      Alert.alert('Invalid file', err);
      return;
    }
    onFileSelected(nextFile);
  };

  const onWebChange = (e) => {
    const next = e?.target?.files?.[0] || null;
    if (inputRef.current) inputRef.current.value = '';
    if (next) applyFile(next);
  };

  const pickNative = () => {
    if (disabled) return;
    try {
      const pickerLib = require('react-native-image-picker');
      const launch = pickerLib?.launchImageLibrary;
      if (typeof launch !== 'function') {
        Alert.alert('Unavailable', 'File picker is not available on this device.');
        return;
      }
      launch(
        { mediaType: 'photo', selectionLimit: 1 },
        (response) => {
          if (response?.didCancel) return;
          if (response?.errorCode) {
            Alert.alert('Error', response.errorMessage || 'Could not pick file');
            return;
          }
          const asset = response?.assets?.[0];
          if (!asset?.uri) return;
          applyFile({
            uri: asset.uri,
            name: asset.fileName || `document_${Date.now()}.jpg`,
            type: asset.type || 'image/jpeg',
            size: asset.fileSize,
          });
        },
      );
    } catch (_) {
      Alert.alert('Unavailable', 'File picker is not available right now.');
    }
  };

  if (Platform.OS === 'web') {
    return (
      <View>
        {createElement('input', {
          ref: setInputRef,
          type: 'file',
          accept: 'application/pdf,image/jpeg,image/png,image/webp',
          onChange: onWebChange,
          style: { display: 'none' },
          disabled,
        })}
        <Pressable
          onPress={() => !disabled && inputRef.current?.click?.()}
          style={({ pressed }) => ({
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: dragOver ? Colors.primary : Colors.border,
            borderRadius: Radius.lg,
            padding: Spacing.lg,
            alignItems: 'center',
            backgroundColor: dragOver ? `${Colors.primary}10` : Colors.surfaceSecondary,
            opacity: disabled ? 0.6 : pressed ? 0.9 : 1,
          })}
          // @ts-ignore web drag events
          onDragEnter={(e) => { e?.preventDefault?.(); setDragOver(true); }}
          onDragLeave={(e) => { e?.preventDefault?.(); setDragOver(false); }}
          onDragOver={(e) => { e?.preventDefault?.(); setDragOver(true); }}
          onDrop={(e) => {
            e?.preventDefault?.();
            setDragOver(false);
            if (disabled) return;
            const dropped = e?.dataTransfer?.files?.[0];
            if (dropped) applyFile(dropped);
          }}
        >
          <Text style={{ fontSize: 28, marginBottom: Spacing.xs }}>📄</Text>
          <Text style={{ fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary, textAlign: 'center' }}>
            {file ? 'Tap to replace file' : 'Tap to choose a file'}
          </Text>
          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginTop: 4, textAlign: 'center' }}>
            or drag & drop PDF, JPG, PNG (max {MAX_FILE_MB} MB)
          </Text>
        </Pressable>
        {file ? (
          <View
            style={{
              marginTop: Spacing.sm,
              flexDirection: 'row',
              alignItems: 'center',
              gap: Spacing.sm,
              backgroundColor: Colors.surface,
              borderRadius: Radius.md,
              padding: Spacing.sm,
              borderWidth: 1,
              borderColor: Colors.border,
            }}
          >
            <Text style={{ flex: 1, color: Colors.text.primary, fontSize: Typography.fontSize.sm }} numberOfLines={1}>
              {file.name || 'Selected file'}
            </Text>
            {file.size ? (
              <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.xs }}>{formatFileSize(file.size)}</Text>
            ) : null}
            <Pressable onPress={() => onFileSelected(null)} hitSlop={8}>
              <Text style={{ color: Colors.status.error, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.xs }}>Remove</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      <Pressable
        onPress={pickNative}
        disabled={disabled}
        style={({ pressed }) => ({
          borderWidth: 2,
          borderStyle: 'dashed',
          borderColor: Colors.border,
          borderRadius: Radius.lg,
          padding: Spacing.lg,
          alignItems: 'center',
          backgroundColor: Colors.surfaceSecondary,
          opacity: disabled ? 0.6 : pressed ? 0.9 : 1,
        })}
      >
        <Text style={{ fontSize: 28, marginBottom: Spacing.xs }}>📷</Text>
        <Text style={{ fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary, textAlign: 'center' }}>
          {file ? 'Tap to replace photo' : 'Tap to choose photo'}
        </Text>
        <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginTop: 4, textAlign: 'center' }}>
          JPG or PNG from your gallery. For PDF, use the web app.
        </Text>
      </Pressable>
      {file ? (
        <View style={{ marginTop: Spacing.sm, padding: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border }}>
          <Text style={{ color: Colors.text.primary, fontSize: Typography.fontSize.sm }} numberOfLines={1}>
            {file.name || 'Selected file'}
          </Text>
          <Pressable onPress={() => onFileSelected(null)} style={{ marginTop: 4 }}>
            <Text style={{ color: Colors.status.error, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.semibold }}>Remove</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export function ComplianceDocumentsPanel({
  docTypes,
  documents = [],
  requiredTypes = [],
  onUpload,
  uploading = false,
  verificationSubmittedAt,
  verificationStatus,
  onSubmitVerification,
  title = 'Compliance documents',
  subtitle,
}) {
  const requiredSet = useMemo(() => new Set(requiredTypes), [requiredTypes]);
  const progress = useMemo(() => getComplianceProgress(documents, requiredTypes), [documents, requiredTypes]);

  const firstMissing = useMemo(() => {
    const missing = progress.missing?.[0];
    if (missing) return missing;
    return docTypes[0]?.key || null;
  }, [progress.missing, docTypes]);

  const [selectedDocType, setSelectedDocType] = useState(firstMissing);
  const [selectedFile, setSelectedFile] = useState(null);
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  useEffect(() => {
    if (firstMissing) setSelectedDocType(firstMissing);
  }, [firstMissing]);

  const selectedLabel = DOC_TYPE_LABELS[selectedDocType] || docTypes.find((d) => d.key === selectedDocType)?.label || 'Document';
  const pct = progress.total ? Math.round((progress.uploadedCount / progress.total) * 100) : 0;
  const issueDateObj = fromYmd(issueDate);

  const handleUpload = useCallback(async () => {
    if (!selectedDocType) {
      Alert.alert('Select document', 'Choose which document type you are uploading.');
      return;
    }
    const fileErr = validateFile(selectedFile);
    if (fileErr) {
      Alert.alert('Missing file', fileErr);
      return;
    }
    try {
      await onUpload({
        documentType: selectedDocType,
        file: selectedFile,
        issueDate: issueDate.trim() || undefined,
        expiryDate: expiryDate.trim() || undefined,
      });
      setSelectedFile(null);
      setIssueDate('');
      setExpiryDate('');
    } catch (_) {
      // caller shows alert
    }
  }, [selectedDocType, selectedFile, issueDate, expiryDate, onUpload]);

  return (
    <View>
      <View style={{ backgroundColor: Colors.primary, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.lg, ...Shadows.md }}>
        <Text style={{ fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.text.white }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: Typography.fontSize.sm, color: 'rgba(255,255,255,0.88)', marginTop: Spacing.xs, lineHeight: 20 }}>
            {subtitle}
          </Text>
        ) : null}
        <View style={{ marginTop: Spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium }}>
              {progress.uploadedCount} of {progress.total} required uploaded
            </Text>
            <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>{pct}%</Text>
          </View>
          <View style={{ height: 8, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: Radius.full, overflow: 'hidden' }}>
            <View style={{ width: `${pct}%`, height: '100%', backgroundColor: Colors.text.white, borderRadius: Radius.full }} />
          </View>
        </View>
      </View>

      <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm }}>
        Your documents
      </Text>
      <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.md }}>
        Tap a document to upload or replace it. Admin will review after you submit.
      </Text>

      {docTypes.map((dt) => {
        const doc = getLatestDocumentForType(documents, dt.key);
        const cardStatus = doc ? doc.status : 'missing';
        return (
          <DocumentTypeCard
            key={dt.key}
            docType={dt}
            doc={doc ? { ...doc, status: cardStatus } : null}
            selected={selectedDocType === dt.key}
            required={requiredSet.has(dt.key)}
            onSelect={(key) => {
              setSelectedDocType(key);
              setSelectedFile(null);
            }}
          />
        );
      })}

      <View
        style={{
          marginTop: Spacing.md,
          padding: Spacing.lg,
          borderRadius: Radius.lg,
          backgroundColor: Colors.surface,
          borderWidth: 1,
          borderColor: Colors.border,
          ...Shadows.sm,
        }}
      >
        <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, fontSize: Typography.fontSize.lg, marginBottom: 4 }}>
          Upload {selectedLabel}
        </Text>
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: Spacing.md }}>
          Clear photo or PDF scan. Optional dates help track expiry.
        </Text>

        <FileDropZone file={selectedFile} onFileSelected={setSelectedFile} disabled={uploading} />

        <View style={{ marginTop: Spacing.md, gap: Spacing.md }}>
          <ComplianceDateField
            label="Issue date (optional)"
            value={issueDate}
            onChange={setIssueDate}
          />
          <ComplianceDateField
            label="Expiry date (optional)"
            value={expiryDate}
            onChange={setExpiryDate}
            minDate={issueDateObj || undefined}
          />
        </View>

        <Pressable
          onPress={handleUpload}
          disabled={uploading || !selectedFile}
          style={({ pressed }) => ({
            marginTop: Spacing.lg,
            backgroundColor: uploading || !selectedFile ? Colors.text.muted : Colors.primary,
            borderRadius: Radius.md,
            paddingVertical: Spacing.md,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: Spacing.sm,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          {uploading ? <ActivityIndicator color={Colors.text.white} size="small" /> : null}
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.base }}>
            {uploading ? 'Uploading…' : 'Upload document'}
          </Text>
        </Pressable>
      </View>

      <ComplianceSubmitPanel
        progress={progress}
        verificationSubmittedAt={verificationSubmittedAt}
        verificationStatus={verificationStatus}
        onSubmit={onSubmitVerification}
        submitting={uploading}
      />
    </View>
  );
}
