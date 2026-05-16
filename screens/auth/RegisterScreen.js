/**
 * Summit Staffing – Register screen (worker or participant)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuthStore, clearCoordinatorImpersonationStashSync } from '../../store/authStore.js';
import { useLoading } from '../../hooks/useLoading.js';
import { useErrorHandler } from '../../hooks/useErrorHandler.js';
import { api } from '../../services/api.js';
import { LoadingScreen } from '../../components/LoadingScreen.js';
import { Colors, Spacing, Typography, Radius } from '../../constants/theme.js';
import { VENDOR_CATEGORIES } from '../../constants/vendorCategories.js';

const inputStyle = {
  backgroundColor: Colors.surface,
  borderWidth: 1,
  borderColor: Colors.border,
  borderRadius: Radius.md,
  paddingVertical: Spacing.md,
  paddingHorizontal: Spacing.lg,
  fontSize: Typography.fontSize.base,
  color: Colors.text.primary,
};

const buttonStyle = (pressed) => ({
  backgroundColor: Colors.primary,
  paddingVertical: Spacing.md,
  borderRadius: Radius.md,
  alignItems: 'center',
  opacity: pressed ? 0.9 : 1,
});

export function RegisterScreen({ navigation, route }) {
  const roleFromRoute = route.params?.role;
  const inviteTokenFromRoute = route.params?.coordinatorInviteToken;
  const emailFromRoute = route.params?.email;
  const isProvideSupportFlow = roleFromRoute === 'worker';
  const isCoordinatorFlow = roleFromRoute === 'coordinator';
  const initialRole = roleFromRoute === 'worker'
    ? 'worker'
    : roleFromRoute === 'coordinator'
      ? 'coordinator'
      : 'participant';
  const [role, setRole] = useState(initialRole);
  const [workAs, setWorkAs] = useState('individual');
  const [email, setEmail] = useState(emailFromRoute ? String(emailFromRoute).trim().toLowerCase() : '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [abn, setAbn] = useState('');
  const [abnChecking, setAbnChecking] = useState(false);
  const [abnVerified, setAbnVerified] = useState(null);
  const [abnEntityName, setAbnEntityName] = useState('');
  const [ndisNumber, setNdisNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [coordinatorInviteToken, setCoordinatorInviteToken] = useState(
    inviteTokenFromRoute ? String(inviteTokenFromRoute).trim() : ''
  );
  const [showVendorCategoryDropdown, setShowVendorCategoryDropdown] = useState(false);
  const [vendorCategories, setVendorCategories] = useState([]);
  const { setAuth } = useAuthStore();
  const { isLoading, withLoading } = useLoading();
  const { error, handleError, clearError } = useErrorHandler();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      const usp = new URLSearchParams(window.location.search);
      const inv = usp.get('coordinatorInvite');
      const em = usp.get('email');
      const r = usp.get('role');
      if (inv) {
        setCoordinatorInviteToken(inv.trim());
        setRole('coordinator');
      }
      if (em) setEmail(String(em).trim().toLowerCase());
      if (r === 'coordinator') setRole('coordinator');
    } catch (_) {}
  }, []);

  const onRegister = withLoading(async () => {
    clearError();
    const body = {
      email: email.trim().toLowerCase(),
      password,
      role,
      first_name: firstName.trim() || undefined,
      last_name: lastName.trim() || undefined,
      phone: phone.trim() || undefined,
    };
    if (role === 'worker') {
      body.abn = abn.replace(/\D/g, '').slice(0, 11);
      if (body.abn?.length !== 11) {
        handleError(new Error('ABN must be 11 digits (Australian Business Number only)'));
        return;
      }
      setAbnChecking(true);
      const abnRes = await api.post('/api/workers/verify-abn', { abn: body.abn });
      setAbnChecking(false);
      if (abnRes.error || !abnRes.data?.valid) {
        handleError(new Error(abnRes.data?.error || abnRes.error?.message || 'Invalid Australian ABN. Summit Staffing is Australia-only.'));
        return;
      }
      body.work_as = workAs;
      if (workAs === 'vendor') {
        if (vendorCategories.length === 0) {
          handleError(new Error('Please select at least one vendor category'));
          return;
        }
        body.vendor_categories = vendorCategories;
      }
    }
    if (role === 'participant' && ndisNumber.trim()) {
      body.ndis_number = ndisNumber.replace(/\D/g, '').slice(0, 10);
    }
    if (role === 'coordinator' && coordinatorInviteToken) {
      body.coordinator_invite_token = coordinatorInviteToken;
    }

    const { data, error: err } = await api.post('/api/auth/register', body);
    if (err) {
      handleError(err);
      return;
    }
    if (data?.ok && data?.token) {
      clearCoordinatorImpersonationStashSync();
      setAuth(data.token, data.user);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.search?.includes('coordinatorInvite')) {
        try {
          window.history.replaceState({}, '', window.location.pathname || '/');
        } catch (_) {}
      }
    } else {
      handleError(new Error(data?.error || 'Registration failed'));
    }
  });

  if (isLoading) {
    return <LoadingScreen message="Creating account…" />;
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.xs }}>
          Sign up
        </Text>
        <Text style={{ fontSize: Typography.fontSize.base, color: Colors.text.secondary, marginBottom: Spacing.lg }}>
          {isProvideSupportFlow ? 'Create your worker account' : 'Join as a participant, worker, or coordinator'}
        </Text>

        {role === 'coordinator' && coordinatorInviteToken ? (
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.status.success, marginBottom: Spacing.md, padding: Spacing.md, backgroundColor: `${Colors.status.success}18`, borderRadius: Radius.md }}>
            You are signing up from a participant invitation. Use the same email the invitation was sent to. After you create your account, you will be linked to manage their profile.
          </Text>
        ) : null}

        {!isProvideSupportFlow && !isCoordinatorFlow && (
          <>
            <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: Colors.text.primary, marginBottom: Spacing.sm }}>
              I am a
            </Text>
            <View style={{ flexDirection: 'row', marginBottom: Spacing.lg, gap: Spacing.sm }}>
              <Pressable
                onPress={() => setRole('participant')}
                style={{
                  flex: 1,
                  paddingVertical: Spacing.md,
                  borderRadius: Radius.md,
                  backgroundColor: role === 'participant' ? Colors.primary : Colors.surface,
                  borderWidth: 1,
                  borderColor: role === 'participant' ? Colors.primary : Colors.border,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: role === 'participant' ? Colors.text.white : Colors.text.primary, fontWeight: Typography.fontWeight.semibold }}>
                  Participant
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setRole('worker')}
                style={{
                  flex: 1,
                  paddingVertical: Spacing.md,
                  borderRadius: Radius.md,
                  backgroundColor: role === 'worker' ? Colors.primary : Colors.surface,
                  borderWidth: 1,
                  borderColor: role === 'worker' ? Colors.primary : Colors.border,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: role === 'worker' ? Colors.text.white : Colors.text.primary, fontWeight: Typography.fontWeight.semibold }}>
                  Worker
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setRole('coordinator')}
                style={{
                  flex: 1,
                  paddingVertical: Spacing.md,
                  borderRadius: Radius.md,
                  backgroundColor: role === 'coordinator' ? Colors.primary : Colors.surface,
                  borderWidth: 1,
                  borderColor: role === 'coordinator' ? Colors.primary : Colors.border,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: role === 'coordinator' ? Colors.text.white : Colors.text.primary, fontWeight: Typography.fontWeight.semibold }}>
                  Coordinator
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {role === 'worker' && (
          <>
            <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: Colors.text.primary, marginBottom: Spacing.sm }}>
              Work as a
            </Text>
            <View style={{ flexDirection: 'row', marginBottom: Spacing.lg, gap: Spacing.sm }}>
              <Pressable
                onPress={() => setWorkAs('individual')}
                style={{
                  flex: 1,
                  paddingVertical: Spacing.md,
                  borderRadius: Radius.md,
                  backgroundColor: workAs === 'individual' ? Colors.primary : Colors.surface,
                  borderWidth: 1,
                  borderColor: workAs === 'individual' ? Colors.primary : Colors.border,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: workAs === 'individual' ? Colors.text.white : Colors.text.primary, fontWeight: Typography.fontWeight.semibold }}>
                  Individual
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setWorkAs('vendor')}
                style={{
                  flex: 1,
                  paddingVertical: Spacing.md,
                  borderRadius: Radius.md,
                  backgroundColor: workAs === 'vendor' ? Colors.primary : Colors.surface,
                  borderWidth: 1,
                  borderColor: workAs === 'vendor' ? Colors.primary : Colors.border,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: workAs === 'vendor' ? Colors.text.white : Colors.text.primary, fontWeight: Typography.fontWeight.semibold }}>
                  Vendor
                </Text>
              </Pressable>
            </View>
            {workAs === 'vendor' && (
              <>
                <Text style={{ fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: Colors.text.primary, marginBottom: Spacing.sm }}>
                  Vendor categories
                </Text>
                <Pressable
                  onPress={() => setShowVendorCategoryDropdown((v) => !v)}
                  style={{
                    ...inputStyle,
                    marginBottom: Spacing.sm,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: vendorCategories.length ? Colors.text.primary : Colors.text.muted }}>
                    {vendorCategories.length ? `${vendorCategories.length} selected` : 'Select categories'}
                  </Text>
                  <Text style={{ color: Colors.text.muted }}>{showVendorCategoryDropdown ? '▲' : '▼'}</Text>
                </Pressable>
                {showVendorCategoryDropdown && (
                  <View style={{ backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.sm, marginBottom: Spacing.md, maxHeight: 220 }}>
                    <ScrollView nestedScrollEnabled>
                      {VENDOR_CATEGORIES.map((cat) => {
                        const selected = vendorCategories.includes(cat);
                        return (
                          <Pressable
                            key={cat}
                            onPress={() => {
                              setVendorCategories((prev) => selected ? prev.filter((x) => x !== cat) : [...prev, cat]);
                            }}
                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}
                          >
                            <Text style={{ color: Colors.text.primary, flex: 1, marginRight: Spacing.sm }}>{cat}</Text>
                            <Text style={{ color: selected ? Colors.primary : Colors.text.muted }}>{selected ? '✓' : '○'}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </>
            )}
          </>
        )}

        <Text style={labelStyle}>Email</Text>
        <TextInput style={[inputStyle, { marginBottom: Spacing.md }]} placeholder="you@example.com" placeholderTextColor={Colors.text.muted} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" editable={!isLoading} />

        <Text style={labelStyle}>Password (min 8 characters)</Text>
        <View style={{ position: 'relative', marginBottom: Spacing.md }}>
          <TextInput
            style={[inputStyle, { paddingRight: 52, marginBottom: 0 }]}
            placeholder="••••••••"
            placeholderTextColor={Colors.text.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            editable={!isLoading}
          />
          <Pressable
            onPress={() => setShowPassword((prev) => !prev)}
            style={({ pressed }) => ({
              position: 'absolute',
              right: 12,
              top: 0,
              bottom: 0,
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
            hitSlop={8}
          >
            <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.sm }}>
              {showPassword ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        </View>

        <Text style={labelStyle}>First name</Text>
        <TextInput style={[inputStyle, { marginBottom: Spacing.md }]} placeholder="First name" placeholderTextColor={Colors.text.muted} value={firstName} onChangeText={setFirstName} editable={!isLoading} />

        <Text style={labelStyle}>Last name</Text>
        <TextInput style={[inputStyle, { marginBottom: Spacing.md }]} placeholder="Last name" placeholderTextColor={Colors.text.muted} value={lastName} onChangeText={setLastName} editable={!isLoading} />

        {role === 'worker' && (
          <>
            <Text style={labelStyle}>Australian ABN (11 digits) *</Text>
            <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginBottom: Spacing.sm }}>
              Workers must use a valid Australian Business Number. Random or overseas numbers are not accepted.
            </Text>
            <TextInput
              style={[inputStyle, { marginBottom: Spacing.xs }]}
              placeholder="e.g. 73690199501"
              placeholderTextColor={Colors.text.muted}
              value={abn}
              onChangeText={(v) => {
                setAbn(v.replace(/\D/g, '').slice(0, 11));
                setAbnVerified(null);
                setAbnEntityName('');
              }}
              keyboardType="number-pad"
              maxLength={11}
              editable={!isLoading && !abnChecking}
            />
            {abn.replace(/\D/g, '').length === 11 && (
              <Pressable
                onPress={async () => {
                  const digits = abn.replace(/\D/g, '');
                  setAbnChecking(true);
                  const { data, error: abnErr } = await api.post('/api/workers/verify-abn', { abn: digits });
                  setAbnChecking(false);
                  if (abnErr || !data?.valid) {
                    setAbnVerified(false);
                    setAbnEntityName('');
                    handleError(new Error(data?.error || abnErr?.message || 'Invalid Australian ABN'));
                    return;
                  }
                  setAbnVerified(true);
                  setAbnEntityName(data.entity_name || '');
                  clearError();
                }}
                style={({ pressed }) => ({ marginBottom: Spacing.md, opacity: pressed ? 0.8 : 1 })}
              >
                <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.sm }}>
                  {abnChecking ? 'Checking ABN…' : 'Verify ABN (Australia)'}
                </Text>
              </Pressable>
            )}
            {abnVerified === true && (
              <Text style={{ color: Colors.status.success, fontSize: Typography.fontSize.sm, marginBottom: Spacing.md }}>
                Valid Australian ABN{abnEntityName ? `: ${abnEntityName}` : ''}
              </Text>
            )}
          </>
        )}
        {role === 'participant' && (
          <>
            <Text style={labelStyle}>NDIS number (optional, 10 digits)</Text>
            <TextInput style={[inputStyle, { marginBottom: Spacing.md }]} placeholder="4300123456" placeholderTextColor={Colors.text.muted} value={ndisNumber} onChangeText={setNdisNumber} keyboardType="number-pad" maxLength={10} editable={!isLoading} />
          </>
        )}

        <Text style={labelStyle}>Phone (optional)</Text>
        <TextInput style={[inputStyle, { marginBottom: Spacing.lg }]} placeholder="0400000000" placeholderTextColor={Colors.text.muted} value={phone} onChangeText={setPhone} keyboardType="phone-pad" editable={!isLoading} />

        {error ? (
          <Text style={{ color: Colors.status.error, fontSize: Typography.fontSize.sm, marginBottom: Spacing.md }}>
            {error.message}
          </Text>
        ) : null}

        <Pressable onPress={onRegister} style={({ pressed }) => buttonStyle(pressed)}>
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.base }}>
            Create account
          </Text>
        </Pressable>

        <Pressable onPress={() => navigation.navigate('Login')} style={{ marginTop: Spacing.lg, alignItems: 'center' }}>
          <Text style={{ color: Colors.text.secondary, fontSize: Typography.fontSize.sm }}>
            Already have an account? <Text style={{ color: Colors.primary, fontWeight: Typography.fontWeight.semibold }}>Sign in</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const labelStyle = { fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.medium, color: Colors.text.primary, marginBottom: Spacing.sm };
