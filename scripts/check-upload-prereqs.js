require('dotenv').config();

const pool = require('../config/database');
const { isCloudinaryConfigured, isS3Configured } = require('../services/s3Service');

(async () => {
  console.log('Cloudinary configured:', isCloudinaryConfigured());
  console.log('S3 configured:', isS3Configured());
  try {
    const r = await pool.query("SELECT to_regclass('public.participant_documents') AS t");
    console.log('participant_documents:', r.rows[0]?.t);
    const w = await pool.query("SELECT to_regclass('public.worker_documents') AS t");
    console.log('worker_documents:', w.rows[0]?.t);
  } catch (e) {
    console.error('DB error:', e.message);
  } finally {
    await pool.end();
  }
})();
