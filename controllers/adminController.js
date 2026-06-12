const { validationResult } = require('express-validator');

const pool = require('../config/database');
const { sendEmail } = require('../services/emailService');
const { uploadFile } = require('../services/s3Service');
const { replaceStaleComplianceUpload } = require('../utils/complianceDocumentDb');

const respondValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ ok: false, errors: errors.array() });
    return true;
  }
  return false;
};

const getDashboardStats = async (req, res) => {
  try {
    const [workers, participants, bookingsByStatus, revenueAll, revenueMonth, revenueWeek, activeUsers, pendingDocs] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS total FROM workers'),
      pool.query('SELECT COUNT(*)::int AS total FROM participants'),
      pool.query("SELECT status, COUNT(*)::int AS total FROM bookings GROUP BY status"),
      pool.query("SELECT COALESCE(SUM(total_amount),0)::numeric AS revenue, COALESCE(SUM(commission_amount),0)::numeric AS commission FROM bookings WHERE status = 'completed'"),
      pool.query(
        "SELECT COALESCE(SUM(total_amount),0)::numeric AS revenue, COALESCE(SUM(commission_amount),0)::numeric AS commission FROM bookings WHERE status = 'completed' AND start_time >= date_trunc('month', now())"
      ),
      pool.query(
        "SELECT COALESCE(SUM(total_amount),0)::numeric AS revenue, COALESCE(SUM(commission_amount),0)::numeric AS commission FROM bookings WHERE status = 'completed' AND start_time >= date_trunc('week', now())"
      ),
      pool.query("SELECT COUNT(*)::int AS total FROM users WHERE last_login_at IS NOT NULL AND last_login_at >= now() - interval '30 days'"),
      pool.query(
        `SELECT (
           (SELECT COUNT(*)::int FROM worker_documents WHERE status = 'pending')
           + (SELECT COUNT(*)::int FROM participant_documents WHERE status = 'pending')
         ) AS total`
      )
    ]);

    const bookings = bookingsByStatus.rows.reduce((acc, r) => {
      acc[r.status] = r.total;
      return acc;
    }, {});

    return res.status(200).json({
      ok: true,
      workers: workers.rows[0]?.total || 0,
      participants: participants.rows[0]?.total || 0,
      bookings,
      revenue: {
        total: revenueAll.rows[0]?.revenue || 0,
        commission_total: revenueAll.rows[0]?.commission || 0,
        this_month: revenueMonth.rows[0]?.revenue || 0,
        this_month_commission: revenueMonth.rows[0]?.commission || 0,
        this_week: revenueWeek.rows[0]?.revenue || 0,
        this_week_commission: revenueWeek.rows[0]?.commission || 0
      },
      active_users_last_30_days: activeUsers.rows[0]?.total || 0,
      pending_document_verifications: pendingDocs.rows[0]?.total || 0
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch dashboard stats' });
  }
};

const getPendingDocuments = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const countRes = await pool.query(
      `SELECT (
         (SELECT COUNT(*)::int FROM worker_documents WHERE status = 'pending')
         + (SELECT COUNT(*)::int FROM participant_documents WHERE status = 'pending')
       ) AS total`
    );

    const docsRes = await pool.query(
      `SELECT d.id, d.worker_id AS subject_id, 'worker' AS account_type, d.document_type, d.file_url, d.issue_date, d.expiry_date, d.status, d.created_at,
              w.first_name, w.last_name, w.abn, w.profile_image_url, u.email
       FROM worker_documents d
       JOIN workers w ON w.id = d.worker_id
       JOIN users u ON u.id = w.user_id
       WHERE d.status = 'pending'
       UNION ALL
       SELECT d.id, d.participant_id AS subject_id, 'participant' AS account_type, d.document_type, d.file_url, d.issue_date, d.expiry_date, d.status, d.created_at,
              p.first_name, p.last_name, NULL AS abn, p.profile_image_url, u.email
       FROM participant_documents d
       JOIN participants p ON p.id = d.participant_id
       JOIN users u ON u.id = p.user_id
       WHERE d.status = 'pending'
       ORDER BY created_at ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return res.status(200).json({ ok: true, total: countRes.rows[0]?.total || 0, limit, offset, documents: docsRes.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch pending documents' });
  }
};

const recomputeWorkerVerification = async (workerId) => {
  const required = ['ndis_screening', 'wwcc', 'police_check', 'first_aid', 'insurance'];
  const agg = await pool.query(
    `SELECT document_type, status
     FROM worker_documents
     WHERE worker_id = $1`,
    [workerId]
  );

  const approvedSet = new Set(agg.rows.filter((r) => r.status === 'approved').map((r) => r.document_type));
  const allApproved = required.every((t) => approvedSet.has(t));

  await pool.query(
    'UPDATE workers SET verification_status = $2, updated_at = now() WHERE id = $1',
    [workerId, allApproved ? 'verified' : 'pending']
  );

  return { allApproved };
};

const approveDocument = async (req, res) => {
  try {
    const accountType = String(req.query.account_type || req.body?.account_type || 'worker').toLowerCase();

    if (accountType === 'participant') {
      const docRes = await pool.query(
        `SELECT d.id, d.participant_id, d.document_type, p.user_id, u.email, p.first_name
         FROM participant_documents d
         JOIN participants p ON p.id = d.participant_id
         JOIN users u ON u.id = p.user_id
         WHERE d.id = $1
         LIMIT 1`,
        [req.params.id]
      );
      if (docRes.rowCount === 0) return res.status(404).json({ ok: false, error: 'Document not found' });
      const doc = docRes.rows[0];
      await pool.query(
        `UPDATE participant_documents SET status = 'approved', rejection_reason = NULL, updated_at = now() WHERE id = $1`,
        [doc.id]
      );
      const { recomputeParticipantVerification } = require('./participantController');
      const status = await recomputeParticipantVerification(doc.participant_id);
      try {
        await sendEmail(
          doc.email,
          'Document approved - Summit Staffing',
          `<p>Hi ${doc.first_name || 'there'},</p><p>Your document <strong>${doc.document_type}</strong> has been approved.</p>`
        );
      } catch (e) {
        void e;
      }
      return res.status(200).json({ ok: true, participantVerification: status });
    }

    const docRes = await pool.query(
      `SELECT d.id, d.worker_id, d.document_type, w.user_id, u.email, w.first_name
       FROM worker_documents d
       JOIN workers w ON w.id = d.worker_id
       JOIN users u ON u.id = w.user_id
       WHERE d.id = $1
       LIMIT 1`,
      [req.params.id]
    );

    if (docRes.rowCount === 0) return res.status(404).json({ ok: false, error: 'Document not found' });

    const doc = docRes.rows[0];

    await pool.query(
      `UPDATE worker_documents
       SET status = 'approved', rejection_reason = NULL, updated_at = now()
       WHERE id = $1`,
      [doc.id]
    );

    const status = await recomputeWorkerVerification(doc.worker_id);

    try {
      await sendEmail(
        doc.email,
        'Document approved - Summit Staffing',
        `<p>Hi ${doc.first_name || 'there'},</p><p>Your document <strong>${doc.document_type}</strong> has been approved.</p>`
      );
    } catch (e) {
      void e;
    }

    return res.status(200).json({ ok: true, workerVerification: status });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to approve document' });
  }
};

const rejectDocument = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { reason } = req.body;

    const accountType = String(req.query.account_type || req.body?.account_type || 'worker').toLowerCase();

    if (accountType === 'participant') {
      const docRes = await pool.query(
        `SELECT d.id, d.participant_id, d.document_type, p.user_id, u.email, p.first_name
         FROM participant_documents d
         JOIN participants p ON p.id = d.participant_id
         JOIN users u ON u.id = p.user_id
         WHERE d.id = $1
         LIMIT 1`,
        [req.params.id]
      );
      if (docRes.rowCount === 0) return res.status(404).json({ ok: false, error: 'Document not found' });
      const doc = docRes.rows[0];
      await pool.query(
        `UPDATE participant_documents SET status = 'rejected', rejection_reason = $2, updated_at = now() WHERE id = $1`,
        [doc.id, reason || null]
      );
      await pool.query("UPDATE participants SET verification_status = 'pending', updated_at = now() WHERE id = $1", [doc.participant_id]);
      try {
        await sendEmail(
          doc.email,
          'Document rejected - Summit Staffing',
          `<p>Hi ${doc.first_name || 'there'},</p><p>Your document <strong>${doc.document_type}</strong> was rejected.</p><p>Reason: ${reason || 'Not provided'}</p>`
        );
      } catch (e) {
        void e;
      }
      return res.status(200).json({ ok: true });
    }

    const docRes = await pool.query(
      `SELECT d.id, d.worker_id, d.document_type, w.user_id, u.email, w.first_name
       FROM worker_documents d
       JOIN workers w ON w.id = d.worker_id
       JOIN users u ON u.id = w.user_id
       WHERE d.id = $1
       LIMIT 1`,
      [req.params.id]
    );

    if (docRes.rowCount === 0) return res.status(404).json({ ok: false, error: 'Document not found' });

    const doc = docRes.rows[0];

    await pool.query(
      `UPDATE worker_documents
       SET status = 'rejected', rejection_reason = $2, updated_at = now()
       WHERE id = $1`,
      [doc.id, reason || null]
    );

    await pool.query("UPDATE workers SET verification_status = 'pending', updated_at = now() WHERE id = $1", [doc.worker_id]);

    try {
      await sendEmail(
        doc.email,
        'Document rejected - Summit Staffing',
        `<p>Hi ${doc.first_name || 'there'},</p><p>Your document <strong>${doc.document_type}</strong> was rejected.</p><p>Reason: ${reason || 'Not provided'}</p><p>Please re-upload a new document in your profile.</p>`
      );
    } catch (e) {
      // ignore
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to reject document' });
  }
};

const getUserList = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const filters = [];
    const params = [];

    if (req.query.role) {
      params.push(req.query.role);
      filters.push(`role = $${params.length}`);
    }

    if (req.query.suspended === 'true') {
      filters.push('is_suspended = TRUE');
    }

    if (req.query.search) {
      params.push(`%${String(req.query.search).toLowerCase()}%`);
      filters.push(`lower(email) LIKE $${params.length}`);
    }

    const whereSql = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const countRes = await pool.query(`SELECT COUNT(*)::int AS total FROM users ${whereSql}`, params);

    const listRes = await pool.query(
      `SELECT u.id, u.email, u.role, u.email_verified, u.is_suspended, u.suspended_reason, u.suspended_at, u.last_login_at, u.created_at,
              COALESCE(w.first_name, p.first_name, cp.first_name) AS first_name,
              COALESCE(w.last_name, p.last_name, cp.last_name) AS last_name,
              COALESCE(w.profile_image_url, p.profile_image_url, cp.profile_image_url) AS profile_image_url
       FROM users u
       LEFT JOIN workers w ON w.user_id = u.id AND u.role = 'worker'
       LEFT JOIN participants p ON p.user_id = u.id AND u.role = 'participant'
       LEFT JOIN coordinator_profiles cp ON cp.user_id = u.id AND u.role = 'coordinator'
       ${whereSql.replace(/\brole\b/g, 'u.role').replace(/\bis_suspended\b/g, 'u.is_suspended').replace(/\bemail\b/g, 'u.email')}
       ORDER BY u.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return res.status(200).json({ ok: true, total: countRes.rows[0]?.total || 0, limit, offset, users: listRes.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch users' });
  }
};

const suspendUser = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { reason } = req.body;

    const userRes = await pool.query('SELECT id, email, is_suspended FROM users WHERE id = $1 LIMIT 1', [req.params.id]);
    if (userRes.rowCount === 0) return res.status(404).json({ ok: false, error: 'User not found' });

    await pool.query(
      'UPDATE users SET is_suspended = TRUE, suspended_reason = $2, suspended_at = now(), updated_at = now() WHERE id = $1',
      [req.params.id, reason || null]
    );

    // optional email
    try {
      await sendEmail(userRes.rows[0].email, 'Account suspended - Summit Staffing', `<p>Your account has been suspended.</p><p>Reason: ${reason || 'Not provided'}</p>`);
    } catch (e) {
      // ignore
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to suspend user' });
  }
};

const getRevenueReport = async (req, res) => {
  try {
    const groupBy = String(req.query.groupBy || 'day');
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

    const bucket = groupBy === 'month' ? 'month' : groupBy === 'week' ? 'week' : 'day';

    const params = [];
    const filters = ["status = 'completed'"];

    if (startDate && !isNaN(startDate.getTime())) {
      params.push(startDate);
      filters.push(`start_time >= $${params.length}`);
    }
    if (endDate && !isNaN(endDate.getTime())) {
      params.push(endDate);
      filters.push(`start_time <= $${params.length}`);
    }

    const whereSql = `WHERE ${filters.join(' AND ')}`;

    const rows = await pool.query(
      `SELECT date_trunc('${bucket}', start_time) AS period,
              COUNT(*)::int AS total_bookings,
              COALESCE(SUM(total_amount),0)::numeric AS total_revenue,
              COALESCE(SUM(commission_amount),0)::numeric AS total_commission
       FROM bookings
       ${whereSql}
       GROUP BY 1
       ORDER BY 1 ASC`,
      params
    );

    return res.status(200).json({ ok: true, groupBy: bucket, report: rows.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch revenue report' });
  }
};

const getBookingMetrics = async (req, res) => {
  try {
    const [byStatus, avgValue, popularServices, busiestDays, busiestHours, workerUtil, participantFreq] = await Promise.all([
      pool.query('SELECT status, COUNT(*)::int AS total FROM bookings GROUP BY status'),
      pool.query("SELECT COALESCE(AVG(total_amount),0)::numeric AS avg_value FROM bookings WHERE status = 'completed'"),
      pool.query('SELECT service_type, COUNT(*)::int AS total FROM bookings GROUP BY service_type ORDER BY total DESC LIMIT 10'),
      pool.query("SELECT EXTRACT(DOW FROM start_time)::int AS day_of_week, COUNT(*)::int AS total FROM bookings GROUP BY day_of_week ORDER BY total DESC"),
      pool.query("SELECT EXTRACT(HOUR FROM start_time)::int AS hour_of_day, COUNT(*)::int AS total FROM bookings GROUP BY hour_of_day ORDER BY total DESC"),
      pool.query(
        `SELECT w.id AS worker_id,
                w.first_name,
                w.last_name,
                COUNT(b.id)::int AS completed_bookings
         FROM workers w
         LEFT JOIN bookings b ON b.worker_id = w.id AND b.status = 'completed'
         GROUP BY w.id
         ORDER BY completed_bookings DESC
         LIMIT 50`
      ),
      pool.query(
        `SELECT p.id AS participant_id,
                p.first_name,
                p.last_name,
                COUNT(b.id)::int AS total_bookings
         FROM participants p
         LEFT JOIN bookings b ON b.participant_id = p.id
         GROUP BY p.id
         ORDER BY total_bookings DESC
         LIMIT 50`
      )
    ]);

    const statusMap = byStatus.rows.reduce((acc, r) => {
      acc[r.status] = r.total;
      return acc;
    }, {});

    return res.status(200).json({
      ok: true,
      bookings_by_status: statusMap,
      average_booking_value: avgValue.rows[0]?.avg_value || 0,
      most_popular_service_types: popularServices.rows,
      busiest_days: busiestDays.rows,
      busiest_hours: busiestHours.rows,
      worker_utilization: workerUtil.rows,
      participant_booking_frequency: participantFreq.rows
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch booking metrics' });
  }
};

const {
  WORKER_DOCUMENT_CATALOG,
  DOC_TYPE_LABELS,
} = require('../utils/workerDocumentCatalog.cjs');

const COMPLIANCE_DOC_MAP = Object.fromEntries(
  WORKER_DOCUMENT_CATALOG.filter((d) => d.key !== 'other').map((d) => [
    d.key,
    { label: DOC_TYPE_LABELS[d.key] || d.label, documentType: d.key },
  ])
);

const normalizeComplianceStatus = (doc) => {
  if (!doc) return 'not_started';
  if (doc.status === 'approved') return 'verified';
  if (doc.status === 'pending') return 'pending';
  return 'action_required';
};

const getUserComplianceStatus = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;
    const userId = req.params.id;

    const workerRes = await pool.query(
      `SELECT w.id AS worker_id, w.user_id, w.first_name, w.last_name, w.abn, w.verification_status, w.profile_image_url, u.email
       FROM workers w
       JOIN users u ON u.id = w.user_id
       WHERE w.user_id = $1
       LIMIT 1`,
      [userId]
    );
    if (workerRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Worker profile not found for this user' });
    }
    const worker = workerRes.rows[0];

    const docsRes = await pool.query(
      `SELECT id, document_type, file_url, status, rejection_reason, created_at, updated_at
       FROM worker_documents
       WHERE worker_id = $1
       ORDER BY created_at DESC`,
      [worker.worker_id]
    );

    const { buildDocumentCatalogKeyMap, resolveDocumentCatalogKey } = require('../utils/workerDocumentResolver.cjs');
    const keyMap = buildDocumentCatalogKeyMap(docsRes.rows);
    const latestByType = {};
    for (const d of docsRes.rows) {
      const catalogKey = resolveDocumentCatalogKey(d, keyMap);
      if (!catalogKey) continue;
      if (!latestByType[catalogKey]) latestByType[catalogKey] = d;
    }

    const items = Object.entries(COMPLIANCE_DOC_MAP).map(([key, def]) => {
      const doc = latestByType[def.documentType] || null;
      return {
        key,
        label: def.label,
        status: normalizeComplianceStatus(doc),
        actionable: true,
        documentType: def.documentType,
        documentId: doc?.id || null,
        fileUrl: doc?.file_url || null,
        reason: doc?.rejection_reason || null,
        lastUpdatedAt: doc?.updated_at || doc?.created_at || null,
      };
    });

    return res.status(200).json({
      ok: true,
      worker: {
        worker_id: worker.worker_id,
        user_id: worker.user_id,
        name: `${worker.first_name || ''} ${worker.last_name || ''}`.trim(),
        email: worker.email,
        verification_status: worker.verification_status,
        profile_image_url: worker.profile_image_url,
      },
      items,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch compliance status' });
  }
};

const updateUserComplianceItem = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;
    const userId = req.params.id;
    const itemKey = req.params.itemKey;
    const action = req.body.action;
    const reason = req.body.reason || null;

    const mapping = COMPLIANCE_DOC_MAP[itemKey];
    if (!mapping) {
      return res.status(400).json({ ok: false, error: 'Unsupported compliance item' });
    }

    const workerRes = await pool.query(
      'SELECT id, user_id FROM workers WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    if (workerRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Worker profile not found for this user' });
    }
    const worker = workerRes.rows[0];

    const docRes = await pool.query(
      `SELECT id
       FROM worker_documents
       WHERE worker_id = $1 AND document_type = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [worker.id, mapping.documentType]
    );
    if (docRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: `No uploaded document found for ${mapping.label}` });
    }

    let nextStatus = 'pending';
    if (action === 'approve') nextStatus = 'approved';
    if (action === 'reject') nextStatus = 'rejected';
    if (action === 'pending') nextStatus = 'pending';

    await pool.query(
      `UPDATE worker_documents
       SET status = $2, rejection_reason = $3, updated_at = now()
       WHERE id = $1`,
      [docRes.rows[0].id, nextStatus, nextStatus === 'rejected' ? reason : null]
    );

    await recomputeWorkerVerification(worker.id);

    return res.status(200).json({
      ok: true,
      item: {
        key: itemKey,
        label: mapping.label,
        status: nextStatus === 'approved' ? 'verified' : nextStatus === 'pending' ? 'pending' : 'action_required',
        reason: nextStatus === 'rejected' ? reason : null,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to update compliance item' });
  }
};

const uploadUserComplianceDocument = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;
    const userId = req.params.id;
    const itemKey = req.params.itemKey;
    const mapping = COMPLIANCE_DOC_MAP[itemKey];
    if (!mapping) {
      return res.status(400).json({ ok: false, error: 'Unsupported compliance item' });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'File is required' });
    }
    const { issue_date, expiry_date } = req.body || {};
    if (!issue_date || !expiry_date) {
      return res.status(400).json({ ok: false, error: 'Start date and end date are required' });
    }
    if (new Date(expiry_date) < new Date(issue_date)) {
      return res.status(400).json({ ok: false, error: 'End date must be on or after start date' });
    }

    const workerRes = await pool.query('SELECT id FROM workers WHERE user_id = $1 LIMIT 1', [userId]);
    if (workerRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Worker profile not found for this user' });
    }
    const workerId = workerRes.rows[0].id;

    await replaceStaleComplianceUpload(pool, {
      table: 'worker',
      subjectId: workerId,
      documentType: mapping.documentType,
    });

    const folder = `documents/${workerId}/${mapping.documentType}`;
    const fileUrl = await uploadFile(req.file, folder);

    const insertRes = await pool.query(
      `INSERT INTO worker_documents (worker_id, document_type, compliance_item_key, file_url, issue_date, expiry_date, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'approved')
       RETURNING *`,
      [workerId, mapping.documentType, itemKey, fileUrl, issue_date, expiry_date]
    );

    await recomputeWorkerVerification(workerId);

    return res.status(201).json({ ok: true, document: insertRes.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to upload compliance document' });
  }
};

module.exports = {
  getDashboardStats,
  getPendingDocuments,
  approveDocument,
  rejectDocument,
  getUserList,
  getUserComplianceStatus,
  updateUserComplianceItem,
  uploadUserComplianceDocument,
  suspendUser,
  getRevenueReport,
  getBookingMetrics
};
