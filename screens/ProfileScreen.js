/**
 * Summit Staffing – Profile Screen (Redesigned)
 * Sidebar-style menu layout with profile header, menu sections, and sign out.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Alert, RefreshControl, ActivityIndicator, Platform, Image } from 'react-native';
import { useAuthStore } from '../store/authStore.js';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';
import { useWorkerGate } from '../context/WorkerGateContext.js';
import { showVerificationRequiredAlert } from '../utils/verificationPrompt.js';

// ── Menu Item Component ─────────────────────────────────────────
const MenuItem = ({ label, badge, onPress, disabled }) => (
  <Pressable
    onPress={() => {
      if (disabled) {
        showVerificationRequiredAlert();
        return;
      }
      onPress();
    }}
    style={({ pressed }) => ({
      flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
      opacity: disabled ? 0.45 : pressed ? 0.6 : 1,
    })}
  >
    <Text style={{ flex: 1, fontSize: Typography.fontSize.base, color: disabled ? Colors.text.muted : Colors.text.primary, fontWeight: Typography.fontWeight.medium }}>
      {label}
    </Text>
    {badge > 0 && (
      <View style={{
        backgroundColor: Colors.status.error, minWidth: 22, height: 22, borderRadius: 11,
        alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginRight: Spacing.sm,
      }}>
        <Text style={{ color: Colors.text.white, fontSize: 11, fontWeight: Typography.fontWeight.bold }}>
          {badge > 99 ? '99' : badge}
        </Text>
      </View>
    )}
    <Text style={{ color: Colors.text.muted, fontSize: 16 }}>›</Text>
  </Pressable>
);

// ── Menu Section Component ──────────────────────────────────────
const MenuSection = ({ children }) => (
  <View style={{
    backgroundColor: Colors.surface, borderRadius: Radius.lg, paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md, ...Shadows.sm,
  }}>
    {children}
  </View>
);

export function ProfileScreen({ navigation }) {
  const { user, logout } = useAuthStore();
  const isWorker = user?.role === 'worker';
  const isAdmin = user?.role === 'admin';
  const { restricted, syncFromWorkerProfile } = useWorkerGate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [profileImage, setProfileImage] = useState(null);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const safeNavigate = useCallback((routeName) => {
    try {
      navigation.navigate(routeName);
    } catch (_) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert('This screen is not available right now.');
      else Alert.alert('Navigation error', 'This screen is not available right now.');
    }
  }, [navigation]);

  const pickImage = () => {
    try {
      const pickerLib = require('react-native-image-picker');
      const launch = pickerLib?.launchImageLibrary;
      if (typeof launch !== 'function') {
        Alert.alert('Unavailable', 'Image picker is not available on this device.');
        return;
      }
      launch(
        { mediaType: 'photo', maxWidth: 400, maxHeight: 400, quality: 0.8 },
        (response) => {
          if (response?.didCancel) return;
          if (response?.errorCode) {
            Alert.alert('Error', response.errorMessage || 'Failed to pick image');
            return;
          }
          const uri = response?.assets?.[0]?.uri;
          if (uri) setProfileImage(uri);
        },
      );
    } catch (_) {
      Alert.alert('Unavailable', 'Image picker is not available right now.');
    }
  };

  const loadProfile = useCallback(async () => {
    try {
      const endpoint = isWorker ? '/api/workers/me' : '/api/participants/me';
      const { data } = await api.get(endpoint);
      if (data?.ok) {
        const p = isWorker ? data.worker : data.participant;
        if (p) {
          setProfile(p);
          if (isWorker) syncFromWorkerProfile(p);
        }
      }
    } catch (e) {}
    setLoading(false);
  }, [isWorker]);

  const loadUnreadCount = useCallback(async () => {
    try {
      const { data } = await api.get('/api/notifications/unread-count');
      if (data?.ok) setUnreadCount(data.count || 0);
    } catch (e) {}
  }, []);

  useEffect(() => { loadProfile(); loadUnreadCount(); }, [loadProfile, loadUnreadCount]);

  // Refresh unread count on screen focus
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      loadUnreadCount();
    });
    return unsub;
  }, [navigation, loadUnreadCount]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadProfile(), loadUnreadCount()]);
    setRefreshing(false);
  }, [loadProfile, loadUnreadCount]);

  const handleSignOut = () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Are you sure you want to sign out?')) {
        logout();
      }
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: logout },
      ]);
    }
  };

  const deleteAccountNow = async () => {
    if (deletingAccount) return;
    setDeletingAccount(true);
    try {
      const { error } = await api.delete('/api/auth/account');
      if (error) {
        Alert.alert('Delete failed', error.message || 'Could not delete account right now.');
        setDeletingAccount(false);
        return;
      }
      Alert.alert('Account deleted', 'Your account and associated data have been permanently deleted.');
      logout();
    } catch (_) {
      Alert.alert('Delete failed', 'Could not delete account right now.');
    }
    setDeletingAccount(false);
  };

  const handleDeleteAccount = () => {
    if (deletingAccount) return;
    const title = 'Delete Account';
    const message = 'This permanently deletes your account and associated data. This action cannot be undone.';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const firstConfirm = window.confirm(`${title}\n\n${message}`);
      if (!firstConfirm) return;
      const secondConfirm = window.confirm('Final confirmation: delete account permanently?');
      if (!secondConfirm) return;
      deleteAccountNow();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Confirm Delete',
            'Are you sure? This cannot be undone.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete Permanently', style: 'destructive', onPress: deleteAccountNow },
            ],
          );
        },
      },
    ]);
  };

  const firstName = profile?.first_name || '';
  const lastName = profile?.last_name || '';
  const fullName = firstName && lastName ? `${firstName} ${lastName}` : user?.email?.split('@')[0] || 'User';

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* Profile Header Card */}
      <View style={{
        backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg,
        marginBottom: Spacing.md, alignItems: 'center', ...Shadows.md,
      }}>
        <Pressable onPress={pickImage} style={{
          width: 96, height: 96, borderRadius: 48, backgroundColor: Colors.primary,
          alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md, overflow: 'hidden',
        }}>
          {profileImage ? (
            <Image source={{ uri: profileImage }} style={{ width: 96, height: 96, borderRadius: 48 }} />
          ) : (
            <Text style={{ fontSize: 40, color: Colors.text.white }}>
              {(firstName || user?.email || '?')[0].toUpperCase()}
            </Text>
          )}
        </Pressable>
        <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.primary, marginBottom: Spacing.sm }}>Tap to change photo</Text>
        <Text style={{ fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>
          {fullName}
        </Text>
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 2 }}>
          {user?.email}
        </Text>
        <View style={{
          backgroundColor: isWorker ? Colors.primary : Colors.status.info,
          paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: Radius.full, marginTop: Spacing.sm,
        }}>
          <Text style={{ color: Colors.text.white, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold }}>
            {isWorker ? 'WORKER' : 'PARTICIPANT'}
          </Text>
        </View>
        {isWorker && profile?.verification_status && (
          <Text style={{
            marginTop: Spacing.sm, fontSize: Typography.fontSize.sm,
            color: profile.verification_status === 'verified' ? Colors.status.success : Colors.status.warning,
          }}>
            {profile.verification_status === 'verified' ? 'Verified Worker' : 'Verification ' + profile.verification_status}
          </Text>
        )}
      </View>

      {/* Sections with 2 items each; Edit Profile + Payment Details together for participants */}
      <MenuSection>
        <MenuItem label="Notifications" badge={unreadCount} disabled={restricted} onPress={() => safeNavigate('Notifications')} />
        <MenuItem label="Inbox" disabled={restricted} onPress={() => safeNavigate('Messages')} />
      </MenuSection>

      <MenuSection>
        <MenuItem label="Edit Profile" onPress={() => safeNavigate('EditProfile')} />
        {isWorker ? (
          <MenuItem label="Documents" onPress={() => safeNavigate('Documents')} />
        ) : (
          <MenuItem label="Payment Details" onPress={() => safeNavigate('Payments')} />
        )}
      </MenuSection>

      {isWorker && (
        <MenuSection>
          {/* Always enabled: workers need Stripe/payment history before verification can complete */}
          <MenuItem label="Payment Details" disabled={false} onPress={() => safeNavigate('Payments')} />
          <MenuItem label="My Earnings" disabled={restricted} onPress={() => safeNavigate('Earnings')} />
        </MenuSection>
      )}

      <MenuSection>
        {isWorker && (
          <MenuItem label="My Training" disabled={restricted} onPress={() => safeNavigate('Training')} />
        )}
        <MenuItem label="Help & Support" disabled={isWorker && restricted} onPress={() => safeNavigate('Help')} />
      </MenuSection>

      {isWorker && (
        <MenuSection>
          <MenuItem label="Manage Worker Profile" disabled={restricted} onPress={() => safeNavigate('WorkerManage')} />
          <MenuItem label="Invoices" disabled={restricted} onPress={() => safeNavigate('Invoices')} />
        </MenuSection>
      )}
      {!isWorker && (
        <MenuSection>
          <MenuItem label="Invoices" onPress={() => safeNavigate('Invoices')} />
          <MenuItem label="Terms & Conditions" onPress={() => safeNavigate('Terms')} />
        </MenuSection>
      )}
      {isWorker && (
        <MenuSection>
          <MenuItem label="Terms & Conditions" disabled={restricted} onPress={() => safeNavigate('Terms')} />
          {isAdmin && (
            <MenuItem label="Admin Dashboard" disabled={restricted} onPress={() => safeNavigate('AdminDashboard')} />
          )}
        </MenuSection>
      )}
      {isAdmin && !isWorker && (
        <MenuSection>
          <MenuItem label="Admin Dashboard" onPress={() => safeNavigate('AdminDashboard')} />
        </MenuSection>
      )}

      {/* Sign Out */}
      <Pressable
        onPress={handleSignOut}
        style={({ pressed }) => ({
          backgroundColor: Colors.surface, borderRadius: Radius.lg, paddingVertical: Spacing.md,
          paddingHorizontal: Spacing.lg, alignItems: 'center', marginTop: Spacing.sm,
          opacity: pressed ? 0.8 : 1, ...Shadows.sm,
        })}
      >
        <Text style={{ color: Colors.status.error, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.base }}>
          Sign Out
        </Text>
      </Pressable>
      <View
        style={{
          marginTop: Spacing.md,
          marginBottom: Spacing.md,
          paddingHorizontal: Spacing.sm,
        }}
      >
        <Text
          style={{
            color: Colors.text.primary,
            fontSize: Typography.fontSize.xs,
            fontWeight: Typography.fontWeight.semibold,
            marginBottom: 4,
            textAlign: 'center',
          }}
        >
          Caution
        </Text>
        <Text
          style={{
            fontSize: Typography.fontSize.xs,
            color: Colors.text.muted,
            textAlign: 'center',
            marginBottom: Spacing.sm,
          }}
        >
          Long-press only if you want to permanently delete the account.
        </Text>
        <Pressable
          onPress={() => Alert.alert('Hold to Delete', 'Long-press the button to start account deletion.')}
          onLongPress={handleDeleteAccount}
          delayLongPress={650}
          disabled={deletingAccount}
          style={({ pressed }) => ({
            backgroundColor: Colors.surface,
            borderWidth: 1,
            borderColor: Colors.border,
            borderRadius: Radius.lg,
            minHeight: 44,
            paddingVertical: Spacing.sm,
            paddingHorizontal: Spacing.lg,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: deletingAccount ? 0.6 : (pressed ? 0.85 : 1),
          })}
        >
          <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.medium, fontSize: Typography.fontSize.xs }}>
            {deletingAccount ? 'Deleting account...' : 'Long press to delete account'}
          </Text>
        </Pressable>
        <Text
          style={{
            marginTop: Spacing.xs,
            fontSize: Typography.fontSize.xs,
            color: Colors.text.muted,
            textAlign: 'center',
          }}
        >
          Deleting your account permanently removes your profile, bookings, and related data.
        </Text>
      </View>
    </ScrollView>
  );
}
