/**
 * Summit Staffing – Admin Dashboard Screen
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, FlatList, Alert,
  RefreshControl, Modal, TextInput, ActivityIndicator,
} from 'react-native';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';
import { useAuthStore } from '../store/authStore.js';

/* ───── stat card ───── */
function StatCard({ label, value, color }) {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, margin: Spacing.xs, ...Shadows.sm, borderLeftWidth: 4, borderLeftColor: color || Colors.primary }}>
      <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted }}>{label}</Text>
      <Text style={{ fontSize: Typography.fontSize.xxl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginTop: 4 }}>{value ?? '—'}</Text>
    </View>
  );
}

/* ───── tabs ───── */
const TABS = ['Overview', 'Documents', 'Users', 'Revenue'];

export function AdminDashboardScreen({ navigation }) {
  const { user } = useAuthStore();
  const [tab, setTab] = useState('Overview');
  const [refreshing, setRefreshing] = useState(false);

  // Overview
  const [stats, setStats] = useState(null);

  // Documents
  const [docs, setDocs] = useState([]);

  // Users
  const [users, setUsers] = useState([]);
  const [searchQ, setSearchQ] = useState('');
  const [showComplianceModal, setShowComplianceModal] = useState(false);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [complianceUser, setComplianceUser] = useState(null);
  const [complianceItems, setComplianceItems] = useState([]);

  // Revenue
  const [revenue, setRevenue] = useState(null);
  const [bookingMetrics, setBookingMetrics] = useState(null);

  /* ── loaders ── */
  const loadOverview = useCallback(async () => {
    const { data } = await api.get('/api/admin/dashboard');
    if (data) setStats(data);
  }, []);

  const loadDocs = useCallback(async () => {
    const { data } = await api.get('/api/admin/documents/pending');
    if (data?.ok && data?.documents) setDocs(data.documents);
    else if (data && Array.isArray(data)) setDocs(data);
  }, []);

  const loadUsers = useCallback(async () => {
    const qs = searchQ ? `?search=${encodeURIComponent(searchQ)}` : '';
    const { data } = await api.get(`/api/admin/users${qs}`);
    if (data?.ok && data?.users) setUsers(data.users);
    else if (data && Array.isArray(data)) setUsers(data);
  }, [searchQ]);

  const loadRevenue = useCallback(async () => {
    const [rev, bm] = await Promise.all([
      api.get('/api/admin/reports/revenue'),
      api.get('/api/admin/reports/bookings'),
    ]);
    if (rev.data?.ok) setRevenue(rev.data);
    if (bm.data?.ok) setBookingMetrics(bm.data);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (tab === 'Overview') await loadOverview();
      else if (tab === 'Documents') await loadDocs();
      else if (tab === 'Users') await loadUsers();
      else if (tab === 'Revenue') await loadRevenue();
    } catch (e) { /* */ }
    setRefreshing(false);
  }, [tab, loadOverview, loadDocs, loadUsers, loadRevenue]);

  useEffect(() => { refresh(); }, [tab]);

  /* ── actions ── */
  const handleDoc = async (docId, action) => {
    const url = `/api/admin/documents/${docId}/${action}`;
    const { error } = await api.put(url);
    if (error) Alert.alert('Error', error.message);
    else { Alert.alert('Success', `Document ${action}d`); loadDocs(); }
  };

  const toggleSuspend = async (uid, isSuspended) => {
    if (isSuspended) {
      Alert.alert('Info', 'This user is already suspended. Unsuspension is not yet available via the API.');
      return;
    }
    Alert.alert('Suspend User', 'Are you sure you want to suspend this user?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Suspend', style: 'destructive', onPress: async () => {
        const { error } = await api.put(`/api/admin/users/${uid}/suspend`, { reason: 'Suspended by admin' });
        if (error) Alert.alert('Error', error.message);
        else { Alert.alert('Success', 'User suspended'); loadUsers(); }
      }},
    ]);
  };

  const loadCompliance = async (userRow) => {
    setComplianceLoading(true);
    setComplianceUser(userRow);
    setShowComplianceModal(true);
    const { data, error } = await api.get(`/api/admin/users/${userRow.id}/compliance`);
    if (error) {
      Alert.alert('Error', error.message || 'Failed to load compliance');
      setComplianceItems([]);
    } else {
      setComplianceItems(data?.items || []);
    }
    setComplianceLoading(false);
  };

  const updateComplianceItem = async (itemKey, action) => {
    if (!complianceUser) return;
    const { error } = await api.put(`/api/admin/users/${complianceUser.id}/compliance/${itemKey}`, {
      action,
      reason: action === 'reject' ? 'Rejected by admin' : null,
    });
    if (error) {
      Alert.alert('Error', error.message || 'Failed to update status');
      return;
    }
    await loadCompliance(complianceUser);
  };

  /* ── render ── */
  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
        {TABS.map(t => (
          <Pressable key={t} onPress={() => setTab(t)}
            style={{ paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, borderBottomWidth: 3, borderBottomColor: tab === t ? Colors.primary : 'transparent' }}>
            <Text style={{ fontWeight: tab === t ? Typography.fontWeight.bold : Typography.fontWeight.normal, color: tab === t ? Colors.primary : Colors.text.secondary }}>{t}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.primary} />}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 40 }}>

        {/* ── OVERVIEW ── */}
        {tab === 'Overview' && (
          <>
            <Text style={{ fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.md }}>Admin Dashboard</Text>
            {stats ? (
              <>
                <View style={{ flexDirection: 'row', marginBottom: Spacing.sm }}>
                  <StatCard label="Workers" value={stats.workers} color="#10B981" />
                  <StatCard label="Participants" value={stats.participants} color="#8B5CF6" />
                </View>
                <View style={{ flexDirection: 'row', marginBottom: Spacing.sm }}>
                  <StatCard label="Active Users (30d)" value={stats.active_users_last_30_days} color="#06B6D4" />
                  <StatCard label="Pending Docs" value={stats.pending_document_verifications} color="#EC4899" />
                </View>
                <View style={{ flexDirection: 'row', marginBottom: Spacing.sm }}>
                  <StatCard label="Total Revenue" value={`$${Number(stats.revenue?.total ?? 0).toLocaleString()}`} color="#EF4444" />
                  <StatCard label="This Month" value={`$${Number(stats.revenue?.this_month ?? 0).toLocaleString()}`} color="#F59E0B" />
                </View>
                {stats.bookings && (
                  <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, ...Shadows.sm }}>
                    <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm }}>Bookings by Status</Text>
                    {Object.entries(stats.bookings).map(([status, count]) => (
                      <View key={status} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                        <Text style={{ color: Colors.text.secondary, textTransform: 'capitalize' }}>{status.replace('_', ' ')}</Text>
                        <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.bold }}>{count}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />}
          </>
        )}

        {/* ── DOCUMENTS ── */}
        {tab === 'Documents' && (
          <>
            <Text style={{ fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.md }}>Pending Documents</Text>
            {docs.length === 0 && <Text style={{ color: Colors.text.muted, textAlign: 'center', marginTop: 40 }}>No pending documents</Text>}
            {docs.map(d => (
              <View key={d.id} style={{ backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadows.sm }}>
                <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>{d.document_type || d.type}</Text>
                <Text style={{ color: Colors.text.secondary, marginVertical: 4 }}>Worker: {d.first_name ? `${d.first_name} ${d.last_name || ''}` : d.worker_name || `ID: ${d.worker_id}`}</Text>
                <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.xs }}>Uploaded: {new Date(d.created_at || d.uploaded_at).toLocaleDateString()}</Text>
                <View style={{ flexDirection: 'row', marginTop: Spacing.sm }}>
                  <Pressable onPress={() => handleDoc(d.id, 'approve')}
                    style={{ flex: 1, backgroundColor: '#10B981', padding: Spacing.sm, borderRadius: Radius.sm, alignItems: 'center', marginRight: Spacing.xs }}>
                    <Text style={{ color: '#fff', fontWeight: Typography.fontWeight.bold }}>Approve</Text>
                  </Pressable>
                  <Pressable onPress={() => handleDoc(d.id, 'reject')}
                    style={{ flex: 1, backgroundColor: '#EF4444', padding: Spacing.sm, borderRadius: Radius.sm, alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: Typography.fontWeight.bold }}>Reject</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── USERS ── */}
        {tab === 'Users' && (
          <>
            <Text style={{ fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm }}>User Management</Text>
            <TextInput value={searchQ} onChangeText={setSearchQ} onSubmitEditing={loadUsers} placeholder="Search users…" placeholderTextColor={Colors.text.muted}
              style={{ backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md, color: Colors.text.primary, borderWidth: 1, borderColor: Colors.border }} />
            {users.length === 0 && <Text style={{ color: Colors.text.muted, textAlign: 'center', marginTop: 30 }}>No users found</Text>}
            {users.map(u => (
              <View key={u.id} style={{ backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadows.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>{u.email}</Text>
                  <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.xs }}>{u.role} • {u.is_suspended ? ' Suspended' : ' Active'} • Joined {new Date(u.created_at).toLocaleDateString()}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  {u.role === 'worker' && (
                    <Pressable
                      onPress={() => loadCompliance(u)}
                      style={{ backgroundColor: Colors.primary, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.sm }}
                    >
                      <Text style={{ color: '#fff', fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.xs }}>
                        Review Compliance
                      </Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => toggleSuspend(u.id, u.is_suspended || u.suspended)}
                    style={{ backgroundColor: (u.is_suspended || u.suspended) ? Colors.text.muted : '#EF4444', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.sm }}>
                    <Text style={{ color: '#fff', fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.xs }}>
                      {(u.is_suspended || u.suspended) ? 'Suspended' : 'Suspend'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── REVENUE ── */}
        {tab === 'Revenue' && (
          <>
            <Text style={{ fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.md }}>Revenue & Metrics</Text>
            {revenue ? (
              <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md, ...Shadows.sm }}>
                <Text style={{ color: Colors.text.muted, marginBottom: 4 }}>Revenue Report</Text>
                {Array.isArray(revenue.report) && revenue.report.length > 0 ? (
                  revenue.report.map((r, i) => (
                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                      <Text style={{ color: Colors.text.secondary }}>{r.period ? new Date(r.period).toLocaleDateString() : `Period ${i + 1}`}</Text>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ color: '#10B981', fontWeight: Typography.fontWeight.bold }}>${Number(r.total_revenue || 0).toLocaleString()}</Text>
                        <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.xs }}>{r.total_bookings || 0} bookings</Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <Text style={{ color: Colors.text.muted, textAlign: 'center', marginTop: Spacing.md }}>No revenue data yet</Text>
                )}
              </View>
            ) : <ActivityIndicator color={Colors.primary} />}

            {bookingMetrics ? (
              <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, ...Shadows.sm }}>
                <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm }}>Booking Metrics</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                  <Text style={{ color: Colors.text.secondary }}>Avg Booking Value</Text>
                  <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.bold }}>${Number(bookingMetrics.average_booking_value || 0).toFixed(2)}</Text>
                </View>
                {bookingMetrics.bookings_by_status && Object.entries(bookingMetrics.bookings_by_status).map(([status, count]) => (
                  <View key={status} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                    <Text style={{ color: Colors.text.secondary, textTransform: 'capitalize' }}>{status.replace('_', ' ')}</Text>
                    <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.bold }}>{count}</Text>
                  </View>
                ))}
                {Array.isArray(bookingMetrics.most_popular_service_types) && bookingMetrics.most_popular_service_types.length > 0 && (
                  <>
                    <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginTop: Spacing.md, marginBottom: Spacing.xs }}>Popular Services</Text>
                    {bookingMetrics.most_popular_service_types.map((s, i) => (
                      <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                        <Text style={{ color: Colors.text.secondary }}>{s.service_type}</Text>
                        <Text style={{ color: Colors.text.primary }}>{s.total}</Text>
                      </View>
                    ))}
                  </>
                )}
              </View>
            ) : null}
          </>
        )}

      </ScrollView>

      <Modal visible={showComplianceModal} animationType="slide" transparent onRequestClose={() => setShowComplianceModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: Colors.surface, borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, maxHeight: '85%', padding: Spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm }}>
              <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>
                Worker Compliance Review
              </Text>
              <Pressable onPress={() => setShowComplianceModal(false)}>
                <Text style={{ fontSize: 22, color: Colors.text.muted }}>✕</Text>
              </Pressable>
            </View>
            <Text style={{ color: Colors.text.secondary, marginBottom: Spacing.md }}>{complianceUser?.email || ''}</Text>

            {complianceLoading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.lg }} />
            ) : (
              <ScrollView>
                {complianceItems.map((item) => (
                  <View key={item.key} style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm }}>
                    <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.semibold }}>{item.label}</Text>
                    <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.xs, marginTop: 2 }}>
                      Status: {item.status}
                    </Text>
                    {!!item.reason && (
                      <Text style={{ color: Colors.status.error, fontSize: Typography.fontSize.xs, marginTop: 2 }}>
                        Reason: {item.reason}
                      </Text>
                    )}
                    {item.actionable && (
                      <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm }}>
                        <Pressable
                          onPress={() => updateComplianceItem(item.key, 'approve')}
                          style={{ flex: 1, backgroundColor: Colors.status.success, paddingVertical: Spacing.sm, borderRadius: Radius.sm, alignItems: 'center' }}
                        >
                          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>Approve</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => updateComplianceItem(item.key, 'reject')}
                          style={{ flex: 1, backgroundColor: Colors.status.error, paddingVertical: Spacing.sm, borderRadius: Radius.sm, alignItems: 'center' }}
                        >
                          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>Reject</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => updateComplianceItem(item.key, 'pending')}
                          style={{ flex: 1, backgroundColor: Colors.status.warning, paddingVertical: Spacing.sm, borderRadius: Radius.sm, alignItems: 'center' }}
                        >
                          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>Pending</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                ))}
                {complianceItems.length === 0 && (
                  <Text style={{ color: Colors.text.muted, textAlign: 'center', marginTop: Spacing.md }}>
                    No compliance items found.
                  </Text>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
