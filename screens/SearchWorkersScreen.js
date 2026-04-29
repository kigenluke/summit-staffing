/**
 * Summit Staffing – Search/Browse Workers Screen
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, RefreshControl, ActivityIndicator, FlatList, Linking, Platform } from 'react-native';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';
import { getServiceTypeSuggestions } from '../constants/serviceTypes.js';
import { VENDOR_CATEGORIES } from '../constants/vendorCategories.js';

const toRad = (deg) => (Number(deg) * Math.PI) / 180;
const distanceMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = toRad(Number(lat2) - Number(lat1));
  const dLon = toRad(Number(lon2) - Number(lon1));
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const WorkerCard = ({ worker, onPress, isVendorMode = false }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => ({
      backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg,
      marginBottom: Spacing.sm, opacity: pressed ? 0.9 : 1, ...Shadows.md,
    })}
  >
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{
        width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary,
        alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md,
      }}>
        <Text style={{ fontSize: 24, color: Colors.text.white }}>
          {worker.first_name?.[0]?.toUpperCase() || '?'}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>
          {worker.first_name} {worker.last_name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.status.warning }}>
            {Number(worker.rating || 0).toFixed(1)}
          </Text>
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.muted, marginLeft: Spacing.sm }}>
            ({worker.total_reviews || 0} reviews)
          </Text>
        </View>
        {worker.verification_status === 'verified' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.status.success }}>Verified</Text>
          </View>
        )}
        {isVendorMode && (
          <View style={{ marginTop: 4 }}>
            <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary }}>
              Category: {(Array.isArray(worker.skills) && worker.skills.length > 0) ? worker.skills[0] : 'Not set'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
              <Text style={{ fontSize: Typography.fontSize.xs, color: worker.has_vendor_category ? Colors.status.success : Colors.status.error }}>
                {worker.has_vendor_category ? 'Category added' : 'No category'}
              </Text>
            <Text style={{ fontSize: Typography.fontSize.xs, color: worker.has_vendor_documents ? Colors.status.success : Colors.status.error }}>
              {worker.has_vendor_documents ? 'Docs added' : 'No docs'}
            </Text>
            </View>
          </View>
        )}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.primary }}>
          ${worker.hourly_rate || '—'}
        </Text>
        <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted }}>/hour</Text>
        {isVendorMode && worker.distance_m != null && (
          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginTop: 2 }}>
            {(Number(worker.distance_m) / 1000).toFixed(1)} km
          </Text>
        )}
      </View>
    </View>
    {worker.bio && (
      <Text numberOfLines={2} style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.sm }}>
        {worker.bio}
      </Text>
    )}
  </Pressable>
);

export function SearchWorkersScreen({ navigation }) {
  const [mode, setMode] = useState('worker');
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [vendorCategoryFilter, setVendorCategoryFilter] = useState('');
  const [participantLocation, setParticipantLocation] = useState({ latitude: null, longitude: null });
  const [locationAvailable, setLocationAvailable] = useState(true);

  const loadWorkers = useCallback(async () => {
    try {
      let data;
      let coords = { latitude: null, longitude: null };
      try {
        const participantRes = await api.get('/api/participants/me');
        if (participantRes?.data?.ok && participantRes.data.participant) {
          coords = {
            latitude: Number(participantRes.data.participant.latitude) || null,
            longitude: Number(participantRes.data.participant.longitude) || null,
          };
          setParticipantLocation(coords);
          setLocationAvailable(coords.latitude != null && coords.longitude != null);
        }
      } catch (_) {}

      if (mode === 'vendor' && coords.latitude != null && coords.longitude != null) {
        const res = await api.get('/api/workers/search', {
          params: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            radiusKm: 30,
            limit: 50,
          },
        });
        data = res.data;

        // Fallback: if no nearby vendors, still show vendor-ready profiles.
        if (!data?.workers || data.workers.length === 0) {
          const allRes = await api.get('/api/workers?limit=50');
          if (allRes?.data?.ok && Array.isArray(allRes.data.workers)) {
            data = {
              ...allRes.data,
              workers: allRes.data.workers.map((w) => {
                if (w.latitude != null && w.longitude != null) {
                  return { ...w, distance_m: distanceMeters(coords.latitude, coords.longitude, w.latitude, w.longitude) };
                }
                return { ...w, distance_m: null };
              }),
            };
          }
        }
      } else {
        if (mode === 'vendor') setLocationAvailable(false);
        const res = await api.get('/api/workers?limit=50');
        data = res.data;
      }
      if (data?.ok && data?.workers) {
        setWorkers(data.workers);
      }
    } catch (e) {}
    setLoading(false);
  }, [mode]);

  useEffect(() => { loadWorkers(); }, [loadWorkers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadWorkers();
    setRefreshing(false);
  }, [loadWorkers]);

  const baseFiltered = workers.filter(w => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const suggestedTypes = getServiceTypeSuggestions(searchQuery).map((s) => s.toLowerCase());
    const workerSkills = Array.isArray(w.skills) ? w.skills.map((s) => String(s).toLowerCase()) : [];
    return (
      (w.first_name || '').toLowerCase().includes(q) ||
      (w.last_name || '').toLowerCase().includes(q) ||
      (w.bio || '').toLowerCase().includes(q) ||
      workerSkills.some((s) => s.includes(q) || q.includes(s)) ||
      suggestedTypes.some((type) => workerSkills.includes(type))
    );
  });
  const filtered = baseFiltered.filter((w) => {
    if (mode !== 'vendor') return true;
    if (!w.has_vendor_category) return false;
    if (!vendorCategoryFilter) return true;
    const skillList = Array.isArray(w.skills) ? w.skills.map((s) => String(s).toLowerCase()) : [];
    return skillList.includes(String(vendorCategoryFilter).toLowerCase());
  });
  const vendorsMissingCategory = mode === 'vendor' && baseFiltered.some((w) => !w.has_vendor_category);
  const vendorsMissingDocs = mode === 'vendor' && baseFiltered.some((w) => !w.has_vendor_documents);
  const isAmbulanceCategory = mode === 'vendor' && vendorCategoryFilter === 'Ambulance Services';

  const callAmbulance = useCallback(async () => {
    const telUrl = 'tel:000';
    try {
      const canOpen = await Linking.canOpenURL(telUrl);
      if (canOpen) {
        await Linking.openURL(telUrl);
        return;
      }
    } catch (_) {}
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = telUrl;
    }
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flexDirection: 'row', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, gap: Spacing.sm }}>
        <Pressable
          onPress={() => setMode('worker')}
          style={{
            flex: 1,
            backgroundColor: mode === 'worker' ? Colors.primary : Colors.surface,
            borderColor: mode === 'worker' ? Colors.primary : Colors.border,
            borderWidth: 1,
            borderRadius: Radius.md,
            paddingVertical: Spacing.sm,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: mode === 'worker' ? Colors.text.white : Colors.text.primary, fontWeight: Typography.fontWeight.semibold }}>
            Support Workers
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setMode('vendor')}
          style={{
            flex: 1,
            backgroundColor: mode === 'vendor' ? Colors.primary : Colors.surface,
            borderColor: mode === 'vendor' ? Colors.primary : Colors.border,
            borderWidth: 1,
            borderRadius: Radius.md,
            paddingVertical: Spacing.sm,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: mode === 'vendor' ? Colors.text.white : Colors.text.primary, fontWeight: Typography.fontWeight.semibold }}>
            Vendors Near You
          </Text>
        </Pressable>
      </View>

      {/* Search Bar */}
      <View style={{ padding: Spacing.md, backgroundColor: Colors.surface, ...Shadows.sm }}>
        <TextInput
          style={{
            backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.md,
            paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg,
            fontSize: Typography.fontSize.base, color: Colors.text.primary,
          }}
          placeholder="Search workers..."
          placeholderTextColor={Colors.text.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {mode === 'vendor' && (
          <>
            <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginTop: Spacing.sm, marginBottom: 6 }}>
              Filter by vendor category
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
                <Pressable
                  onPress={() => setVendorCategoryFilter('')}
                  style={{
                    borderRadius: Radius.full,
                    borderWidth: 1,
                    borderColor: !vendorCategoryFilter ? Colors.primary : Colors.border,
                    backgroundColor: !vendorCategoryFilter ? `${Colors.primary}22` : Colors.surface,
                    paddingHorizontal: Spacing.sm,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ color: !vendorCategoryFilter ? Colors.primary : Colors.text.secondary, fontSize: Typography.fontSize.xs }}>All</Text>
                </Pressable>
                {VENDOR_CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => setVendorCategoryFilter(cat)}
                    style={{
                      borderRadius: Radius.full,
                      borderWidth: 1,
                      borderColor: vendorCategoryFilter === cat ? Colors.primary : Colors.border,
                      backgroundColor: vendorCategoryFilter === cat ? `${Colors.primary}22` : Colors.surface,
                      paddingHorizontal: Spacing.sm,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: vendorCategoryFilter === cat ? Colors.primary : Colors.text.secondary, fontSize: Typography.fontSize.xs }}>
                      {cat}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </>
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          renderItem={({ item }) => (
            <WorkerCard
              worker={item}
              isVendorMode={mode === 'vendor'}
              onPress={() => navigation.navigate('WorkerDetail', { worker: item })}
            />
          )}
          ListEmptyComponent={
            <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
              {isAmbulanceCategory ? (
                <>
                  <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary, textAlign: 'center' }}>
                    Call 000 for an emergency
                  </Text>
                  <Pressable
                    onPress={callAmbulance}
                    style={({ pressed }) => ({
                      marginTop: Spacing.md,
                      backgroundColor: Colors.status.error,
                      borderRadius: Radius.md,
                      paddingVertical: Spacing.sm,
                      paddingHorizontal: Spacing.lg,
                      opacity: pressed ? 0.85 : 1,
                    })}
                  >
                    <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold }}>
                      Call Ambulance
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>
                    {mode === 'vendor' ? 'No nearby vendors' : 'No workers found'}
                  </Text>
                  <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.xs, textAlign: 'center' }}>
                    {mode === 'vendor'
                      ? 'Try another category or update location.'
                      : 'Try a different search.'}
                  </Text>
                  {mode === 'vendor' && !locationAvailable && (
                    <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.status.warning, marginTop: Spacing.xs, textAlign: 'center' }}>
                      Set your location to see nearby results.
                    </Text>
                  )}
                  {mode === 'vendor' && vendorsMissingCategory && (
                    <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.status.error, marginTop: Spacing.xs, textAlign: 'center' }}>
                      Nearby vendors have no matching category yet.
                    </Text>
                  )}
                  {mode === 'vendor' && vendorsMissingDocs && (
                    <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.status.error, marginTop: 4, textAlign: 'center' }}>
                      Nearby vendors are missing docs.
                    </Text>
                  )}
                </>
              )}
            </View>
          }
        />
      )}
    </View>
  );
}
