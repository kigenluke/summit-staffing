const express = require('express');
const router = express.Router();

router.get('/autocomplete', async (req, res) => {
  const { input } = req.query;
  if (!input || input.trim().length < 2) {
    return res.status(400).json({ ok: false, error: 'input required' });
  }

  const params = new URLSearchParams({
    input: input.trim(),
    key: process.env.GOOGLE_MAPS_BROWSER_KEY,
    language: 'en',
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
});

module.exports = router;