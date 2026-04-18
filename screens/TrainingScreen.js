/**
 * Summit Staffing – Training Screen
 * Training modules with expandable details and external resource links.
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking } from 'react-native';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';

const TRAINING_MODULES = [
  {
    title: 'NDIS Worker Orientation',
    badge: 'Required',
    badgeColor: Colors.status.error,
    description: 'The NDIS Worker Orientation Module is mandatory for all workers providing supports under the NDIS. It covers the NDIS Code of Conduct, human rights, and your responsibilities.',
    link: 'https://www.ndiscommission.gov.au',
    linkLabel: 'Open Resource',
  },
  {
    title: 'Disability Awareness',
    badge: 'Recommended',
    badgeColor: Colors.primary,
    description: 'Learn about different types of disabilities, person-centred approaches, and how to provide respectful and effective support tailored to individual needs.',
  },
  {
    title: 'First Aid & CPR',
    badge: 'Certificate',
    badgeColor: Colors.status.warning,
    description: 'A nationally recognised first aid certificate (HLTAID011) is essential for providing safe support. Covers CPR, wound management, and emergency response.',
    link: 'https://www.stjohn.org.au',
    linkLabel: 'Open Resource',
  },
  {
    title: 'Manual Handling & Safety',
    badge: 'Recommended',
    badgeColor: Colors.primary,
    description: 'Covers safe lifting techniques, use of mobility aids, workplace health and safety principles, and injury prevention for both workers and participants.',
  },
  {
    title: 'Medication Management',
    badge: 'Important',
    badgeColor: '#8B5CF6',
    description: 'Training on assisting participants with medication, understanding medication schedules, storage requirements, and reporting procedures.',
  },
  {
    title: 'Incident Reporting',
    badge: 'Required',
    badgeColor: Colors.status.error,
    description: 'Understanding your obligations for reporting incidents, including NDIS reportable incidents, near-misses, and how to document and escalate concerns.',
  },
];

const TrainingCard = ({ module }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.sm, ...Shadows.sm }}>
      <Pressable onPress={() => setExpanded(!expanded)} style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, fontSize: Typography.fontSize.base }}>
            {module.title}
          </Text>
          <View style={{ marginTop: 4 }}>
            <View style={{ backgroundColor: module.badgeColor, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.full, alignSelf: 'flex-start' }}>
              <Text style={{ color: Colors.text.white, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold }}>{module.badge}</Text>
            </View>
          </View>
        </View>
        <Text style={{ fontSize: 16, color: Colors.text.muted }}>{expanded ? '▲' : '▼'}</Text>
      </Pressable>

      {expanded && (
        <View style={{ marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border }}>
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, lineHeight: 20 }}>
            {module.description}
          </Text>
          {module.link && (
            <Pressable
              onPress={() => Linking.openURL(module.link)}
              style={({ pressed }) => ({
                marginTop: Spacing.md, backgroundColor: Colors.primary, paddingVertical: Spacing.sm,
                paddingHorizontal: Spacing.md, borderRadius: Radius.md, alignSelf: 'flex-start',
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.sm }}>
                {module.linkLabel}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
};

export function TrainingScreen({ navigation }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ paddingBottom: Spacing.xxl }}
    >
      {/* Hero Banner */}
      <View style={{ backgroundColor: Colors.primary, paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing.xl }}>
        <Text style={{ fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.text.white }}>
          My Training
        </Text>
        <Text style={{ fontSize: Typography.fontSize.sm, color: 'rgba(255,255,255,0.85)', marginTop: Spacing.xs }}>
          Complete required training and enhance your skills to provide the best support.
        </Text>
      </View>

      <View style={{ padding: Spacing.lg }}>
        {/* Info Card */}
        <View style={{ backgroundColor: '#EFF6FF', borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, borderWidth: 1, borderColor: '#BFDBFE' }}>
          <Text style={{ fontSize: Typography.fontSize.sm, color: '#1E40AF', lineHeight: 20 }}>
            <Text style={{ fontWeight: Typography.fontWeight.bold }}>Training Guide: </Text>
            Modules marked as "Required" must be completed before you can accept bookings. "Recommended" modules help improve your profile and attract more participants.
          </Text>
        </View>

        {/* Training Modules */}
        {TRAINING_MODULES.map((module, i) => (
          <TrainingCard key={i} module={module} />
        ))}

        {/* Support CTA */}
        <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginTop: Spacing.sm, alignItems: 'center', ...Shadows.sm }}>
          <Text style={{ fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary, textAlign: 'center' }}>
            Need help with training?
          </Text>
          <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, textAlign: 'center', marginTop: Spacing.xs }}>
            Contact our support team for guidance on meeting your training requirements.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
