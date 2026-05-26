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

function skillBusyForLabel(skillBusyKey, label) {
  if (!skillBusyKey || !label) return false;
  const key = label.toLowerCase();
  return skillBusyKey === `add:${key}` || skillBusyKey === `remove:${key}`;
}

function CollapseChevron({ open }) {
  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderLeftWidth: 2,
          borderBottomWidth: 2,
          borderColor: Colors.text.muted,
          transform: [{ rotate: open ? '135deg' : '-45deg' }],
          marginTop: open ? 2 : -2,
        }}
      />
    </View>
  );
}

function ServiceChip({ label, selected, onPress, busy = false, disabled = false }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderRadius: Radius.full,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderWidth: 1.5,
        borderColor: busy ? Colors.primary : selected ? Colors.primary : Colors.border,
        backgroundColor: busy ? `${Colors.primary}10` : selected ? `${Colors.primary}18` : Colors.surface,
        opacity: disabled && !busy ? 0.55 : pressed ? 0.88 : 1,
        minHeight: 40,
        ...Shadows.sm,
      })}
    >
      {busy ? (
        <ActivityIndicator size="small" color={Colors.primary} />
      ) : selected ? (
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
          fontSize: Typography.fontSize.sm,
          flexShrink: 1,
        }}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function GroupSection({ group, selectedSet, search, onToggle, skillBusyKey, skillsLocked, defaultOpen = true }) {
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
        <CollapseChevron open={open} />
      </Pressable>
      {open ? (
        <View style={{ padding: Spacing.md, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
          {filtered.map((name) => (
            <ServiceChip
              key={name}
              label={name}
              selected={selectedSet.has(name.toLowerCase())}
              busy={skillBusyForLabel(skillBusyKey, name)}
              disabled={skillsLocked}
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
  skillBusyKey = null,
}) {
  const [search, setSearch] = useState('');
  const [customSkill, setCustomSkill] = useState('');

  const selectedSet = useMemo(
    () => new Set((skills || []).map((s) => (s.skill_name || '').toLowerCase())),
    [skills],
  );

  const selectedSkills = skills || [];
  const query = search.trim();
  const skillsLocked = Boolean(skillBusyKey || addingSkill);

  const handleAddCustom = async () => {
    const name = customSkill.trim();
    if (!name || skillsLocked) return;
    await onAddCustomSkill(name);
    setCustomSkill('');
  };

  return (
    <View>
      {skillsLocked ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            backgroundColor: `${Colors.primary}14`,
            borderRadius: Radius.md,
            paddingVertical: Spacing.sm,
            paddingHorizontal: Spacing.md,
            marginBottom: Spacing.md,
            borderWidth: 1,
            borderColor: `${Colors.primary}35`,
          }}
        >
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={{ color: Colors.primaryDark, fontSize: Typography.fontSize.sm, fontWeight: Typography.fontWeight.semibold, flex: 1 }}>
            {addingSkill ? 'Adding custom service…' : 'Updating your services…'}
          </Text>
        </View>
      ) : null}

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
            {selectedSkills.map((s) => {
              const chipBusy = skillBusyForLabel(skillBusyKey, s.skill_name)
                || skillBusyKey === `remove:${s.id}`;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => onRemoveSkill(s.id, s.skill_name)}
                  disabled={skillsLocked}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: chipBusy ? Colors.primaryDark : Colors.primary,
                    borderRadius: Radius.full,
                    paddingVertical: 6,
                    paddingLeft: Spacing.md,
                    paddingRight: Spacing.sm,
                    opacity: skillsLocked && !chipBusy ? 0.55 : pressed ? 0.9 : 1,
                    minHeight: 36,
                  })}
                >
                  {chipBusy ? (
                    <ActivityIndicator size="small" color={Colors.text.white} />
                  ) : (
                    <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.sm }}>
                      {s.skill_name}
                    </Text>
                  )}
                  {!chipBusy ? (
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
                      <Text style={{ color: Colors.text.white, fontSize: 14, fontWeight: '700', lineHeight: 16 }}>×</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
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
          editable={!skillsLocked}
          style={{
            flex: 1,
            paddingVertical: Spacing.sm,
            color: Colors.text.primary,
            fontSize: Typography.fontSize.base,
          }}
        />
        {query ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8} disabled={skillsLocked}>
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
          skillBusyKey={skillBusyKey}
          skillsLocked={skillsLocked}
          defaultOpen={idx < 2 || Boolean(query)}
        />
      ))}

      <GroupSection
        group={NDIS_GROUP}
        selectedSet={selectedSet}
        search={query}
        onToggle={onToggleSkill}
        skillBusyKey={skillBusyKey}
        skillsLocked={skillsLocked}
        defaultOpen={Boolean(query)}
      />

      <View
        style={{
          marginTop: Spacing.sm,
          borderRadius: Radius.lg,
          backgroundColor: Colors.surface,
          borderWidth: 1,
          borderColor: Colors.border,
          overflow: 'hidden',
          ...Shadows.sm,
        }}
      >
        <View
          style={{
            backgroundColor: `${Colors.primaryDark}12`,
            paddingHorizontal: Spacing.md,
            paddingVertical: Spacing.md,
            borderBottomWidth: 1,
            borderBottomColor: Colors.borderLight,
          }}
        >
          <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, fontSize: Typography.fontSize.base }}>
            Add a custom service
          </Text>
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: 4, lineHeight: 20 }}>
            Not in the list above? Type your own service name (e.g. garden maintenance, pet care).
          </Text>
        </View>

        <View style={{ padding: Spacing.md }}>
          <TextInput
            style={{
              width: '100%',
              backgroundColor: Colors.surfaceSecondary,
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: Colors.border,
              paddingVertical: Spacing.md,
              paddingHorizontal: Spacing.md,
              color: Colors.text.primary,
              fontSize: Typography.fontSize.base,
              marginBottom: Spacing.md,
            }}
            placeholder="e.g. Garden maintenance"
            placeholderTextColor={Colors.text.muted}
            value={customSkill}
            onChangeText={setCustomSkill}
            editable={!skillsLocked}
            onSubmitEditing={handleAddCustom}
            returnKeyType="done"
          />
          <Pressable
            onPress={handleAddCustom}
            disabled={skillsLocked || !customSkill.trim()}
            style={({ pressed }) => ({
              backgroundColor: skillsLocked || !customSkill.trim() ? Colors.text.muted : Colors.primary,
              paddingVertical: Spacing.md,
              borderRadius: Radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: Spacing.sm,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            {addingSkill ? (
              <ActivityIndicator color={Colors.text.white} size="small" />
            ) : null}
            <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold, fontSize: Typography.fontSize.base }}>
              {addingSkill ? 'Adding…' : 'Add custom service'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** All preset names (for validation / dedup) */
export const ALL_PRESET_SKILLS = [...new Set([...VENDOR_CATEGORIES, ...SERVICE_TYPES])];
