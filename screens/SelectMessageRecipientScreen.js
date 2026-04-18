/**
 * Summit Staffing – Choose who to start a conversation with (workers or participants from bookings).
 * Includes a message input at the bottom: select a recipient, type, then Send to open chat with that first message.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { api } from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';

function generateConversationId(userId1, userId2) {
  const [a, b] = [String(userId1), String(userId2)].sort();
  return `${a}_${b}`;
}

export function SelectMessageRecipientScreen({ navigation }) {
  const { user } = useAuthStore();
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);

  const loadRecipients = useCallback(async () => {
    try {
      const { data } = await api.get('/api/messages/recipients');
      if (data?.ok && Array.isArray(data.recipients)) {
        setRecipients(data.recipients);
      }
    } catch (e) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRecipients();
  }, [loadRecipients]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRecipients();
    setRefreshing(false);
  }, [loadRecipients]);

  const onSelectRecipient = (r) => {
    setSelectedRecipient(selectedRecipient?.id === r.id ? null : r);
  };

  const openChat = useCallback(
    (recipient, initialMessage = null) => {
      const conversationId = generateConversationId(user?.id, recipient.id);
      const name = recipient.first_name || recipient.email || 'User';
      navigation.navigate('Chat', {
        conversationId,
        otherUserId: recipient.id,
        otherUserName: name,
        ...(initialMessage ? { initialMessage } : {}),
      });
    },
    [user?.id, navigation]
  );

  const onSendFirstMessage = useCallback(() => {
    const text = messageInput.trim();
    if (!selectedRecipient) return;
    if (sending) return;
    if (text) {
      setMessageInput('');
      openChat(selectedRecipient, text);
      setSelectedRecipient(null);
    } else {
      openChat(selectedRecipient);
    }
  }, [selectedRecipient, messageInput, sending, openChat]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const hasRecipients = recipients.length > 0;
  const placeholder = !hasRecipients
    ? user?.role === 'participant'
      ? 'Book a worker first to see recipients and message them.'
      : 'Participants from your bookings will appear here so you can message them.'
    : !selectedRecipient
      ? 'Select a recipient above, then type a message'
      : 'Type a message...';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        data={recipients}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.sm }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        renderItem={({ item: r }) => {
          const name = r.first_name || r.email || 'User';
          const isSelected = selectedRecipient?.id === r.id;
          return (
            <Pressable
              onPress={() => onSelectRecipient(r)}
              style={({ pressed }) => ({
                backgroundColor: isSelected ? Colors.primary + '15' : Colors.surface,
                borderRadius: Radius.lg,
                padding: Spacing.lg,
                marginBottom: Spacing.sm,
                opacity: pressed ? 0.9 : 1,
                borderWidth: isSelected ? 2 : 0,
                borderColor: Colors.primary,
                ...Shadows.sm,
                flexDirection: 'row',
                alignItems: 'center',
              })}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: Colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: Spacing.md,
                }}
              >
                <Text style={{ fontSize: 20, color: Colors.text.white }}>
                  {(name || '?')[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontWeight: Typography.fontWeight.semibold,
                    color: Colors.text.primary,
                    fontSize: Typography.fontSize.base,
                  }}
                >
                  {name}
                </Text>
                {r.email && r.email !== name && (
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: Typography.fontSize.sm,
                      color: Colors.text.muted,
                      marginTop: 2,
                    }}
                  >
                    {r.email}
                  </Text>
                )}
              </View>
              <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.sm }}>
                {isSelected ? ' Selected' : 'Message →'}
              </Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
            <Text style={{ fontSize: 48, marginBottom: Spacing.md }}></Text>
            <Text
              style={{
                fontSize: Typography.fontSize.lg,
                fontWeight: Typography.fontWeight.semibold,
                color: Colors.text.primary,
                textAlign: 'center',
              }}
            >
              No one to message yet
            </Text>
            <Text
              style={{
                fontSize: Typography.fontSize.sm,
                color: Colors.text.secondary,
                marginTop: Spacing.xs,
                textAlign: 'center',
              }}
            >
              {user?.role === 'participant'
                ? 'Book a worker first. Then you can start a conversation here.'
                : 'Participants from your bookings will appear here so you can message them.'}
            </Text>
          </View>
        }
      />

      {/* Message input – always visible so user has a place to type */}
      <View
        style={{
          flexDirection: 'row',
          padding: Spacing.sm,
          backgroundColor: Colors.surface,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          alignItems: 'center',
        }}
      >
        <TextInput
          style={{
            flex: 1,
            backgroundColor: Colors.surfaceSecondary,
            borderRadius: Radius.full,
            paddingVertical: Spacing.sm,
            paddingHorizontal: Spacing.lg,
            fontSize: Typography.fontSize.base,
            color: Colors.text.primary,
            maxHeight: 100,
            opacity: hasRecipients && selectedRecipient ? 1 : 0.7,
          }}
          placeholder={placeholder}
          placeholderTextColor={Colors.text.muted}
          value={messageInput}
          onChangeText={setMessageInput}
          multiline
          editable={!!(hasRecipients && selectedRecipient)}
        />
        <Pressable
          onPress={onSendFirstMessage}
          disabled={!selectedRecipient}
          style={({ pressed }) => ({
            marginLeft: Spacing.sm,
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: selectedRecipient ? Colors.primary : Colors.text.muted,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: Colors.text.white, fontSize: 18 }}></Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
