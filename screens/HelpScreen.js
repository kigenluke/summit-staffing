/**
 * Summit Staffing – Help & Support Screen
 * Contact info, in-app contact form, FAQ accordion, emergency contacts.
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, Linking, Platform, Share } from 'react-native';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';

const FAQ_ITEMS = [
  {
    question: 'How do I book an NDIS support worker?',
    answer: 'Navigate to the Search tab to browse available workers. Select a worker to view their profile and tap "Book Now" to create a booking with your preferred date, time, and service type.',
  },
  {
    question: 'How are workers verified?',
    answer: 'All workers must upload their NDIS Worker Screening Check, Working With Children Check, and Police Check. Our team reviews and verifies these documents before workers can accept bookings.',
  },
  {
    question: 'What is the cancellation policy?',
    answer: 'Bookings can be cancelled free of charge up to 24 hours before the scheduled start time. Cancellations within 24 hours may incur a cancellation fee of up to 50% of the booking total.',
  },
  {
    question: 'How do payments work?',
    answer: 'Payments are processed securely through Stripe. Participants are charged after a booking is completed and approved. Workers receive payouts to their linked bank account within 2-3 business days.',
  },
  {
    question: 'What are the support hours?',
    answer: 'Our support team is available Monday to Friday, 8:00 AM – 6:00 PM AEST. For urgent matters outside these hours, please email support@summitstaffing.com.au and we will respond as soon as possible.',
  },
];

const FAQItem = ({ item }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <Pressable
      onPress={() => setExpanded(!expanded)}
      style={{ borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: Spacing.md }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, fontSize: Typography.fontSize.base, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>
          {item.question}
        </Text>
        <Text style={{ fontSize: 16, color: Colors.text.muted }}>{expanded ? '▲' : '▼'}</Text>
      </View>
      {expanded && (
        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.sm, lineHeight: 20 }}>
          {item.answer}
        </Text>
      )}
    </Pressable>
  );
};

export function HelpScreen({ navigation }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const openEmail = () => {
    Linking.openURL('mailto:support@summitstaffing.com.au');
  };

  const openPhone = () => {
    Linking.openURL('tel:1800000000');
  };

  const shareSupportContact = async () => {
    try {
      await Share.share({
        message: 'Summit Staffing Support\nEmail: support@summitstaffing.com.au\nPhone: 1800 000 000',
      });
    } catch (_) {}
  };

  const sendContactForm = async () => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert('Missing Fields', 'Please enter both a subject and message.');
      return;
    }
    setSending(true);
    try {
      const { error } = await api.post('/api/support/contact', { subject, message });
      if (error) {
        // Fallback to mailto
        const mailUrl = `mailto:support@summitstaffing.com.au?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
        Linking.openURL(mailUrl);
      } else {
        Alert.alert('Sent!', 'Your message has been sent. We will get back to you soon.');
        setSubject('');
        setMessage('');
      }
    } catch (e) {
      const mailUrl = `mailto:support@summitstaffing.com.au?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      Linking.openURL(mailUrl);
    }
    setSending(false);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: Colors.background }}
      contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xxl }}
    >
      {/* Contact Section */}
      <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadows.sm }}>
        <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.md }}>
          Contact Us
        </Text>

        <Pressable onPress={openEmail} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, opacity: pressed ? 0.6 : 1 })}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>Email</Text>
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.primary }}>support@summitstaffing.com.au</Text>
          </View>
        </Pressable>

        <Pressable onPress={openPhone} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, opacity: pressed ? 0.6 : 1 })}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>Phone</Text>
            <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.primary }}>1800 000 000</Text>
          </View>
        </Pressable>

        <Pressable
          onPress={shareSupportContact}
          style={({ pressed }) => ({
            marginTop: Spacing.sm,
            backgroundColor: Colors.surfaceSecondary,
            borderRadius: Radius.md,
            borderWidth: 1,
            borderColor: Colors.border,
            paddingVertical: Spacing.sm,
            alignItems: 'center',
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Text style={{ color: Colors.text.primary, fontWeight: Typography.fontWeight.semibold }}>
            Share Email & Contact
          </Text>
        </Pressable>
      </View>

      {/* Contact Form */}
      <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadows.sm }}>
        <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.md }}>
          Send us a message
        </Text>

        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: 4 }}>Subject</Text>
        <TextInput
          style={{ backgroundColor: Colors.surfaceSecondary, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, fontSize: Typography.fontSize.base, color: Colors.text.primary, marginBottom: Spacing.md }}
          value={subject} onChangeText={setSubject} placeholder="What do you need help with?"
          placeholderTextColor={Colors.text.muted}
        />

        <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginBottom: 4 }}>Message</Text>
        <TextInput
          style={{ backgroundColor: Colors.surfaceSecondary, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, fontSize: Typography.fontSize.base, color: Colors.text.primary, marginBottom: Spacing.md, height: 100, textAlignVertical: 'top' }}
          value={message} onChangeText={setMessage} placeholder="Describe your issue or question..."
          placeholderTextColor={Colors.text.muted} multiline
        />

        <Pressable
          onPress={sendContactForm} disabled={sending}
          style={({ pressed }) => ({ backgroundColor: sending ? Colors.text.muted : Colors.primary, paddingVertical: Spacing.md, borderRadius: Radius.md, alignItems: 'center', opacity: pressed ? 0.8 : 1 })}
        >
          <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>{sending ? 'Sending...' : 'Send Message'}</Text>
        </Pressable>
      </View>

      {/* FAQ */}
      <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, ...Shadows.sm }}>
        <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm }}>
          Frequently Asked Questions
        </Text>
        {FAQ_ITEMS.map((item, i) => (
          <FAQItem key={i} item={item} />
        ))}
      </View>

      {/* Emergency */}
      <View style={{ backgroundColor: '#FEF2F2', borderRadius: Radius.lg, padding: Spacing.lg, marginBottom: Spacing.md, borderWidth: 1, borderColor: '#FECACA' }}>
        <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.bold, color: '#DC2626', marginBottom: Spacing.sm }}>
          Emergency Contacts
        </Text>
        <Pressable onPress={() => Linking.openURL('tel:000')} style={{ marginBottom: Spacing.sm }}>
          <Text style={{ fontSize: Typography.fontSize.base, color: Colors.text.primary }}>
            <Text style={{ fontWeight: Typography.fontWeight.bold }}>Emergency Services: </Text>
            <Text style={{ color: '#DC2626' }}>000</Text>
          </Text>
        </Pressable>
        <Pressable onPress={() => Linking.openURL('tel:131114')}>
          <Text style={{ fontSize: Typography.fontSize.base, color: Colors.text.primary }}>
            <Text style={{ fontWeight: Typography.fontWeight.bold }}>Lifeline: </Text>
            <Text style={{ color: '#DC2626' }}>13 11 14</Text>
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
