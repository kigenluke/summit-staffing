/** Server-side store URLs (CommonJS). */

const DEFAULT_PLAY_STORE =
  'https://play.google.com/store/apps/details?id=com.summitstaffing.app';
const DEFAULT_APP_STORE =
  'https://apps.apple.com/search?term=summit%20staffing';

function getPlayStoreUrl() {
  return String(process.env.PLAY_STORE_URL || '').trim() || DEFAULT_PLAY_STORE;
}

function getAppStoreUrl() {
  return String(process.env.APP_STORE_URL || '').trim() || DEFAULT_APP_STORE;
}

module.exports = {
  getPlayStoreUrl,
  getAppStoreUrl,
};
