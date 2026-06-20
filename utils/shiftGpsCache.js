/**
 * Persist last known GPS per booking so clock-out works when a fresh fix times out indoors.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

function cacheKey(bookingId) {
  return `@summit_shift_gps/${bookingId}`;
}

export async function saveShiftGps(bookingId, { lat, lng }) {
  if (!bookingId || lat == null || lng == null) return;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  try {
    await AsyncStorage.setItem(
      cacheKey(bookingId),
      JSON.stringify({ lat, lng, at: Date.now() }),
    );
  } catch (_) {}
}

export async function readShiftGps(bookingId, maxAgeMs = 8 * 60 * 60 * 1000) {
  if (!bookingId) return null;
  try {
    const raw = await AsyncStorage.getItem(cacheKey(bookingId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.lat == null || parsed.lng == null) return null;
    if (parsed.at && Date.now() - parsed.at > maxAgeMs) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

export async function clearShiftGps(bookingId) {
  if (!bookingId) return;
  try {
    await AsyncStorage.removeItem(cacheKey(bookingId));
  } catch (_) {}
}
