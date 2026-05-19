/**
 * Worker skills & services picker — search, grouped categories, selected chips.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';
import { SERVICE_TYPES } from '../constants/serviceTypes.js';
import { VENDOR_CATEGORIES } from '../constants/vendorCategories.js';

const VENDOR_GROUPS = [
  {
    id: 'transport',
    title: 'Transport',
    icon: '🚗',
    items: ['Taxi Driver', 'Ambulance Services', 'Patient Transport'],
  },
  {
    id: 'home',
    title: 'Home & daily living',
    icon: '🏠',
    items: ['Meal Delivery', 'Cleaning Services', 'Laundry Services', 'Home Maintenance'],
  },
  {
    id: 'equipment',
    title: 'Equipment & supplies',
    icon: '🦽',
    items: ['Mobility Equipment Rental', 'Medical Supplies', 'Assistive Technology Support'],
  },
  {
    id: 'therapy',
    title: 'Therapy & clinical',
    icon: '🩺',
    items: [
      'Physiotherapy Services',
      'Occupational Therapy Services',
      'Speech Therapy Services',
    ],
  },
  {
    id: 'community',
    title: 'Community & respite',
    icon: '🤝',
    items: ['Community Access Support', 'Respite Services'],
  },
];

const NDIS_GROUP = {
  id: 'ndis',
  title: 'NDIS support areas',
  icon: '✨',
  items: SERVICE_TYPES,
};

function matchesSearch(name, query) {
  if (!query) return true;
  return name.toLowerCase().includes(query.toLowerCase());
}

function ServiceChip({ label, selected, onPress, compact = false }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: Radius.full,
        paddingHorizontal: compact ? Spacing.sm : Spacing.md,
        paddingVertical: compact ? 6 : Spacing.sm,
        borderWidth: 1.5,
        borderColor: selected ? Colors.primary : Colors.border,
        backgroundColor: selected ? `${Colors.primary}18` : Colors.surface,
        opacity: pressed ? 0.88 : 1,
        ...Shadows.sm,
      })}
    >
      {selected ? (
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: Colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: Colors.text.white, fontSize: 11, fontWeight: '700' }}>✓</Text>
        </View>
      ) : (
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            borderWidth: 1.5,
            borderColor: Colors.border,
            backgroundColor: Colors.surfaceSecondary,
          }}
        />
      )}
      <Text
        style={{
          color: selected ? Colors.primaryDark : Colors.text.primary,
          fontWeight: selected ? Typography.fontWeight.semibold : Typography.fontWeight.medium,
          fontSize: compact ? Typography.fontSize.xs : Typography.fontSize.sm,
          flexShrink: 1,
        }}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function GroupSection({ group, selectedSet, search, onToggle, defaultOpen = true }) {
  const filtered = group.items.filter((name) => matchesSearch(name, search));
  const [open, setOpen] = useState(defaultOpen);
  const selectedInGroup = filtered.filter((n) => selectedSet.has(n.toLowerCase())).length;

  if (filtered.length === 0) return null;

  return (
    <View
      style={{
        marginBottom: Spacing.md,
        backgroundColor: Colors.surface,
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: Colors.border,
        overflow: 'hidden',
        ...Shadows.sm,
      }}
    >
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          padding: Spacing.md,
          backgroundColor: Colors.surfaceSecondary,
          opacity: pressed ? 0.92 : 1,
        })}
      >
        <Text style={{ fontSize: 22, marginRight: Spacing.sm }}>{group.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, fontSize: Typography.fontSize.base }}>
            {group.title}
          </Text>
          <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginTop: 2 }}>
            {selectedInGroup > 0 ? `${selectedInGroup} selected · ` : ''}
            {filtered.length} option{filtered.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold }}>
          {open ? '−' : '+'}
        </Text>
      </Pressable>
      {open ? (
        <View style={{ padding: Spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
          {filtered.map((name) => (
            <ServiceChip
              key={name}
              label={name}
              selected={selectedSet.has(name.toLowerCase())}
              onPress={() => onToggle(name)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function WorkerSkillsPanel({
  skills = [],
  onToggleSkill,
  onRemoveSkill,
  onAddCustomSkill,
  addingSkill = false,
}) {
  const [search, setSearch] = useState('');
  const [customSkill, setCustomSkill] = useState('');

  const selectedSet = useMemo(
    () => new Set((skills || []).map((s) => (s.skill_name || '').toLowerCase())),
    [skills],
  );

  const selectedSkills = skills || [];
  const query = search.trim();

  const handleAddCustom = async () => {
    const name = customSkill.trim();
    if (!name) return;
    await onAddCustomSkill(name);
    setCustomSkill('');
  };

  return (
    <View>
      <View
        style={{
          backgroundColor: Colors.primary,
          borderRadius: Radius.lg,
          padding: Spacing.lg,
          marginBottom: Spacing.md,
          ...Shadows.md,
        }}
      >
        <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.white }}>
          {selectedSkills.length} service{selectedSkills.length !== 1 ? 's' : ''} on your profile
        </Text>
        <Text style={{ fontSize: Typography.fontSize.sm, color: 'rgba(255,255,255,0.88)', marginTop: 4 }}>
          Tap a service to add or remove it. Participants use these to find you.
        </Text>
      </View>

      {selectedSkills.length > 0 ? (
        <View style={{ marginBottom: Spacing.md }}>
          <Text style={{ fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary, marginBottom: Spacing.sm }}>
            Your services
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs }}>
            {selectedSkills.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => onRemoveSkill(s.id)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: Colors.primary,
                  borderRadius: Radius.full,
                  paddingVertical: 6,
                  paddingLeft: Spacing.md,
                  paddingRight: Spacing.sm,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.sm }}>
                  {s.skill_name}
                </Text>
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: 'rgba(255,255,255,0.25)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: Colors.text.white, fontSize: 12, fontWeight: '700' }}>×</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <View
          style={{
            marginBottom: Spacing.md,
            padding: Spacing.lg,
            borderRadius: Radius.lg,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: Colors.border,
            alignItems: 'center',
            backgroundColor: Colors.surfaceSecondary,
          }}
        >
          <Text style={{ fontSize: 28, marginBottom: Spacing.xs }}>🛠</Text>
          <Text style={{ color: Colors.text.secondary, textAlign: 'center', fontSize: Typography.fontSize.sm }}>
            No services yet — pick from the categories below
          </Text>
        </View>
      )}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: Colors.surface,
          borderRadius: Radius.md,
          borderWidth: 1,
          borderColor: Colors.border,
          paddingHorizontal: Spacing.md,
          marginBottom: Spacing.md,
          ...Shadows.sm,
        }}
      >
        <Text style={{ marginRight: Spacing.sm, fontSize: 16 }}>🔍</Text>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search services…"
          placeholderTextColor={Colors.text.muted}
          style={{
            flex: 1,
            paddingVertical: Spacing.sm,
            color: Colors.text.primary,
            fontSize: Typography.fontSize.base,
          }}
        />
        {query ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Text style={{ color: Colors.text.muted, fontWeight: Typography.fontWeight.semibold }}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      {VENDOR_GROUPS.map((group, idx) => (
        <GroupSection
          key={group.id}
          group={group}
          selectedSet={selectedSet}
          search={query}
          onToggle={onToggleSkill}
          defaultOpen={idx < 2 || Boolean(query)}
        />
      ))}

      <GroupSection
        group={NDIS_GROUP}
        selectedSet={selectedSet}
        search={query}
        onToggle={onToggleSkill}
        defaultOpen={Boolean(query)}
      />

      <View
        style={{
          marginTop: Spacing.sm,
          padding: Spacing.md,
          borderRadius: Radius.lg,
          backgroundColor: Colors.surface,
          borderWidth: 1,
          borderColor: Colors.border,
        }}
      >
        <Text style={{ fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary, marginBottom: Spacing.xs }}>
          Custom service
        </Text>
        <Text style={{ fontSize: Typography.fontSize.xs, color: Colors.text.secondary, marginBottom: Spacing.sm }}>
          Not listed above? Add your own service name.
        </Text>
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <TextInput
            style={{
              flex: 1,
              backgroundColor: Colors.surfaceSecondary,
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: Colors.border,
              paddingVertical: Spacing.sm,
              paddingHorizontal: Spacing.md,
              color: Colors.text.primary,
              fontSize: Typography.fontSize.sm,
            }}
            placeholder="e.g. Garden maintenance"
            placeholderTextColor={Colors.text.muted}
            value={customSkill}
            onChangeText={setCustomSkill}
            editable={!addingSkill}
          />
          <Pressable
            onPress={handleAddCustom}
            disabled={addingSkill || !customSkill.trim()}
            style={({ pressed }) => ({
              backgroundColor: addingSkill || !customSkill.trim() ? Colors.text.muted : Colors.primaryDark,
              paddingHorizontal: Spacing.lg,
              borderRadius: Radius.md,
              justifyContent: 'center',
              alignItems: 'center',
              minWidth: 72,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            {addingSkill ? (
              <ActivityIndicator color={Colors.text.white} size="small" />
            ) : (
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>Add</Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** All preset names (for validation / dedup) */
export const ALL_PRESET_SKILLS = [...new Set([...VENDOR_CATEGORIES, ...SERVICE_TYPES])];
