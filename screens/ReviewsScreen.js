/**
 * Summit Staffing – Reviews Screen
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, RefreshControl,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { api } from '../services/api.js';
import { Colors, Spacing, Typography, Radius, Shadows } from '../constants/theme.js';
import { useAuthStore } from '../store/authStore.js';

function Stars({ rating }) {
  return (
    <Text style={{ fontSize: 16 }}>
      {[1, 2, 3, 4, 5].map(i => (i <= rating ? '' : '')).join('')}
    </Text>
  );
}

function ReviewCard({ review, onFlag }) {
  return (
    <View style={{ backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadows.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs }}>
        <Stars rating={review.rating} />
        <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.xs }}>
          {new Date(review.created_at).toLocaleDateString()}
        </Text>
      </View>
      <Text style={{ color: Colors.text.primary, marginBottom: Spacing.xs, lineHeight: 20 }}>{review.comment || review.review_text || '(No comment)'}</Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: Colors.text.muted, fontSize: Typography.fontSize.xs }}>
          By: {review.reviewer_first_name || review.reviewer_name || review.participant_name || 'Anonymous'}
        </Text>
        {onFlag && (
          <Pressable onPress={() => onFlag(review.id)}
            style={{ paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.sm, borderWidth: 1, borderColor: '#EF4444' }}>
            <Text style={{ color: '#EF4444', fontSize: Typography.fontSize.xs }}>Flag</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function ReviewsScreen({ route, navigation }) {
  const { user } = useAuthStore();
  const workerId = route?.params?.workerId;
  const participantId = route?.params?.participantId;

  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Write review state
  const [showWrite, setShowWrite] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    let endpoint = null;
    if (workerId) endpoint = `/api/reviews/worker/${workerId}`;
    else if (participantId) endpoint = `/api/reviews/participant/${participantId}`;
    else { setLoading(false); return; }
    const { data } = await api.get(endpoint);
    if (data?.ok && data?.reviews) setReviews(data.reviews);
    else if (data && Array.isArray(data)) setReviews(data);
    setLoading(false);
  }, [workerId, participantId]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const flag = async (reviewId) => {
    Alert.alert('Flag Review', 'Are you sure you want to flag this review?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Flag', style: 'destructive', onPress: async () => {
          const { error } = await api.post(`/api/reviews/${reviewId}/flag`, { reason: 'Inappropriate content' });
          if (error) Alert.alert('Error', error.message);
          else Alert.alert('Flagged', 'Review has been flagged for admin review.');
        },
      },
    ]);
  };

  const submitReview = async () => {
    if (!comment.trim()) { Alert.alert('Error', 'Please enter a comment'); return; }
    if (!route?.params?.bookingId) {
      Alert.alert('Info', 'To leave a review, go to a completed booking and tap "Leave Review".');
      return;
    }
    setSubmitting(true);
    const body = {
      bookingId: route.params.bookingId,
      rating,
      comment: comment.trim(),
    };
    const { error } = await api.post('/api/reviews', body);
    if (error) Alert.alert('Error', error.message);
    else {
      Alert.alert('Success', 'Review submitted!');
      setShowWrite(false);
      setComment('');
      setRating(5);
      load();
    }
    setSubmitting(false);
  };

  const avgRating = reviews.length > 0 ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : null;

  if (loading) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}><ActivityIndicator size="large" color={Colors.primary} /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Header stats */}
      <View style={{ backgroundColor: Colors.surface, padding: Spacing.lg, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ fontSize: Typography.fontSize.xl, fontWeight: Typography.fontWeight.bold, color: Colors.text.primary }}>Reviews</Text>
            <Text style={{ color: Colors.text.muted, marginTop: 2 }}>{reviews.length} review{reviews.length !== 1 ? 's' : ''}</Text>
          </View>
          {avgRating && (
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 28, fontWeight: Typography.fontWeight.bold, color: '#F59E0B' }}>{avgRating}</Text>
              <Stars rating={Math.round(Number(avgRating))} />
            </View>
          )}
        </View>
        {/* Show write button for participants viewing worker reviews from a completed booking */}
        {user?.role === 'participant' && workerId && route?.params?.bookingId && (
          <Pressable onPress={() => setShowWrite(!showWrite)}
            style={{ backgroundColor: Colors.primary, paddingVertical: Spacing.sm, borderRadius: Radius.sm, alignItems: 'center', marginTop: Spacing.md }}>
            <Text style={{ color: Colors.text.white, fontWeight: Typography.fontWeight.bold }}>
              {showWrite ? 'Cancel' : 'Write a Review'}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Write review form */}
      {showWrite && (
        <View style={{ backgroundColor: Colors.surface, margin: Spacing.md, borderRadius: Radius.md, padding: Spacing.md, ...Shadows.sm }}>
          <Text style={{ fontWeight: Typography.fontWeight.bold, color: Colors.text.primary, marginBottom: Spacing.sm }}>Your Rating</Text>
          <View style={{ flexDirection: 'row', marginBottom: Spacing.md }}>
            {[1, 2, 3, 4, 5].map(i => (
              <Pressable key={i} onPress={() => setRating(i)} style={{ marginRight: 8 }}>
                <Text style={{ fontSize: 28 }}>{i <= rating ? '' : ''}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={comment} onChangeText={setComment} placeholder="Write your review…" placeholderTextColor={Colors.text.muted}
            multiline numberOfLines={4} textAlignVertical="top"
            style={{ backgroundColor: Colors.background, borderRadius: Radius.sm, padding: Spacing.md, color: Colors.text.primary, borderWidth: 1, borderColor: Colors.border, minHeight: 100, marginBottom: Spacing.md }} />
          <Pressable onPress={submitReview} disabled={submitting}
            style={{ backgroundColor: submitting ? Colors.text.muted : '#10B981', paddingVertical: Spacing.sm, borderRadius: Radius.sm, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: Typography.fontWeight.bold }}>{submitting ? 'Submitting…' : 'Submit Review'}</Text>
          </Pressable>
        </View>
      )}

      {/* Reviews list */}
      <FlatList
        data={reviews}
        keyExtractor={r => String(r.id)}
        renderItem={({ item }) => <ReviewCard review={item} onFlag={user?.role === 'admin' ? flag : null} />}
        contentContainerStyle={{ padding: Spacing.md, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: Colors.text.muted, marginTop: 40 }}>No reviews yet</Text>}
      />
    </View>
  );
}
