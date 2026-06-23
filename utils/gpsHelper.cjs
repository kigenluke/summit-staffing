/** Node CJS — see gpsHelper.mjs for Vite / Metro ESM. */
const toRad = (deg) => (deg * Math.PI) / 180;

const CLOCK_SITE_RADIUS_METERS = 100;

const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const isWithinRadius = (lat1, lng1, lat2, lng2, radiusMeters = CLOCK_SITE_RADIUS_METERS) => {
  const distance = calculateDistance(lat1, lng1, lat2, lng2);
  return distance <= radiusMeters;
};

module.exports = {
  CLOCK_SITE_RADIUS_METERS,
  calculateDistance,
  isWithinRadius,
};
