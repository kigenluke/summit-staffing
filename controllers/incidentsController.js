const { validationResult } = require('express-validator');
const pool = require('../config/database');
const { uploadFile } = require('../services/s3Service');
const { sendEmail } = require('../services/emailService');

const respondValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ ok: false, errors: errors.array() });
    return true;
  }
  return false;
};

const getWorkerForUser = async (userId) => {
  const workerRes = await pool.query('SELECT id, user_id FROM workers WHERE user_id = $1 LIMIT 1', [userId]);
  return workerRes.rowCount ? workerRes.rows[0] : null;
};

const createIncident = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;
    if (!req.user?.userId) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const worker = await getWorkerForUser(req.user.userId);
    if (!worker) return res.status(404).json({ ok: false, error: 'Worker not found' });

    const {
      incident_name,
      incident_details,
      triage_category,
      called_000,
    } = req.body;
    const files = Array.isArray(req.files) ? req.files : [];

    const triage = String(triage_category || 'other');
    const called000 = called_000 === true || called_000 === 'true';

    const HIGH_PRIORITY_CATEGORIES = new Set([
      'death_of_participant',
      'serious_injury',
      'abuse_or_neglect',
      'unlawful_physical_or_sexual_contact',
      'sexual_misconduct',
      'restrictive_practice',
    ]);

    const is_reportable = HIGH_PRIORITY_CATEGORIES.has(triage);
    const priority = is_reportable ? 'high' : 'normal';

    // Per your requirement: abuse/neglect allegation -> admin handover
    const incident_status = triage === 'abuse_or_neglect' ? 'handover_to_admin' : 'received';

    const folder = `worker-incidents/${worker.id}`;
    const imageUrls = [];
    for (const f of files) {
      // uploadFile expects a multer memory file (with .buffer)
      const url = await uploadFile(f, folder);
      imageUrls.push(url);
    }

    const insertRes = await pool.query(
      `INSERT INTO worker_incidents (
        worker_id,
        incident_name,
        incident_details,
        image_urls,
        triage_category,
        called_000,
        is_reportable,
        priority,
        incident_status
      )
       VALUES ($1, $2, $3, COALESCE($4, '{}'), $5, $6, $7, $8, $9)
       RETURNING id, worker_id, incident_name, incident_details, image_urls, triage_category, called_000, is_reportable, priority, incident_status, created_at`,
      [worker.id, incident_name, incident_details, imageUrls, triage, called000, is_reportable, priority, incident_status]
    );

    // High priority: fixed email alert (requested)
    if (priority === 'high') {
      try {
        const to = 'basimprivate67@gmail.com';
        const subject = `NDIS High-Priority Incident: ${insertRes.rows[0]?.incident_name || incident_name}`;
        const createdAt = insertRes.rows[0]?.created_at ? new Date(insertRes.rows[0].created_at).toISOString() : new Date().toISOString();

        const html = `
          <h3>Incident received (High Priority)</h3>
          <p><b>Incident Name:</b> ${String(incident_name)}</p>
          <p><b>Worker ID:</b> ${worker.id}</p>
          <p><b>Triage Category:</b> ${triage}</p>
          <p><b>Called 000:</b> ${called000 ? 'Yes' : 'No'}</p>
          <p><b>Status:</b> ${incident_status}</p>
          <p><b>Created At:</b> ${createdAt}</p>
          <p><b>Details:</b><br/>${String(incident_details || '').replace(/</g, '&lt;')}</p>
          <p><b>Images:</b></p>
          <ul>${(imageUrls || []).map((u) => `<li><a href="${u}">${u}</a></li>`).join('')}</ul>
        `;

        await sendEmail(to, subject, html);
      } catch (_) {
        // Do not fail incident submission if email fails
      }
    }

    // Optional: when abuse/neglect, you can also update worker suspension later from admin tooling.

    return res.status(201).json({ ok: true, incident: insertRes.rows[0] });
  } catch (err) {
    const details = process.env.NODE_ENV !== 'production'
      ? String(err?.message || '').slice(0, 300)
      : undefined;
    return res.status(500).json({ ok: false, error: 'Failed to submit incident', details });
  }
};

const createComplaint = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;
    if (!req.user?.userId) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    const worker = await getWorkerForUser(req.user.userId);
    if (!worker) return res.status(404).json({ ok: false, error: 'Worker not found' });

    const { complaint_details } = req.body;

    const insertRes = await pool.query(
      `INSERT INTO worker_complaints (worker_id, complaint_details)
       VALUES ($1, $2)
       RETURNING id, worker_id, complaint_details, created_at`,
      [worker.id, complaint_details]
    );

    return res.status(201).json({ ok: true, complaint: insertRes.rows[0] });
  } catch (err) {
    const details = process.env.NODE_ENV !== 'production'
      ? String(err?.message || '').slice(0, 300)
      : undefined;
    return res.status(500).json({ ok: false, error: 'Failed to submit complaint', details });
  }
};

module.exports = {
  createIncident,
  createComplaint
};

