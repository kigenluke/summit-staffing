/**
 * Summit Staffing – Search/Browse Workers Screen
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, RefreshControl, ActivityIndicator, FlatList } from 'react-native';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';
import { getServiceTypeSuggestions } from '../constants/serviceTypes.js';

const WorkerCard = ({ worker, onPress }) => (
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
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.primary }}>
          ${worker.hourly_rate || '—'}
        </Text>
        <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.muted }}>/hour</Text>
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
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadWorkers = useCallback(async () => {
    try {
      const { data } = await api.get('/api/workers?limit=50');
      if (data?.ok && data?.workers) {
        setWorkers(data.workers);
      }
    } catch (e) {}
    setLoading(false);
  }, []);

  useEffect(() => { loadWorkers(); }, [loadWorkers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadWorkers();
    setRefreshing(false);
  }, [loadWorkers]);

  const filtered = workers.filter(w => {
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

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
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
              onPress={() => navigation.navigate('WorkerDetail', { worker: item })}
            />
          )}
          ListEmptyComponent={
            <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
              <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>
                No workers found
              </Text>
              <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.xs, textAlign: 'center' }}>
                Workers will appear here once they register and set up their profiles.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
