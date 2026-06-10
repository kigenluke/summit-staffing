const pool = require('../config/database');
const {
  REQUIRED_WORKER_COMPLIANCE_DOCS,
  getComplianceProgress,
} = require('../constants/complianceDocuments');

/**
 * Blocks workers until required documents are submitted and admin has verified them.
 * Participants are not gated by compliance uploads (workers only).
 */
const requireAccountVerified = async (req, res, next) => {
  try {
    const role = req.user?.role;
    if (!role || role === 'admin' || role === 'coordinator' || role === 'participant') {
      return next();
    }

    if (role === 'worker') {
      const resW = await pool.query(
        `SELECT w.id, w.verification_status, w.verification_submitted_at
         FROM workers w
         WHERE w.user_id = $1
         LIMIT 1`,
        [req.user.userId]
      );
      if (resW.rowCount === 0) {
        return res.status(403).json({ ok: false, error: 'Worker profile not found', code: 'PROFILE_NOT_FOUND' });
      }
      const row = resW.rows[0];
      const docsRes = await pool.query(
        'SELECT document_type FROM worker_documents WHERE worker_id = $1',
        [row.id]
      );
      const progress = getComplianceProgress(docsRes.rows, REQUIRED_WORKER_COMPLIANCE_DOCS);
      if (!progress.allUploaded) {
        return res.status(403).json({
          ok: false,
          error: 'Upload all required compliance documents before using this feature.',
          code: 'DOCUMENTS_REQUIRED',
        });
      }
      if (!row.verification_submitted_at) {
        return res.status(403).json({
          ok: false,
          error: 'Submit your documents for verification before using this feature.',
          code: 'VERIFICATION_NOT_SUBMITTED',
        });
      }
      if (row.verification_status !== 'verified') {
        return res.status(403).json({
          ok: false,
          error: 'Your documents are pending admin verification.',
          code: 'VERIFICATION_PENDING',
        });
      }
      return next();
    }

    return next();
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Could not verify account access' });
  }
};

module.exports = requireAccountVerified;
