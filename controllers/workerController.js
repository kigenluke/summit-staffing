const { validationResult } = require('express-validator');

const pool = require('../config/database');
const { uploadFile } = require('../services/s3Service');
const { validateABN } = require('../services/abnService');

const respondValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ ok: false, errors: errors.array() });
    return true;
  }
  return false;
};

const parseCsv = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

const CORE_VENDOR_OPTIONS = [
  'Taxi Driver',
  'Ambulance Services',
  'Patient Transport',
  'Meal Delivery',
  'Cleaning Services',
  'Laundry Services',
  'Home Maintenance',
  'Mobility Equipment Rental',
  'Medical Supplies',
  'Physiotherapy Services',
  'Occupational Therapy Services',
  'Speech Therapy Services',
  'Community Access Support',
  'Respite Services',
  'Assistive Technology Support',
];

const getWorkers = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const skills = parseCsv(req.query.skills);
    const minRating = req.query.rating ? Number(req.query.rating) : null;
    const verified = req.query.verified;

    const where = [];
    const params = [];

    if (minRating !== null && !Number.isNaN(minRating)) {
      params.push(minRating);
      where.push(`w.rating >= $${params.length}`);
    }

    if (verified === 'true') {
      where.push("w.verification_status = 'verified'");
    } else if (verified === 'false') {
      where.push("w.verification_status <> 'verified'");
    }

    let joinSkills = '';
    if (skills.length > 0) {
      params.push(skills);
      joinSkills = 'JOIN worker_skills ws ON ws.worker_id = w.id';
      where.push(`ws.skill_name = ANY($${params.length})`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(DISTINCT w.id)::int AS total
      FROM workers w
      ${joinSkills}
      ${whereSql}
    `;

    const dataSql = `
      SELECT DISTINCT
        w.id,
        w.user_id,
        w.first_name,
        w.last_name,
        w.phone,
        w.address,
        w.latitude,
        w.longitude,
        w.hourly_rate,
        w.bio,
        w.profile_image_url,
        w.verification_status,
        w.rating,
        w.total_reviews,
        COALESCE(
          (
            SELECT ARRAY_AGG(ws2.skill_name ORDER BY ws2.skill_name)
            FROM worker_skills ws2
            WHERE ws2.worker_id = w.id
          ),
          '{}'
        ) AS skills,
        EXISTS (
          SELECT 1
          FROM worker_skills vws
          WHERE vws.worker_id = w.id
            AND LOWER(vws.skill_name) = ANY($${params.length + 1})
        ) AS has_vendor_category,
        EXISTS (
          SELECT 1
          FROM worker_documents wd
          WHERE wd.worker_id = w.id
        ) AS has_vendor_documents,
        w.created_at,
        w.updated_at
      FROM workers w
      ${joinSkills}
      ${whereSql}
      ORDER BY w.created_at DESC
      LIMIT $${params.length + 2} OFFSET $${params.length + 3}
    `;

    const countResult = await pool.query(countSql, params);
    const vendorCategoriesLower = CORE_VENDOR_OPTIONS.map((s) => s.toLowerCase());
    const dataResult = await pool.query(dataSql, [...params, vendorCategoriesLower, limit, offset]);

    return res.status(200).json({
      ok: true,
      total: countResult.rows[0]?.total || 0,
      limit,
      offset,
      workers: dataResult.rows
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch workers' });
  }
};

const getWorkerById = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { id } = req.params;

    const workerRes = await pool.query(
      `SELECT
        w.*, u.email, u.role, u.email_verified
      FROM workers w
      JOIN users u ON u.id = w.user_id
      WHERE w.id = $1
      LIMIT 1`,
      [id]
    );

    if (workerRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Worker not found' });
    }

    const worker = workerRes.rows[0];

    const [skillsRes, availabilityRes, reviewsRes] = await Promise.all([
      pool.query('SELECT id, skill_name, verified FROM worker_skills WHERE worker_id = $1 ORDER BY skill_name ASC', [id]),
      pool.query(
        'SELECT id, day_of_week, start_time, end_time, is_available FROM worker_availability WHERE worker_id = $1 ORDER BY day_of_week ASC, start_time ASC',
        [id]
      ),
      pool.query(
        `SELECT
          r.id,
          r.booking_id,
          r.reviewer_id,
          r.reviewee_id,
          r.rating,
          r.comment,
          r.created_at,
          u.email AS reviewer_email
        FROM reviews r
        JOIN users u ON u.id = r.reviewer_id
        WHERE r.reviewee_id = $1
        ORDER BY r.created_at DESC
        LIMIT 50`,
        [worker.user_id]
      )
    ]);

    return res.status(200).json({
      ok: true,
      worker,
      skills: skillsRes.rows,
      availability: availabilityRes.rows,
      reviews: reviewsRes.rows
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch worker' });
  }
};

const setupWorkerProfile = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    const userId = req.user.userId;
    const existing = await pool.query('SELECT id FROM workers WHERE user_id = $1 LIMIT 1', [userId]);
    if (existing.rowCount > 0) {
      return res.status(200).json({ ok: true, message: 'Worker profile already exists' });
    }
    const { first_name, last_name, abn } = req.body || {};
    const userRow = await pool.query('SELECT email FROM users WHERE id = $1 LIMIT 1', [userId]);
    const email = userRow.rows[0]?.email || '';
    const namePart = (email && email.split('@')[0]) ? email.split('@')[0].replace(/[^a-zA-Z]/g, ' ') : 'Worker';
    const firstName = (first_name && String(first_name).trim()) || namePart || 'Worker';
    const lastName = (last_name && String(last_name).trim()) || 'User';
    const abnVal = (abn && String(abn).replace(/\D/g, '').slice(0, 11)) || '00000000000';
    const abnPadded = abnVal.padEnd(11, '0').slice(0, 11);
    await pool.query(
      'INSERT INTO workers (user_id, abn, first_name, last_name) VALUES ($1, $2, $3, $4)',
      [userId, abnPadded, firstName, lastName]
    );
    const workerRes = await pool.query(
      'SELECT w.*, u.email, u.role, u.email_verified FROM workers w JOIN users u ON u.id = w.user_id WHERE w.user_id = $1 LIMIT 1',
      [userId]
    );
    const worker = workerRes.rows[0];
    const [skillsRes, availabilityRes, documentsRes] = await Promise.all([
      pool.query('SELECT id, skill_name, verified FROM worker_skills WHERE worker_id = $1 ORDER BY skill_name ASC', [worker.id]),
      pool.query('SELECT id, day_of_week, start_time, end_time, is_available FROM worker_availability WHERE worker_id = $1 ORDER BY day_of_week ASC', [worker.id]),
      pool.query('SELECT id, worker_id, document_type, file_url, issue_date, expiry_date, status, rejection_reason, created_at, updated_at FROM worker_documents WHERE worker_id = $1 ORDER BY created_at DESC', [worker.id])
    ]);
    return res.status(201).json({
      ok: true,
      worker,
      skills: skillsRes.rows,
      availability: availabilityRes.rows,
      documents: documentsRes.rows
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to set up worker profile' });
  }
};

const getMe = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const workerRes = await pool.query(
      `SELECT
        w.*, u.email, u.role, u.email_verified
      FROM workers w
      JOIN users u ON u.id = w.user_id
      WHERE w.user_id = $1
      LIMIT 1`,
      [req.user.userId]
    );

    if (workerRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Worker not found' });
    }

    const worker = workerRes.rows[0];

    const [skillsRes, availabilityRes, documentsRes] = await Promise.all([
      pool.query('SELECT id, skill_name, verified FROM worker_skills WHERE worker_id = $1 ORDER BY skill_name ASC', [worker.id]),
      pool.query(
        'SELECT id, day_of_week, start_time, end_time, is_available FROM worker_availability WHERE worker_id = $1 ORDER BY day_of_week ASC, start_time ASC',
        [worker.id]
      ),
      pool.query(
        `SELECT id, worker_id, document_type, file_url, issue_date, expiry_date, status, rejection_reason, created_at, updated_at
         FROM worker_documents
         WHERE worker_id = $1
         ORDER BY created_at DESC`,
        [worker.id]
      )
    ]);

    return res.status(200).json({
      ok: true,
      worker,
      skills: skillsRes.rows,
      availability: availabilityRes.rows,
      documents: documentsRes.rows
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch worker profile' });
  }
};

const uploadProfilePhoto = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { id } = req.params;

    const workerRes = await pool.query('SELECT id, user_id FROM workers WHERE id = $1 LIMIT 1', [id]);
    if (workerRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Worker not found' });
    }

    const worker = workerRes.rows[0];
    if (!req.user || req.user.userId !== worker.user_id) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'File is required' });
    }

    const folder = `profiles/${worker.id}`;
    const fileUrl = await uploadFile(req.file, folder);

    const updated = await pool.query('UPDATE workers SET profile_image_url = $2, updated_at = now() WHERE id = $1 RETURNING *', [
      worker.id,
      fileUrl
    ]);

    return res.status(200).json({ ok: true, worker: updated.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to upload profile photo' });
  }
};

const updateWorker = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { id } = req.params;

    const workerRes = await pool.query('SELECT id, user_id FROM workers WHERE id = $1 LIMIT 1', [id]);
    if (workerRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Worker not found' });
    }

    const worker = workerRes.rows[0];

    if (!req.user || req.user.userId !== worker.user_id) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const allowed = [
      'first_name',
      'last_name',
      'phone',
      'address',
      'latitude',
      'longitude',
      'hourly_rate',
      'monthly_earnings_target',
      'max_travel_km',
      'bio',
      'profile_image_url'
    ];

    const fields = [];
    const params = [];

    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        params.push(req.body[key]);
        fields.push(`${key} = $${params.length}`);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ ok: false, error: 'No fields to update' });
    }

    params.push(id);

    const updateSql = `UPDATE workers SET ${fields.join(', ')}, updated_at = now() WHERE id = $${params.length} RETURNING *`;
    const updated = await pool.query(updateSql, params);

    return res.status(200).json({ ok: true, worker: updated.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to update worker' });
  }
};

const uploadDocument = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { id } = req.params;
    const { documentType, issue_date, expiry_date } = req.body;

    const workerRes = await pool.query('SELECT id, user_id FROM workers WHERE id = $1 LIMIT 1', [id]);
    if (workerRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Worker not found' });
    }

    const worker = workerRes.rows[0];

    if (!req.user || req.user.userId !== worker.user_id) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'File is required' });
    }

    const folder = `documents/${worker.id}/${documentType}`;
    const fileUrl = await uploadFile(req.file, folder);

    const insertRes = await pool.query(
      `INSERT INTO worker_documents (worker_id, document_type, file_url, issue_date, expiry_date, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [worker.id, documentType, fileUrl, issue_date || null, expiry_date || null]
    );

    return res.status(201).json({ ok: true, document: insertRes.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to upload document' });
  }
};

const VALID_DOCUMENT_TYPES = ['ndis_screening', 'wwcc', 'yellow_card', 'police_check', 'first_aid', 'manual_handling', 'insurance', 'other'];

const uploadDocumentsBulk = async (req, res) => {
  try {
    const { id } = req.params;
    const files = req.files && Array.isArray(req.files) ? req.files : [];
    const documentTypesRaw = req.body.documentTypes ? String(req.body.documentTypes).trim() : '';
    const documentTypes = documentTypesRaw.split(',').map((s) => s.trim()).filter(Boolean);

    if (files.length === 0) {
      return res.status(400).json({ ok: false, error: 'At least one file is required' });
    }
    if (documentTypes.length !== files.length) {
      return res.status(400).json({
        ok: false,
        error: `documentTypes must have one type per file (${files.length} types for ${files.length} files). Use comma-separated list, e.g. ndis_screening,wwcc,first_aid`
      });
    }

    for (const dt of documentTypes) {
      if (!VALID_DOCUMENT_TYPES.includes(dt)) {
        return res.status(400).json({ ok: false, error: `Invalid documentType: ${dt}. Allowed: ${VALID_DOCUMENT_TYPES.join(', ')}` });
      }
    }

    const workerRes = await pool.query('SELECT id, user_id FROM workers WHERE id = $1 LIMIT 1', [id]);
    if (workerRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Worker not found' });
    }
    const worker = workerRes.rows[0];
    if (!req.user || req.user.userId !== worker.user_id) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const issueDatesRaw = (req.body.issue_dates && String(req.body.issue_dates).trim()) || '';
    const expiryDatesRaw = (req.body.expiry_dates && String(req.body.expiry_dates).trim()) || '';
    const issueDates = issueDatesRaw ? issueDatesRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const expiryDates = expiryDatesRaw ? expiryDatesRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];

    const inserted = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const documentType = documentTypes[i];
      const folder = `documents/${worker.id}/${documentType}`;
      const fileUrl = await uploadFile(file, folder);
      const issueDate = issueDates[i] || null;
      const expiryDate = expiryDates[i] || null;
      const insertRes = await pool.query(
        `INSERT INTO worker_documents (worker_id, document_type, file_url, issue_date, expiry_date, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         RETURNING *`,
        [worker.id, documentType, fileUrl, issueDate || null, expiryDate || null]
      );
      inserted.push(insertRes.rows[0]);
    }

    return res.status(201).json({ ok: true, documents: inserted, count: inserted.length });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to upload documents' });
  }
};

const addSkill = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { id } = req.params;
    const { skill_name } = req.body;

    const workerRes = await pool.query('SELECT id, user_id FROM workers WHERE id = $1 LIMIT 1', [id]);
    if (workerRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Worker not found' });
    }

    const worker = workerRes.rows[0];

    if (!req.user || req.user.userId !== worker.user_id) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const insertRes = await pool.query(
      'INSERT INTO worker_skills (worker_id, skill_name) VALUES ($1, $2) RETURNING id, worker_id, skill_name, verified',
      [worker.id, String(skill_name).trim()]
    );

    return res.status(201).json({ ok: true, skill: insertRes.rows[0] });
  } catch (err) {
    if (String(err.message || '').includes('worker_skills_unique_skill_per_worker_uq')) {
      return res.status(409).json({ ok: false, error: 'Skill already exists' });
    }
    return res.status(500).json({ ok: false, error: 'Failed to add skill' });
  }
};

const removeSkill = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { id, skillId } = req.params;

    const workerRes = await pool.query('SELECT id, user_id FROM workers WHERE id = $1 LIMIT 1', [id]);
    if (workerRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Worker not found' });
    }

    const worker = workerRes.rows[0];

    if (!req.user || req.user.userId !== worker.user_id) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    const delRes = await pool.query('DELETE FROM worker_skills WHERE id = $1 AND worker_id = $2 RETURNING id', [skillId, worker.id]);
    if (delRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Skill not found' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to remove skill' });
  }
};

const updateAvailability = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { id } = req.params;
    const { availability } = req.body;

    const workerRes = await pool.query('SELECT id, user_id FROM workers WHERE id = $1 LIMIT 1', [id]);
    if (workerRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Worker not found' });
    }

    const worker = workerRes.rows[0];

    if (!req.user || req.user.userId !== worker.user_id) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    if (!Array.isArray(availability)) {
      return res.status(400).json({ ok: false, error: 'availability must be an array' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM worker_availability WHERE worker_id = $1', [worker.id]);

      for (const slot of availability) {
        const dayOfWeek = Number(slot.day_of_week);
        const startTime = slot.start_time || null;
        const endTime = slot.end_time || null;
        const isAvailable = slot.is_available === undefined ? true : Boolean(slot.is_available);

        await client.query(
          'INSERT INTO worker_availability (worker_id, day_of_week, start_time, end_time, is_available) VALUES ($1, $2, $3, $4, $5)',
          [worker.id, dayOfWeek, startTime, endTime, isAvailable]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const availabilityRes = await pool.query(
      'SELECT id, day_of_week, start_time, end_time, is_available FROM worker_availability WHERE worker_id = $1 ORDER BY day_of_week ASC, start_time ASC',
      [worker.id]
    );

    return res.status(200).json({ ok: true, availability: availabilityRes.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to update availability' });
  }
};

const searchWorkers = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const lat = Number(req.query.latitude);
    const lng = Number(req.query.longitude);
    const radiusKm = Number(req.query.radiusKm || req.query.radius || 10);

    const skills = parseCsv(req.query.skills);
    const minRating = req.query.rating ? Number(req.query.rating) : null;

    const dayOfWeek = req.query.day_of_week !== undefined ? Number(req.query.day_of_week) : null;

    const params = [lng, lat, radiusKm * 1000];
    const where = [
      'w.latitude IS NOT NULL',
      'w.longitude IS NOT NULL',
      'ST_DWithin(ST_SetSRID(ST_MakePoint(w.longitude, w.latitude), 4326)::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)'
    ];

    if (minRating !== null && !Number.isNaN(minRating)) {
      params.push(minRating);
      where.push(`w.rating >= $${params.length}`);
    }

    let joinSkills = '';
    if (skills.length > 0) {
      params.push(skills);
      joinSkills = 'JOIN worker_skills ws ON ws.worker_id = w.id';
      where.push(`ws.skill_name = ANY($${params.length})`);
    }

    let joinAvailability = '';
    if (dayOfWeek !== null && !Number.isNaN(dayOfWeek)) {
      params.push(dayOfWeek);
      joinAvailability = 'JOIN worker_availability wa ON wa.worker_id = w.id';
      where.push(`wa.day_of_week = $${params.length} AND wa.is_available = TRUE`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const countSql = `
      SELECT COUNT(DISTINCT w.id)::int AS total
      FROM workers w
      ${joinSkills}
      ${joinAvailability}
      ${whereSql}
    `;

    const dataSql = `
      SELECT DISTINCT
        w.id,
        w.user_id,
        w.first_name,
        w.last_name,
        w.latitude,
        w.longitude,
        w.hourly_rate,
        w.bio,
        w.profile_image_url,
        w.verification_status,
        w.rating,
        w.total_reviews,
        COALESCE(
          (
            SELECT ARRAY_AGG(ws2.skill_name ORDER BY ws2.skill_name)
            FROM worker_skills ws2
            WHERE ws2.worker_id = w.id
          ),
          '{}'
        ) AS skills,
        EXISTS (
          SELECT 1
          FROM worker_skills vws
          WHERE vws.worker_id = w.id
            AND LOWER(vws.skill_name) = ANY($${params.length + 1})
        ) AS has_vendor_category,
        EXISTS (
          SELECT 1
          FROM worker_documents wd
          WHERE wd.worker_id = w.id
        ) AS has_vendor_documents,
        ST_Distance(
          ST_SetSRID(ST_MakePoint(w.longitude, w.latitude), 4326)::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) AS distance_m
      FROM workers w
      ${joinSkills}
      ${joinAvailability}
      ${whereSql}
      ORDER BY distance_m ASC
      LIMIT $${params.length + 2} OFFSET $${params.length + 3}
    `;

    const countRes = await pool.query(countSql, params);
    const vendorCategoriesLower = CORE_VENDOR_OPTIONS.map((s) => s.toLowerCase());
    const dataRes = await pool.query(dataSql, [...params, vendorCategoriesLower, limit, offset]);

    return res.status(200).json({
      ok: true,
      total: countRes.rows[0]?.total || 0,
      limit,
      offset,
      workers: dataRes.rows
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to search workers' });
  }
};

const verifyABN = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;
    const { abn } = req.body;
    return res.status(200).json({ ok: true, valid: validateABN(abn) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to verify ABN' });
  }
};

module.exports = {
  getWorkers,
  getWorkerById,
  getMe,
  setupWorkerProfile,
  updateWorker,
  uploadProfilePhoto,
  uploadDocument,
  uploadDocumentsBulk,
  addSkill,
  removeSkill,
  updateAvailability,
  searchWorkers,
  verifyABN
};
