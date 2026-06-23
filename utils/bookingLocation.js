const { geocodeAddress } = require('./geocodeAddress');

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
};

/**
 * Resolve work-site GPS for a booking (worldwide): shift coords → profile coords → geocode address.
 */
async function resolveWorkLocationCoords({ location_lat, location_lng, location_address, participantLat, participantLng }) {
  let lat = toNumberOrNull(location_lat);
  let lng = toNumberOrNull(location_lng);

  if (lat != null && lng != null) return { lat, lng };

  lat = toNumberOrNull(participantLat);
  lng = toNumberOrNull(participantLng);
  if (lat != null && lng != null) return { lat, lng };

  if (location_address) {
    const geo = await geocodeAddress(location_address);
    if (geo) return geo;
  }

  return { lat: null, lng: null };
}

module.exports = { resolveWorkLocationCoords, toNumberOrNull };
