const express = require('express');
const router = express.Router();

function getGooglePlacesKey() {
  return (
    process.env.GOOGLE_MAPS_BROWSER_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    ''
  );
}

async function handleAutocomplete(req, res) {
  const { input } = req.query;
  if (!input || input.trim().length < 2) {
    return res.status(400).json({ ok: false, error: 'input required' });
  }

  const key = getGooglePlacesKey();
  if (!key) {
    return res.status(503).json({ ok: false, error: 'Google Maps key is not configured' });
  }

  const params = new URLSearchParams({
    input: input.trim(),
    key,
    language: String(req.query.language || 'en'),
  });

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`
    );
    const data = await response.json();
    res.json(data); // { predictions: [...], status: 'OK' }
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Places API request failed' });
  }
}

// Existing API endpoint
router.get('/autocomplete', handleAutocomplete);
// Vite-compatible proxy endpoint path
router.get('/place/autocomplete/json', handleAutocomplete);

module.exports = router;