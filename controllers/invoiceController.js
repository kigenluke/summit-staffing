const { validationResult } = require('express-validator');

const pool = require('../config/database');
const { getNDISItemCode } = require('../utils/ndisHelper');
const { generateInvoicePDF } = require('../services/pdfService');
const { emailInvoiceToPlanManager } = require('../services/invoicePipelineService');
const { isOutboundEmailConfigured } = require('../services/emailService');

const respondValidation = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ ok: false, errors: errors.array() });
    return true;
  }
  return false;
};

const pad4 = (n) => String(n).padStart(4, '0');

const formatDateYYYYMMDD = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
};

const assertInvoiceAccess = async (req, invoiceId) => {
  const invRes = await pool.query(
    `SELECT
       i.*,
       b.worker_id AS booking_worker_id,
       b.participant_id AS booking_participant_id
     FROM invoices i
     JOIN bookings b ON b.id = i.booking_id
     WHERE i.id = $1
     LIMIT 1`,
    [invoiceId]
  );

  if (invRes.rowCount === 0) return { ok: false, status: 404, error: 'Invoice not found' };

  const invoice = invRes.rows[0];
  const userId = req.user?.userId;
  const role = req.user?.role;
  const email = String(req.user?.email || '').toLowerCase();
  const bookingWorkerId = invoice.booking_worker_id;
  const bookingParticipantId = invoice.booking_participant_id;

  if (role === 'admin' || email.endsWith('@summitstaffing.com.au')) {
    return { ok: true, invoice };
  }

  if (role === 'worker' && userId) {
    const workerRes = await pool.query(
      `SELECT w.id FROM workers w
       WHERE w.user_id = $1 AND w.id = $2
       LIMIT 1`,
      [userId, bookingWorkerId]
    );
    if (workerRes.rowCount > 0) return { ok: true, invoice };
  }

  if (role === 'participant' && userId) {
    const participantRes = await pool.query(
      `SELECT p.id FROM participants p
       WHERE p.user_id = $1 AND p.id = $2
       LIMIT 1`,
      [userId, bookingParticipantId]
    );
    if (participantRes.rowCount > 0) return { ok: true, invoice };
  }

  if (role === 'coordinator' && userId) {
    const participantRes = await pool.query(
      'SELECT user_id FROM participants WHERE id = $1 LIMIT 1',
      [bookingParticipantId]
    );
    if (participantRes.rowCount > 0) {
      const accessRes = await pool.query(
        `SELECT id FROM coordinator_participant_access
         WHERE coordinator_user_id = $1 AND participant_user_id = $2 AND status = 'approved'
         LIMIT 1`,
        [userId, participantRes.rows[0].user_id]
      );
      if (accessRes.rowCount > 0) return { ok: true, invoice };
    }
  }

  return {
    ok: false,
    status: 403,
    error: 'You do not have permission to send this invoice. Sign in as the support worker or participant on the booking.',
  };
};

const generateInvoice = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const { computeTravelCharge } = await import('../utils/ndisParticipantRates.mjs');
    const { computeLabourPayout } = await import('../utils/billableShiftHours.mjs');

    const { bookingId } = req.params;

    const workerRes = await pool.query('SELECT id, user_id, abn, first_name, last_name FROM workers WHERE user_id = $1 LIMIT 1', [
      req.user.userId
    ]);
    if (workerRes.rowCount === 0) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
    const worker = workerRes.rows[0];

    const bookingRes = await pool.query(
      `SELECT
        b.*, 
        t.clock_in_time, t.clock_out_time, t.actual_hours,
        p.ndis_number, p.plan_manager_name, p.plan_manager_email, p.user_id AS participant_user_id,
        u.email AS participant_email,
        w.hourly_rate AS worker_hourly_rate,
        s.description AS shift_description
      FROM bookings b
      JOIN booking_timesheets t ON t.booking_id = b.id
      JOIN participants p ON p.id = b.participant_id
      JOIN users u ON u.id = p.user_id
      JOIN workers w ON w.id = b.worker_id
      LEFT JOIN shifts s ON s.id = b.source_shift_id
      WHERE b.id = $1
      LIMIT 1`,
      [bookingId]
    );

    if (bookingRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Booking not found or missing timesheet' });
    }

    const booking = bookingRes.rows[0];

    if (booking.worker_id !== worker.id) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    if (booking.status !== 'completed') {
      return res.status(400).json({ ok: false, error: 'Booking must be completed before invoice generation' });
    }

    const existingInv = await pool.query('SELECT id, invoice_number FROM invoices WHERE booking_id = $1 LIMIT 1', [bookingId]);
    if (existingInv.rowCount > 0) {
      return res.status(200).json({ ok: true, invoiceId: existingInv.rows[0].id, invoice_number: existingInv.rows[0].invoice_number });
    }

    const today = new Date();
    const datePrefix = formatDateYYYYMMDD(today);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('invoice_number_lock'))");

      const seqRes = await client.query(
        'SELECT COUNT(*)::int AS cnt FROM invoices WHERE invoice_number LIKE $1',
        [`INV-${datePrefix}-%`]
      );

      const next = (seqRes.rows[0]?.cnt || 0) + 1;
      const invoiceNumber = `INV-${datePrefix}-${pad4(next)}`;

      const { paidHoursAtRate, labourSubtotal } = computeLabourPayout({
        clockInTime: booking.clock_in_time,
        clockOutTime: booking.clock_out_time,
        shiftStartTime: booking.start_time,
        shiftEndTime: booking.end_time,
        shiftDescription: booking.shift_description,
        hourlyRate: Number(booking.hourly_rate ?? booking.worker_hourly_rate ?? 0),
      });
      const hours = paidHoursAtRate;
      const rate = Number(booking.hourly_rate ?? booking.worker_hourly_rate ?? 0);
      const travelKm = booking.travel_distance_km != null ? Number(booking.travel_distance_km) : 0;
      const travelPerKm = booking.travel_rate_per_km != null ? Number(booking.travel_rate_per_km) : 0.99;
      const travelSubtotal = computeTravelCharge(travelKm, travelPerKm);
      const sleepoverSubtotal = booking.sleepover_flat_amount != null ? Number(booking.sleepover_flat_amount) : 0;
      const subtotal = Number((labourSubtotal + travelSubtotal + sleepoverSubtotal).toFixed(2));
      const gst = 0;
      const total = Number((subtotal + gst).toFixed(2));

      const serviceDate = booking.clock_out_time ? new Date(booking.clock_out_time) : new Date(booking.start_time);
      const serviceDateISO = serviceDate.toISOString().slice(0, 10);

      const ndisSupportItemCode = getNDISItemCode(booking.service_type);

      const descParts = [booking.service_type];
      if (sleepoverSubtotal > 0) {
        descParts.push(`Sleepover (flat): $${sleepoverSubtotal.toFixed(2)}`);
      }
      if (travelKm > 0) {
        descParts.push(`Travel ${travelKm.toFixed(1)} km @ $${Number(travelPerKm).toFixed(2)}/km: $${travelSubtotal.toFixed(2)}`);
      }
      if (hours > 0 && rate > 0) {
        descParts.push(`Labour ${hours.toFixed(2)} h @ $${rate.toFixed(2)}/h: $${labourSubtotal.toFixed(2)}`);
      }
      const serviceDescription = descParts.join(' | ');

      const invInsert = await client.query(
        `INSERT INTO invoices (
          booking_id,
          invoice_number,
          worker_abn,
          participant_ndis,
          service_date,
          service_description,
          ndis_support_item_code,
          hours,
          rate,
          subtotal,
          gst,
          total,
          status
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft')
        RETURNING *`,
        [
          bookingId,
          invoiceNumber,
          worker.abn,
          booking.ndis_number || null,
          serviceDateISO,
          serviceDescription,
          ndisSupportItemCode,
          hours,
          rate,
          subtotal,
          gst,
          total
        ]
      );

      await client.query('COMMIT');

      return res.status(201).json({ ok: true, invoice: invInsert.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to generate invoice' });
  }
};

const getInvoices = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const status = req.query.status || null;
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

    const params = [];
    const where = [];

    if (req.user.role === 'admin' || String(req.user.email || '').toLowerCase().endsWith('@summitstaffing.com.au')) {
      // unrestricted
    } else if (req.user.role === 'worker') {
      const workerRes = await pool.query('SELECT id FROM workers WHERE user_id = $1 LIMIT 1', [req.user.userId]);
      if (workerRes.rowCount === 0) return res.status(403).json({ ok: false, error: 'Forbidden' });
      params.push(workerRes.rows[0].id);
      where.push(`b.worker_id = $${params.length}`);
    } else if (req.user.role === 'participant') {
      const participantRes = await pool.query('SELECT id FROM participants WHERE user_id = $1 LIMIT 1', [req.user.userId]);
      if (participantRes.rowCount === 0) return res.status(403).json({ ok: false, error: 'Forbidden' });
      params.push(participantRes.rows[0].id);
      where.push(`b.participant_id = $${params.length}`);
    } else if (req.user.role === 'coordinator') {
      params.push(req.user.userId);
      where.push(`p.user_id IN (
        SELECT participant_user_id FROM coordinator_participant_access
        WHERE coordinator_user_id = $${params.length} AND status = 'approved'
      )`);
    } else {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }

    if (status) {
      params.push(status);
      where.push(`i.status = $${params.length}`);
    }

    if (startDate) {
      params.push(startDate);
      where.push(`i.created_at >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate);
      where.push(`i.created_at <= $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM invoices i
       JOIN bookings b ON b.id = i.booking_id
       ${whereSql}`,
      params
    );

    const dataRes = await pool.query(
      `SELECT
         i.*,
         b.service_type,
         b.start_time,
         b.end_time,
         p.first_name AS participant_first_name,
         p.last_name AS participant_last_name,
         w.first_name AS worker_first_name,
         w.last_name AS worker_last_name
       FROM invoices i
       JOIN bookings b ON b.id = i.booking_id
       JOIN participants p ON p.id = b.participant_id
       JOIN workers w ON w.id = b.worker_id
       ${whereSql}
       ORDER BY i.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return res.status(200).json({ ok: true, total: countRes.rows[0]?.total || 0, limit, offset, invoices: dataRes.rows });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch invoices' });
  }
};

const getInvoiceById = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const access = await assertInvoiceAccess(req, req.params.id);
    if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });

    const detailsRes = await pool.query(
      `SELECT
        i.*,
        b.service_type,
        b.start_time,
        b.end_time,
        b.location_address,
        b.special_instructions,
        t.clock_in_time,
        t.clock_out_time,
        t.actual_hours,
        w.first_name AS worker_first_name,
        w.last_name AS worker_last_name,
        w.phone AS worker_phone,
        w.abn AS worker_abn,
        p.first_name AS participant_first_name,
        p.last_name AS participant_last_name,
        p.ndis_number,
        p.plan_manager_name,
        p.plan_manager_email
      FROM invoices i
      JOIN bookings b ON b.id = i.booking_id
      JOIN booking_timesheets t ON t.booking_id = b.id
      JOIN workers w ON w.id = b.worker_id
      JOIN participants p ON p.id = b.participant_id
      WHERE i.id = $1
      LIMIT 1`,
      [access.invoice.id]
    );

    if (detailsRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Invoice not found' });
    }

    return res.status(200).json({ ok: true, invoice: detailsRes.rows[0] });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to fetch invoice' });
  }
};

const generatePDF = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const access = await assertInvoiceAccess(req, req.params.id);
    if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });

    const invoice = access.invoice;

    const detailsRes = await pool.query(
      `SELECT
        i.*, 
        b.start_time, b.end_time, b.service_type,
        t.clock_in_time, t.clock_out_time, t.actual_hours,
        w.first_name AS worker_first_name, w.last_name AS worker_last_name,
        p.first_name AS participant_first_name, p.last_name AS participant_last_name,
        p.plan_manager_name, p.plan_manager_email
      FROM invoices i
      JOIN bookings b ON b.id = i.booking_id
      JOIN booking_timesheets t ON t.booking_id = b.id
      JOIN workers w ON w.id = b.worker_id
      JOIN participants p ON p.id = b.participant_id
      WHERE i.id = $1
      LIMIT 1`,
      [invoice.id]
    );

    if (detailsRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Invoice not found' });
    }

    const row = detailsRes.rows[0];

    const issueDate = new Date();
    const dueDate = new Date(issueDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    const serviceDateTime = `${new Date(row.start_time).toLocaleString()} - ${new Date(row.end_time).toLocaleString()}`;

    const totalAmount = Number(row.total || 0);
    const workerAmount = Number((totalAmount * 0.85).toFixed(2));
    const platformFee = Number((totalAmount * 0.15).toFixed(2));

    const pdf = await generateInvoicePDF({
      invoice_number: row.invoice_number,
      issue_date: issueDate.toISOString().slice(0, 10),
      due_date: dueDate.toISOString().slice(0, 10),
      worker_name: `${row.worker_first_name || ''} ${row.worker_last_name || ''}`.trim(),
      worker_abn: row.worker_abn || '',
      participant_name: `${row.participant_first_name || ''} ${row.participant_last_name || ''}`.trim(),
      participant_ndis: row.participant_ndis || '',
      plan_manager_name: row.plan_manager_name || '',
      plan_manager_email: row.plan_manager_email || '',
      service_datetime: serviceDateTime,
      service_description: row.service_description || row.service_type || '',
      ndis_support_item_code: row.ndis_support_item_code || '',
      hours: Number(row.hours || row.actual_hours || 0).toFixed(2),
      rate: row.rate,
      subtotal: row.subtotal,
      gst: row.gst,
      total: row.total,
      worker_amount: workerAmount,
      platform_fee: platformFee
    });

    await pool.query('UPDATE invoices SET pdf_url = $2 WHERE id = $1', [invoice.id, pdf.url]);

    return res.status(200).json({ ok: true, pdf_url: pdf.url });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to generate PDF' });
  }
};

const sendInvoiceEmailHandler = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

    const access = await assertInvoiceAccess(req, req.params.id);
    if (!access.ok) return res.status(access.status).json({ ok: false, error: access.error });

    const isResend = req.query.resend === 'true' || req.body?.resend === true;
    const emailResult = await emailInvoiceToPlanManager(access.invoice.id, { resend: isResend });
    return res.status(200).json({ ok: true, emailedTo: emailResult.to, resent: emailResult.resent === true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[invoice send]', err);
    const raw = String(err?.message || err || '');
    const isMailgunForbidden = /^forbidden$/i.test(raw.trim());
    const isMailgunAuth = /forbidden|unauthorized|401|403/i.test(raw);

    let error = raw || 'Failed to send invoice email';
    let hint;
    if (isMailgunForbidden || (isMailgunAuth && /mailgun|domain|api/i.test(raw))) {
      error = 'Invoice email could not be sent — Mailgun rejected the request.';
      if (isOutboundEmailConfigured()) {
        hint = [
          'MAILGUN variables are set on Railway but Mailgun still rejected the send. Check:',
          '• MAILGUN_API_KEY matches mg.summitstaffing.com.au (Mailgun → Sending → Domain → API keys)',
          '• MAILGUN_FROM_EMAIL is noreply@mg.summitstaffing.com.au (same domain as MAILGUN_DOMAIN)',
          '• EU Mailgun account: add MAILGUN_REGION=eu, then redeploy',
          'Push latest code to Railway so auto EU/US retry is active, then try Send again.',
        ].join('\n');
      } else {
        hint = [
          'In Railway → your service → Variables, set:',
          '• MAILGUN_API_KEY (starts with key-… from Mailgun → Sending → Domain → API keys)',
          '• MAILGUN_DOMAIN (exactly mg.summitstaffing.com.au)',
          '• MAILGUN_FROM_EMAIL = Summit Staffing <noreply@mg.summitstaffing.com.au>',
          'If your Mailgun account is EU region, add MAILGUN_REGION=eu',
          'Then redeploy Railway and try again.',
        ].join('\n');
      }
    } else if (/MAILGUN/i.test(raw)) {
      error = 'Invoice email is not configured on this server.';
      hint = 'Add MAILGUN_API_KEY and MAILGUN_DOMAIN to the server environment.';
    } else if (/plan manager|participant email/i.test(raw)) {
      hint = 'Open the participant profile and add a plan manager email or participant email, then try again.';
    } else if (/chrome|puppeteer|pdf/i.test(raw)) {
      error = 'Invoice PDF could not be generated on the server.';
      hint = process.env.NODE_ENV === 'production'
        ? 'Ensure Chrome/Chromium is available on Railway, or set PUPPETEER_EXECUTABLE_PATH.'
        : 'Install Google Chrome, or run: npx puppeteer browsers install chrome — then restart npm run dev.';
    }

    return res.status(502).json({ ok: false, error, hint });
  }
};

module.exports = {
  generateInvoice,
  getInvoices,
  getInvoiceById,
  generatePDF,
  sendInvoiceEmail: sendInvoiceEmailHandler
};
