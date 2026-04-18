/**
 * Summit Staffing – Messages Screen (Conversations list + Chat)
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, Pressable, TextInput, RefreshControl, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { api } from '../services/api.js';
import { useAuthStore } from '../store/authStore.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';

/* ───────── Conversations List ───────── */
export function MessagesScreen({ navigation }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadConversations = useCallback(async () => {
    try {
      const { data } = await api.get('/api/messages/conversations');
      if (data?.ok && data?.conversations) {
        setConversations(data.conversations);
      }
    } catch (e) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    loadConversations();
    const unsubscribe = navigation.addListener('focus', () => loadConversations());
    return unsubscribe;
  }, [navigation, loadConversations]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadConversations();
    setRefreshing(false);
  }, [loadConversations]);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.conversation_id || item.id || String(Math.random())}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xxl }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          renderItem={({ item: conv }) => {
            const otherName = conv.other_user?.first_name || conv.other_user_name || conv.other_user_email || 'User';
            const lastMsg = typeof conv.last_message === 'string' ? conv.last_message : conv.last_message?.message_text || 'Start a conversation';
            const unread = conv.unread_count || 0;
            return (
            <Pressable
              onPress={() => navigation.navigate('Chat', {
                conversationId: conv.conversation_id,
                otherUserId: conv.other_user_id,
                otherUserName: otherName,
              })}
              style={({ pressed }) => ({
                backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg,
                marginBottom: Spacing.sm, opacity: pressed ? 0.9 : 1, ...Shadows.sm,
                flexDirection: 'row', alignItems: 'center',
              })}
            >
              <View style={{
                width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primary,
                alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md,
              }}>
                <Text style={{ fontSize: 20, color: Colors.text.white }}>
                  {(otherName || '?')[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary, fontSize: Typography.fontSize.base }}>
                  {otherName}
                </Text>
                <Text numberOfLines={1} style={{ fontSize: Typography.fontSize.sm, color: Colors.text.muted, marginTop: 2 }}>
                  {lastMsg}
                </Text>
              </View>
              {unread > 0 && (
                <View style={{
                  backgroundColor: Colors.status.error, width: 22, height: 22, borderRadius: 11,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: Colors.text.white, fontSize: Typography.fontSize.xs, fontWeight: Typography.fontWeight.bold }}>
                    {unread}
                  </Text>
                </View>
              )}
            </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
              <Text style={{ fontSize: 48, marginBottom: Spacing.md }}></Text>
              <Text style={{ fontSize: Typography.fontSize.lg, fontWeight: Typography.fontWeight.semibold, color: Colors.text.primary }}>
                No conversations yet
              </Text>
              <Text style={{ fontSize: Typography.fontSize.sm, color: Colors.text.secondary, marginTop: Spacing.xs, textAlign: 'center' }}>
                Messages with workers and participants will appear here.
              </Text>
              <Pressable
                onPress={() => navigation.navigate('SelectMessageRecipient')}
                style={({ pressed }) => ({
                  marginTop: Spacing.lg,
                  backgroundColor: Colors.primary,
                  paddingVertical: Spacing.md,
                  paddingHorizontal: Spacing.xl,
                  borderRadius: Radius.lg,
                  opacity: pressed ? 0.9 : 1,
                })}
              >
                <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.semibold, fontSize: Typography.fontSize.base }}>
                  Start a conversation
                </Text>
              </Pressable>
            </View>
          }
        />
      )}
    </View>
  );
}

/* ───────── Chat Screen ───────── */
export function ChatScreen({ route, navigation }) {
  const { conversationId, otherUserId, otherUserName, initialMessage } = route.params || {};
  const { user } = useAuthStore();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef(null);
  const initialMessageSentRef = useRef(false);

  const loadMessages = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/messages/${conversationId}?limit=50`);
      if (data?.ok && data?.messages) {
        setMessages(data.messages.reverse());
      }
    } catch (e) {}
    setLoading(false);
  }, [conversationId]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // When opened from "Start a conversation" with a first message, send it once
  useEffect(() => {
    if (!initialMessage || !otherUserId || initialMessageSentRef.current) return;
    initialMessageSentRef.current = true;
    (async () => {
      const { error } = await api.post('/api/messages/send', {
        receiverId: otherUserId,
        messageText: initialMessage,
      });
      if (!error) await loadMessages();
      navigation.setParams({ initialMessage: undefined });
    })();
  }, [initialMessage, otherUserId, loadMessages, navigation]);

  // Poll for new messages every 5 seconds
  useEffect(() => {
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setInput('');
    try {
      const { data, error } = await api.post('/api/messages/send', {
        receiverId: otherUserId,
        messageText: text,
      });
      if (!error) {
        await loadMessages();
      }
    } catch (e) {}
    setSending(false);
  };

  const isMe = (msg) => msg.sender_id === user?.id;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id || String(Math.random())}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.md }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          renderItem={({ item: msg }) => (
            <View style={{
              alignSelf: isMe(msg) ? 'flex-end' : 'flex-start',
              maxWidth: '80%', marginBottom: Spacing.sm,
            }}>
              <View style={{
                backgroundColor: isMe(msg) ? Colors.primary : Colors.surface,
                borderRadius: Radius.lg, padding: Spacing.md,
                borderBottomRightRadius: isMe(msg) ? 4 : Radius.lg,
                borderBottomLeftRadius: isMe(msg) ? Radius.lg : 4,
                ...(!isMe(msg) ? Shadows.sm : {}),
              }}>
                <Text style={{ color: isMe(msg) ? Colors.text.white : Colors.text.primary, fontSize: Typography.fontSize.base }}>
                  {msg.message_text}
                </Text>
              </View>
              <Text style={{
                fontSize: Typography.fontSize.xs, color: Colors.text.muted, marginTop: 2,
                textAlign: isMe(msg) ? 'right' : 'left',
              }}>
                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
              <Text style={{ color: Colors.text.muted }}>No messages yet. Say hello! </Text>
            </View>
          }
        />
      )}

      {/* Input Bar */}
      <View style={{
        flexDirection: 'row', padding: Spacing.sm, backgroundColor: Colors.surface,
        borderTopWidth: 1, borderTopColor: Colors.border, alignItems: 'center',
      }}>
        <TextInput
          style={{
            flex: 1, backgroundColor: Colors.surfaceSecondary, borderRadius: Radius.full,
            paddingVertical: Spacing.sm, paddingHorizontal: Spacing.lg,
            fontSize: Typography.fontSize.base, color: Colors.text.primary, maxHeight: 100,
          }}
          placeholder="Type a message..."
          placeholderTextColor={Colors.text.muted}
          value={input}
          onChangeText={setInput}
          multiline
        />
        <Pressable
          onPress={sendMessage}
          disabled={sending || !input.trim()}
          style={({ pressed }) => ({
            marginLeft: Spacing.sm, width: 44, height: 44, borderRadius: 22,
            backgroundColor: input.trim() ? Colors.primary : Colors.text.muted,
            alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ color: Colors.text.white, fontSize: 18 }}></Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
