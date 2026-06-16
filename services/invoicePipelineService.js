const pool = require('../config/database');
const { getNDISItemCode } = require('../utils/ndisHelper');
const { generateInvoicePDF } = require('../services/pdfService');
const { sendInvoiceEmail } = require('../services/emailService');
const { stripe } = require('../config/stripe');
const { requiresPlanManagerDetails } = require('../utils/fundingPipeline');

const pad4 = (n) => String(n).padStart(4, '0');
const formatDateYYYYMMDD = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
};

const paymentTermsDays = () => {
  const n = Number(process.env.INVOICE_PAYMENT_TERMS_DAYS || 14);
  return Number.isFinite(n) && n >= 7 && n <= 30 ? Math.round(n) : 14;
};

const buildEftReference = (invoiceNumber) => `SS-${invoiceNumber}`;

const loadBookingForInvoice = async (bookingId) => {
  const bookingRes = await pool.query(
    `SELECT
      b.*,
      t.clock_in_time, t.clock_out_time, t.actual_hours, t.approval_status,
      p.ndis_number, p.plan_manager_name, p.plan_manager_email, p.plan_manager_phone,
      p.funding_type, p.management_type, p.user_id AS participant_user_id,
      u.email AS participant_email,
      w.id AS worker_row_id, w.abn, w.first_name AS worker_first_name, w.last_name AS worker_last_name,
      w.stripe_account_id, w.hourly_rate AS worker_hourly_rate
    FROM bookings b
    JOIN booking_timesheets t ON t.booking_id = b.id
    JOIN participants p ON p.id = b.participant_id
    JOIN users u ON u.id = p.user_id
    JOIN workers w ON w.id = b.worker_id
    WHERE b.id = $1
    LIMIT 1`,
    [bookingId]
  );
  return bookingRes.rowCount ? bookingRes.rows[0] : null;
};

const createFundedInvoiceForBooking = async (bookingId) => {
  const existing = await pool.query('SELECT * FROM invoices WHERE booking_id = $1 LIMIT 1', [bookingId]);
  if (existing.rowCount > 0) return existing.rows[0];

  const booking = await loadBookingForInvoice(bookingId);
  if (!booking) throw new Error('Booking not found or missing timesheet');

  const { computeTravelCharge } = await import('../utils/ndisParticipantRates.mjs');

  const today = new Date();
  const datePrefix = formatDateYYYYMMDD(today);
  const terms = paymentTermsDays();
  const dueDate = new Date(today.getTime() + terms * 24 * 60 * 60 * 1000);

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
    const eftReference = buildEftReference(invoiceNumber);

    const hours = Number(booking.actual_hours || 0);
    const rate = Number(booking.hourly_rate ?? booking.worker_hourly_rate ?? 0);
    const labourSubtotal = Number((hours * rate).toFixed(2));
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
    if (sleepoverSubtotal > 0) descParts.push(`Sleepover (flat): $${sleepoverSubtotal.toFixed(2)}`);
    if (travelKm > 0) {
      descParts.push(`Travel ${travelKm.toFixed(1)} km @ $${Number(travelPerKm).toFixed(2)}/km: $${travelSubtotal.toFixed(2)}`);
    }
    if (hours > 0 && rate > 0) {
      descParts.push(`Labour ${hours.toFixed(2)} h @ $${rate.toFixed(2)}/h: $${labourSubtotal.toFixed(2)}`);
    }
    const serviceDescription = descParts.join(' | ');

    const planEmail = booking.plan_manager_email || booking.participant_email || null;

    const invInsert = await client.query(
      `INSERT INTO invoices (
        booking_id, invoice_number, worker_abn, participant_ndis, service_date,
        service_description, ndis_support_item_code, hours, rate, subtotal, gst, total,
        status, eft_reference, due_date, plan_manager_email, payment_terms_days
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft',$13,$14,$15,$16)
      RETURNING *`,
      [
        bookingId,
        invoiceNumber,
        booking.abn,
        booking.ndis_number || null,
        serviceDateISO,
        serviceDescription,
        ndisSupportItemCode,
        hours,
        rate,
        subtotal,
        gst,
        total,
        eftReference,
        dueDate.toISOString().slice(0, 10),
        planEmail,
        terms,
      ]
    );

    await client.query('COMMIT');
    return invInsert.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const generateAndStoreInvoicePdf = async (invoiceId) => {
  const detailsRes = await pool.query(
    `SELECT
      i.*, b.start_time, b.end_time, b.service_type,
      t.actual_hours,
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
    [invoiceId]
  );
  if (detailsRes.rowCount === 0) throw new Error('Invoice not found');
  const row = detailsRes.rows[0];

  const issueDate = new Date();
  const due = row.due_date ? new Date(row.due_date) : new Date(issueDate.getTime() + paymentTermsDays() * 86400000);
  const totalAmount = Number(row.total || 0);

  const pdf = await generateInvoicePDF({
    invoice_number: row.invoice_number,
    issue_date: issueDate.toISOString().slice(0, 10),
    due_date: due.toISOString().slice(0, 10),
    worker_name: `${row.worker_first_name || ''} ${row.worker_last_name || ''}`.trim(),
    worker_abn: row.worker_abn || '',
    participant_name: `${row.participant_first_name || ''} ${row.participant_last_name || ''}`.trim(),
    participant_ndis: row.participant_ndis || '',
    plan_manager_name: row.plan_manager_name || '',
    plan_manager_email: row.plan_manager_email || '',
    service_datetime: `${new Date(row.start_time).toLocaleString()} - ${new Date(row.end_time).toLocaleString()}`,
    service_description: row.service_description || row.service_type || '',
    ndis_support_item_code: row.ndis_support_item_code || '',
    hours: Number(row.hours || row.actual_hours || 0).toFixed(2),
    rate: row.rate,
    subtotal: row.subtotal,
    gst: row.gst,
    total: row.total,
    worker_amount: Number((totalAmount * 0.85).toFixed(2)),
    platform_fee: Number((totalAmount * 0.15).toFixed(2)),
    eft_reference: row.eft_reference || buildEftReference(row.invoice_number),
    payment_terms_days: row.payment_terms_days || paymentTermsDays(),
    eft_bsb: process.env.PLATFORM_EFT_BSB || '',
    eft_account: process.env.PLATFORM_EFT_ACCOUNT || '',
    eft_account_name: process.env.PLATFORM_EFT_ACCOUNT_NAME || 'Summit Staffing Pty Ltd',
  });

  if (pdf.url) {
    await pool.query('UPDATE invoices SET pdf_url = $2 WHERE id = $1', [invoiceId, pdf.url]);
  }
  return { url: pdf.url, buffer: pdf.buffer };
};

/** Returns PDF bytes for email attachment (uses in-memory buffer — no S3 re-download). */
const getInvoicePdfBuffer = async (invoiceId) => {
  const result = await generateAndStoreInvoicePdf(invoiceId);
  if (result?.buffer?.length) return result.buffer;
  throw new Error('Could not generate invoice PDF');
};

const emailInvoiceToPlanManager = async (invoiceId, options = {}) => {
  const isResend = options.resend === true;
  const detailsRes = await pool.query(
    `SELECT
       i.*,
       b.service_type, b.start_time, b.end_time, b.location_address,
       p.plan_manager_email, p.plan_manager_name,
       p.first_name AS participant_first_name, p.last_name AS participant_last_name,
       w.first_name AS worker_first_name, w.last_name AS worker_last_name,
       u.email AS participant_email
     FROM invoices i
     JOIN bookings b ON b.id = i.booking_id
     JOIN participants p ON p.id = b.participant_id
     JOIN users u ON u.id = p.user_id
     JOIN workers w ON w.id = b.worker_id
     WHERE i.id = $1
     LIMIT 1`,
    [invoiceId]
  );
  if (detailsRes.rowCount === 0) throw new Error('Invoice not found');
  const row = detailsRes.rows[0];
  const to = row.plan_manager_email || row.participant_email;
  if (!to) throw new Error('No plan manager or participant email on file');

  const pdfResult = await generateAndStoreInvoicePdf(invoiceId);
  const pdfBuffer = pdfResult?.buffer;
  if (!pdfBuffer?.length) {
    throw new Error('Invoice PDF could not be generated — email not sent');
  }

  const terms = row.payment_terms_days || paymentTermsDays();
  const eftRef = row.eft_reference || buildEftReference(row.invoice_number);
  const bsb = process.env.PLATFORM_EFT_BSB || '';
  const acct = process.env.PLATFORM_EFT_ACCOUNT || '';
  const acctName = process.env.PLATFORM_EFT_ACCOUNT_NAME || 'Summit Staffing Pty Ltd';
  const participantName = `${row.participant_first_name || ''} ${row.participant_last_name || ''}`.trim() || 'Participant';
  const workerName = `${row.worker_first_name || ''} ${row.worker_last_name || ''}`.trim() || 'Support worker';
  const serviceWhen = row.start_time && row.end_time
    ? `${new Date(row.start_time).toLocaleString()} – ${new Date(row.end_time).toLocaleString()}`
    : (row.service_date ? String(row.service_date) : '—');

  const html = `
    <p>Hello${row.plan_manager_name ? ` ${row.plan_manager_name}` : ''},</p>
    ${isResend ? '<p><em>This is a resent copy of your invoice with full details and an updated PDF attachment.</em></p>' : ''}
    <p>Please find attached NDIS invoice <strong>${row.invoice_number}</strong> for plan-managed payment.</p>
    <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:12px 0;font-size:14px;">
      <tr><td><strong>Participant</strong></td><td>${participantName}${row.participant_ndis ? ` (NDIS ${row.participant_ndis})` : ''}</td></tr>
      <tr><td><strong>Support worker</strong></td><td>${workerName}${row.worker_abn ? ` · ABN ${row.worker_abn}` : ''}</td></tr>
      <tr><td><strong>Service</strong></td><td>${row.service_description || row.service_type || 'NDIS support'}</td></tr>
      <tr><td><strong>When</strong></td><td>${serviceWhen}</td></tr>
      ${row.ndis_support_item_code ? `<tr><td><strong>NDIS item</strong></td><td>${row.ndis_support_item_code}</td></tr>` : ''}
      ${row.hours != null && row.rate != null ? `<tr><td><strong>Hours / rate</strong></td><td>${Number(row.hours).toFixed(2)} h @ $${Number(row.rate).toFixed(2)}/hr</td></tr>` : ''}
      <tr><td><strong>Total due</strong></td><td><strong>$${Number(row.total || 0).toFixed(2)} AUD</strong></td></tr>
    </table>
    <p><strong>Payment terms:</strong> ${terms} days from invoice date.</p>
    <p><strong>EFT reference (required):</strong> ${eftRef}</p>
    ${bsb && acct ? `<p><strong>Bank transfer:</strong> BSB ${bsb} · Account ${acct} · ${acctName}</p>` : '<p>Use the EFT reference above when paying by bank transfer so we can reconcile your payment automatically.</p>'}
    <p>The full line-item breakdown is in the attached PDF.</p>
    ${pdfResult.url ? `<p>If the attachment does not appear in your mail app, <a href="${pdfResult.url}">download the invoice PDF here</a>.</p>` : ''}
  `;
  const subject = isResend
    ? `NDIS Invoice ${row.invoice_number} (resend) - Summit Staffing`
    : `NDIS Invoice ${row.invoice_number} - Summit Staffing`;
  await sendInvoiceEmail(to, row.invoice_number, pdfBuffer, { html, subject });

  await pool.query(
    "UPDATE invoices SET status = 'sent' WHERE id = $1 AND status IN ('draft', 'sent')",
    [invoiceId]
  );
  return { to, eftReference: eftRef, resent: isResend };
};

/** Stripe Invoice for reconciliation (metadata carries EFT reference). */
const createStripeReceivableInvoice = async (invoiceRow, participantUserId) => {
  if (!stripe) return null;

  const userRes = await pool.query(
    'SELECT id, email, stripe_customer_id FROM users WHERE id = $1 LIMIT 1',
    [participantUserId]
  );
  if (userRes.rowCount === 0) return null;

  let customerId = userRes.rows[0].stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userRes.rows[0].email || undefined,
      metadata: { userId: String(participantUserId) },
    });
    customerId = customer.id;
    await pool.query('UPDATE users SET stripe_customer_id = $2, updated_at = now() WHERE id = $1', [
      participantUserId,
      customerId,
    ]);
  }

  const amountCents = Math.round(Number(invoiceRow.total || 0) * 100);
  if (amountCents <= 0) return null;

  const daysUntilDue = invoiceRow.payment_terms_days || paymentTermsDays();

  await stripe.invoiceItems.create({
    customer: customerId,
    amount: amountCents,
    currency: 'aud',
    description: `NDIS shift ${invoiceRow.invoice_number} — ref ${invoiceRow.eft_reference}`,
  });

  const stripeInvoice = await stripe.invoices.create({
    customer: customerId,
    collection_method: 'send_invoice',
    days_until_due: daysUntilDue,
    metadata: {
      bookingId: String(invoiceRow.booking_id),
      invoiceId: String(invoiceRow.id),
      eftReference: String(invoiceRow.eft_reference || ''),
      pipeline: 'funded',
    },
  });

  const finalized = await stripe.invoices.finalizeInvoice(stripeInvoice.id);
  await pool.query('UPDATE invoices SET stripe_invoice_id = $2 WHERE id = $1', [invoiceRow.id, finalized.id]);
  return finalized;
};

const processFundedPipelineOnApproval = async (bookingId) => {
  const booking = await loadBookingForInvoice(bookingId);
  if (!booking) throw new Error('Booking not found');

  if (requiresPlanManagerDetails(booking) && !booking.plan_manager_email) {
    throw Object.assign(new Error('Plan manager email is required for funded plan-managed accounts'), {
      code: 'plan_manager_missing',
    });
  }

  const invoice = await createFundedInvoiceForBooking(bookingId);
  await generateAndStoreInvoicePdf(invoice.id);

  let stripeInvoice = null;
  try {
    stripeInvoice = await createStripeReceivableInvoice(invoice, booking.participant_user_id);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('createStripeReceivableInvoice:', err.message);
  }

  const emailResult = await emailInvoiceToPlanManager(invoice.id);

  return {
    ok: true,
    pipeline: 'funded',
    invoiceId: invoice.id,
    invoice_number: invoice.invoice_number,
    eft_reference: invoice.eft_reference,
    emailedTo: emailResult.to,
    stripe_invoice_id: stripeInvoice?.id || invoice.stripe_invoice_id || null,
  };
};

module.exports = {
  paymentTermsDays,
  buildEftReference,
  createFundedInvoiceForBooking,
  generateAndStoreInvoicePdf,
  getInvoicePdfBuffer,
  emailInvoiceToPlanManager,
  processFundedPipelineOnApproval,
};
