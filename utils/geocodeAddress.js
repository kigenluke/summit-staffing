/**
 * Geocode an Australian address via Google Geocoding API (server-side).
 */
function getGoogleKey() {
  return process.env.GOOGLE_MAPS_BROWSER_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
}

async function geocodeAddress(address) {
  const query = String(address || '').trim();
  if (!query) return null;

  const key = getGoogleKey();
  if (!key) return null;

  const params = new URLSearchParams({
    address: query,
    key,
    components: 'country:AU',
  });

  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);
    const data = await res.json();
    const loc = data?.results?.[0]?.geometry?.location;
    if (typeof loc?.lat === 'number' && typeof loc?.lng === 'number') {
      return { lat: loc.lat, lng: loc.lng };
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

module.exports = { geocodeAddress };
