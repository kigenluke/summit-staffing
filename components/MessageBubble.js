import React, {useMemo} from 'react';
import {Alert, Linking, Pressable, Text, View} from 'react-native';

import { Colors, Radius, Shadows, Spacing, Typography } from '../constants/theme.js';

const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;
const phoneRegex = /(\+?\d[\d\s\-()]{6,}\d)/g;

const formatHHMM = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-AU', {hour: 'numeric', minute: '2-digit', hour12: true}).format(d);
};

const openUrl = async (raw) => {
  const url = raw.startsWith('http') ? raw : `https://${raw}`;
  try {
    await Linking.openURL(url);
  } catch (e) {
    void e;
  }
};

const callPhone = async (raw) => {
  const digits = String(raw || '').replace(/\D+/g, '');
  if (!digits) return;
  try {
    await Linking.openURL(`tel:${digits}`);
  } catch (e) {
    void e;
  }
};

export const MessageBubble = ({message, isSender, showAvatar, showTimestamp, onLongPress}) => {
  const createdAt = message?.created_at;
  const time = useMemo(() => (createdAt ? formatHHMM(createdAt) : ''), [createdAt]);

  const bg = isSender ? Colors.primary : '#F3F4F6';
  const fg = isSender ? Colors.text.white : Colors.text.primary;

  const text = String(message?.message_text || '');

  const parts = useMemo(() => {
    const tokens = [];
    let remaining = text;

    // naive link/phone scan
    const matches = [];
    for (const m of remaining.matchAll(urlRegex)) {
      matches.push({type: 'url', value: m[0], index: m.index});
    }
    for (const m of remaining.matchAll(phoneRegex)) {
      matches.push({type: 'phone', value: m[0], index: m.index});
    }
    matches.sort((a, b) => (a.index || 0) - (b.index || 0));

    let cursor = 0;
    for (const m of matches) {
      const idx = m.index || 0;
      if (idx < cursor) continue;
      if (idx > cursor) tokens.push({type: 'text', value: remaining.slice(cursor, idx)});
      tokens.push({type: m.type, value: m.value});
      cursor = idx + String(m.value).length;
    }
    if (cursor < remaining.length) tokens.push({type: 'text', value: remaining.slice(cursor)});

    return tokens.length ? tokens : [{type: 'text', value: remaining}];
  }, [text]);

  const onPressPart = (p) => {
    if (p.type === 'url') return openUrl(p.value);
    if (p.type === 'phone') return callPhone(p.value);
    return null;
  };

  const onDefaultLongPress = () => {
    Alert.alert('Message', 'Options', [
      {text: 'Copy', onPress: () => {}},
      {text: 'Delete', style: 'destructive', onPress: () => {}},
      {text: 'Cancel', style: 'cancel'},
    ]);
  };

  return (
    <View style={{flexDirection: 'row', justifyContent: isSender ? 'flex-end' : 'flex-start', marginBottom: 10}}>
      {!isSender && showAvatar ? (
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
            marginRight: 8,
            marginTop: 4,
          }}>
          <Text style={{fontSize: 12, fontWeight: '900', color: Colors.text.primary}}>U</Text>
        </View>
      ) : null}

      <Pressable
        onLongPress={onLongPress || onDefaultLongPress}
        style={{
          maxWidth: '70%',
          backgroundColor: bg,
          borderRadius: 16,
          padding: 12,
          ...Shadows.small,
        }}>
        <Text style={{color: fg, fontWeight: '700', lineHeight: 20}}>
          {parts.map((p, idx) => {
            if (p.type === 'text') {
              return <Text key={idx}>{p.value}</Text>;
            }
            return (
              <Text
                key={idx}
                onPress={() => onPressPart(p)}
                style={{textDecorationLine: 'underline', color: isSender ? Colors.text.white : Colors.primary}}>
                {p.value}
              </Text>
            );
          })}
        </Text>

        {showTimestamp ? (
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 6, gap: 6}}>
            <Text style={{fontSize: Typography.fontSize.xs, color: isSender ? 'rgba(255,255,255,0.75)' : Colors.text.secondary}}>
              {time}
            </Text>
            {isSender ? (
              <Icon
                name={message?.read_status ? 'done-all' : 'done'}
                size={14}
                color={message?.read_status ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.75)'}
              />
            ) : null}
          </View>
        ) : null}

        {message?.__failed ? (
          <Text style={{color: isSender ? 'rgba(255,255,255,0.9)' : Colors.error, marginTop: 6, fontWeight: '900'}}>Failed. Tap to retry.</Text>
        ) : null}
      </Pressable>
    </View>
  );
};
