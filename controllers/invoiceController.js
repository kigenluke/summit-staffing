const { validationResult } = require('express-validator');

const axios = require('axios');

const pool = require('../config/database');
const { getNDISItemCode } = require('../utils/ndisHelper');
const { generateInvoicePDF } = require('../services/pdfService');
const { sendInvoiceEmail } = require('../services/emailService');

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
    `SELECT i.*, b.worker_id, b.participant_id, w.user_id AS worker_user_id, p.user_id AS participant_user_id
     FROM invoices i
     JOIN bookings b ON b.id = i.booking_id
     JOIN workers w ON w.id = b.worker_id
     JOIN participants p ON p.id = b.participant_id
     WHERE i.id = $1
     LIMIT 1`,
    [invoiceId]
  );

  if (invRes.rowCount === 0) return { ok: false, status: 404, error: 'Invoice not found' };

  const invoice = invRes.rows[0];
  if (req.user.role === 'admin') return { ok: true, invoice };

  const can = req.user.userId === invoice.worker_user_id || req.user.userId === invoice.participant_user_id;
  if (!can) return { ok: false, status: 403, error: 'Forbidden' };

  return { ok: true, invoice };
};

const generateInvoice = async (req, res) => {
  try {
    if (respondValidation(req, res)) return;

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
        w.hourly_rate AS worker_hourly_rate
      FROM bookings b
      JOIN booking_timesheets t ON t.booking_id = b.id
      JOIN participants p ON p.id = b.participant_id
      JOIN users u ON u.id = p.user_id
      JOIN workers w ON w.id = b.worker_id
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

      const hours = Number(booking.actual_hours || 0);
      const rate = Number(booking.hourly_rate ?? booking.worker_hourly_rate ?? 0);
      const subtotal = Number((hours * rate).toFixed(2));
      const gst = 0;
      const total = Number((subtotal + gst).toFixed(2));

      const serviceDate = booking.clock_out_time ? new Date(booking.clock_out_time) : new Date(booking.start_time);
      const serviceDateISO = serviceDate.toISOString().slice(0, 10);

      const ndisSupportItemCode = getNDISItemCode(booking.service_type);

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
          booking.service_type,
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

    if (req.user.role === 'admin') {
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
         p.last_name AS participant_last_name
       FROM invoices i
       JOIN bookings b ON b.id = i.booking_id
       JOIN participants p ON p.id = b.participant_id
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

    const detailsRes = await pool.query(
      `SELECT
        i.*, b.participant_id,
        p.plan_manager_email,
        u.email AS participant_email
      FROM invoices i
      JOIN bookings b ON b.id = i.booking_id
      JOIN participants p ON p.id = b.participant_id
      JOIN users u ON u.id = p.user_id
      WHERE i.id = $1
      LIMIT 1`,
      [access.invoice.id]
    );

    if (detailsRes.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Invoice not found' });
    }

    const row = detailsRes.rows[0];
    const to = row.plan_manager_email || row.participant_email;

    if (!to) {
      return res.status(400).json({ ok: false, error: 'No recipient email found for participant/plan manager' });
    }

    // Ensure we have a PDF buffer to attach
    let pdfBuffer = null;
    if (row.pdf_url) {
      try {
        const download = await axios.get(row.pdf_url, { responseType: 'arraybuffer', timeout: 20000 });
        pdfBuffer = Buffer.from(download.data);
      } catch (err) {
        pdfBuffer = null;
      }
    }

    if (!pdfBuffer) {
      const totalAmount2 = Number(row.total || 0);
      const workerAmount2 = Number((totalAmount2 * 0.85).toFixed(2));
      const platformFee2 = Number((totalAmount2 * 0.15).toFixed(2));

      const pdf = await generateInvoicePDF({
        invoice_number: row.invoice_number,
        issue_date: new Date().toISOString().slice(0, 10),
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        worker_name: '',
        worker_abn: row.worker_abn || '',
        participant_name: '',
        participant_ndis: row.participant_ndis || '',
        plan_manager_name: '',
        plan_manager_email: row.plan_manager_email || '',
        service_datetime: row.service_date ? String(row.service_date) : '',
        service_description: row.service_description || '',
        ndis_support_item_code: row.ndis_support_item_code || '',
        hours: Number(row.hours || 0).toFixed(2),
        rate: row.rate,
        subtotal: row.subtotal,
        gst: row.gst,
        total: row.total,
        worker_amount: workerAmount2,
        platform_fee: platformFee2
      });

      pdfBuffer = pdf.buffer;
      await pool.query('UPDATE invoices SET pdf_url = $2 WHERE id = $1', [row.id, pdf.url]);
    }

    await sendInvoiceEmail(to, row.invoice_number, pdfBuffer);
    await pool.query("UPDATE invoices SET status = 'sent' WHERE id = $1", [row.id]);

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Failed to send invoice email' });
  }
};

module.exports = {
  generateInvoice,
  getInvoices,
  getInvoiceById,
  generatePDF,
  sendInvoiceEmail: sendInvoiceEmailHandler
};
