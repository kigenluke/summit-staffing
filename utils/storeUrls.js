/** Public app store links for referral / download landing pages. */

const DEFAULT_PLAY_STORE =
  'https://play.google.com/store/apps/details?id=com.summitstaffing.app';
const DEFAULT_APP_STORE =
  'https://apps.apple.com/search?term=summit%20staffing';

export function getPlayStoreUrl() {
  if (typeof process !== 'undefined' && process.env) {
    const fromEnv =
      process.env.PLAY_STORE_URL ||
      process.env.EXPO_PUBLIC_PLAY_STORE_URL ||
      process.env.VITE_PLAY_STORE_URL;
    if (fromEnv) return String(fromEnv).trim();
  }
  return DEFAULT_PLAY_STORE;
}

export function getAppStoreUrl() {
  if (typeof process !== 'undefined' && process.env) {
    const fromEnv =
      process.env.APP_STORE_URL ||
      process.env.EXPO_PUBLIC_APP_STORE_URL ||
      process.env.VITE_APP_STORE_URL;
    if (fromEnv) return String(fromEnv).trim();
  }
  return DEFAULT_APP_STORE;
}

export function pickStoreUrlForPlatform(platformOs) {
  if (platformOs === 'ios') return getAppStoreUrl();
  if (platformOs === 'android') return getPlayStoreUrl();
  return null;
}
