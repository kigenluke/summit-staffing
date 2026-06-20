require('dotenv').config();

const mailgun = require('mailgun-js');
const { getWebClientBaseUrl, getPasswordResetUrl } = require('../utils/clientAppUrl');

/** Railway / some hosts use MAILGUN_FROM_EMAIL; local .env often uses MAILGUN_FROM. */
const getMailgunFrom = () => {
  const raw = String(process.env.MAILGUN_FROM || process.env.MAILGUN_FROM_EMAIL || '').trim();
  return raw || 'Summit Staffing <info@summitstaffing.com.au>';
};

const getClient = () => {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;

  if (!apiKey || !domain) {
    throw new Error('MAILGUN_API_KEY and/or MAILGUN_DOMAIN not set in .env');
  }

  return mailgun({ apiKey, domain });
};

/** mailgun-js ignores non-Buffer attachment data (e.g. Puppeteer Uint8Array). */
const toNodeBuffer = (data) => {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array || Array.isArray(data)) return Buffer.from(data);
  return Buffer.from(String(data));
};

const sendEmail = async (to, subject, html, attachments = [], text = null) => {
  const mg = getClient();
  const from = getMailgunFrom();

  const data = {
    from,
    to,
    subject,
    html,
    attachment: attachments
  };
  if (text) data.text = text;

  try {
    return await mg.messages().send(data);
  } catch (err) {
    const status = err?.statusCode || err?.status;
    const msg = String(err?.message || err || 'Email send failed');
    if (status === 401 || status === 403 || /forbidden|unauthorized/i.test(msg)) {
      const e = new Error(`Mailgun rejected the send (${msg})`);
      e.code = 'MAILGUN_AUTH';
      throw e;
    }
    throw err;
  }
};

const createAttachment = (buffer, filename, contentType = 'application/octet-stream') => {
  const data = toNodeBuffer(buffer);
  if (!data?.length) {
    throw new Error('Cannot create attachment: empty or invalid buffer');
  }

  const mg = getClient();
  return new mg.Attachment({
    data,
    filename,
    contentType,
    knownLength: data.length
  });
};

const getClientAppBaseUrl = () => getWebClientBaseUrl();

const sendPasswordResetEmail = async (email, resetToken) => {
  const resetUrl = getPasswordResetUrl(resetToken);
  const safeToken = String(resetToken || '').trim();

  const subject = 'Reset Your Password - Summit Staffing';
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;">
      <h2 style="color:#0d9488;margin-bottom:8px;">Password reset request</h2>
      <p>We received a request to reset your Summit Staffing app password.</p>
      <p style="margin:24px 0;">
        <a href="${resetUrl}" style="display:inline-block;background:#0d9488;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;">
          Open app &amp; reset password
        </a>
      </p>
      <p style="font-size:14px;color:#555;">On your phone, tap the button above. It should open the Summit Staffing app. This link expires in 1 hour.</p>
      <p style="font-size:14px;color:#555;margin-top:16px;">If the button does not open the app:</p>
      <ol style="font-size:14px;color:#555;padding-left:20px;">
        <li>Open the <strong>Summit Staffing</strong> app</li>
        <li>Go to <strong>Sign in</strong> → <strong>Forgot password?</strong> (you already did this)</li>
        <li>Tap <strong>Enter reset code in app</strong> after requesting the email, or open <strong>New password</strong> from the login screen</li>
        <li>Paste this reset code:</li>
      </ol>
      <p style="font-size:12px;word-break:break-all;background:#f1f5f9;padding:12px;border-radius:8px;font-family:monospace;">${safeToken}</p>
      <p style="font-size:14px;color:#777;margin-top:24px;">If you did not request this, you can ignore this email.</p>
    </div>
  `;
  const text =
    `Reset your Summit Staffing app password (expires in 1 hour).\n\n`
    + `Tap this link on your phone to open the app:\n${resetUrl}\n\n`
    + `If the link does not open the app, open Summit Staffing → Sign in → enter reset code on the New password screen:\n\n`
    + `${safeToken}\n\n`
    + `If you did not request this, ignore this email.`;

  return sendEmail(email, subject, html, [], text);
};

const sendVerificationEmail = async (email, verificationToken) => {
  const appUrl = getClientAppBaseUrl();
  const verifyUrl = `${appUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`;

  const subject = 'Verify your email';
  const html = `<p>Welcome to Summit Staffing.</p><p>Please verify your email using this link:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`;
  const text = `Verify your Summit Staffing email:\n\n${verifyUrl}`;

  return sendEmail(email, subject, html, [], text);
};

const ROLE_WELCOME_LABELS = {
  worker: 'support worker',
  participant: 'participant',
  coordinator: 'coordinator',
  admin: 'administrator',
};

const sendWelcomeEmail = async (email, { firstName, role } = {}) => {
  const to = String(email || '').trim().toLowerCase();
  if (!to || !to.includes('@')) {
    throw new Error('Welcome email: missing or invalid recipient address');
  }
  if (!isOutboundEmailConfigured()) {
    throw new Error('Welcome email: MAILGUN_API_KEY and MAILGUN_DOMAIN are not set on the server');
  }

  const appUrl = getClientAppBaseUrl();
  const safeName = firstName ? String(firstName).trim().replace(/</g, '&lt;') : '';
  const greeting = safeName ? `Hi ${safeName},` : 'Hi there,';
  const roleLabel = ROLE_WELCOME_LABELS[role] || 'member';
  const subject = 'Welcome to Summit Staffing';
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a;">
      <h2 style="color:#0d9488;margin-bottom:8px;">Welcome to Summit Staffing</h2>
      <p>${greeting}</p>
      <p>Thank you for creating your account as a <strong>${roleLabel}</strong>.</p>
      <p>Your sign-in email is: <strong>${to.replace(/</g, '&lt;')}</strong></p>
      <p style="margin:24px 0;">
        <a href="${appUrl}" style="display:inline-block;background:#0d9488;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;">
          Open Summit Staffing
        </a>
      </p>
      <p style="font-size:14px;color:#555;">Complete your profile and upload any required documents so we can verify your account.</p>
      <p style="font-size:14px;color:#777;margin-top:24px;">If you did not create this account, contact us at support@summitstaffing.com.au.</p>
      <p>— Summit Staffing</p>
    </div>
  `;
  const text =
    `${greeting}\n\n`
    + `Thank you for creating your Summit Staffing account as a ${roleLabel}.\n\n`
    + `Sign-in email: ${to}\n\n`
    + `Open the app: ${appUrl}\n\n`
    + `Complete your profile and upload required documents for verification.\n\n`
    + `— Summit Staffing`;
  return sendEmail(to, subject, html, [], text);
};

const sendReferralInviteEmail = async ({ toEmail, referrerName, role, inviteUrl }) => {
  const roleLabel = role === 'worker' ? 'support worker' : 'participant';
  const subject = `You're invited to join Summit Staffing as a ${roleLabel}`;
  const safeReferrer = String(referrerName || 'Someone').replace(/</g, '&lt;');
  const html = `
    <p>Hello,</p>
    <p><strong>${safeReferrer}</strong> has invited you to join <strong>Summit Staffing</strong> as a <strong>${roleLabel}</strong>.</p>
    <p>Download the app and create your account using this link (valid for 30 days):</p>
    <p><a href="${inviteUrl}">${inviteUrl}</a></p>
    <p>The link will take you to the Google Play Store or Apple App Store to install Summit Staffing.</p>
    <p>If you did not expect this email, you can ignore it.</p>
    <p>— Summit Staffing</p>
  `;
  const text =
    `${safeReferrer} invited you to join Summit Staffing as a ${roleLabel}.\n\n`
    + `Open this link to download the app and sign up:\n${inviteUrl}\n\n`
    + `— Summit Staffing`;
  return sendEmail(toEmail, subject, html, [], text);
};

const sendCoordinatorInviteEmail = async (toEmail, participantDisplayName, signupUrl) => {
  const subject = 'Invitation: coordinate on Summit Staffing';
  const safeName = String(participantDisplayName || 'A participant').replace(/</g, '&lt;');
  const html = `
    <p>Hello,</p>
    <p><strong>${safeName}</strong> has invited you to join Summit Staffing as a <strong>coordinator</strong> so you can help manage their account.</p>
    <p>Create your coordinator account using this link (valid for 14 days):</p>
    <p><a href="${signupUrl}">${signupUrl}</a></p>
    <p>Use the same email address this invitation was sent to: <strong>${String(toEmail).replace(/</g, '&lt;')}</strong></p>
    <p>If you did not expect this email, you can ignore it.</p>
  `;
  return sendEmail(toEmail, subject, html);
};

const sendInvoiceEmail = async (to, invoiceNumber, pdfBuffer, options = {}) => {
  const subject = options.subject || `Invoice ${invoiceNumber} - Summit Staffing`;
  const html =
    options.html
    || `<p>Please find attached your invoice <strong>${invoiceNumber}</strong>.</p><p>Payment due per terms on the invoice.</p>`;

  const normalizedPdf = toNodeBuffer(pdfBuffer);
  if (!normalizedPdf?.length) {
    throw new Error(`Cannot send invoice ${invoiceNumber}: PDF attachment is missing`);
  }

  const safeName = String(invoiceNumber || 'invoice').replace(/[^\w.-]+/g, '_');
  const attachments = [createAttachment(normalizedPdf, `${safeName}.pdf`, 'application/pdf')];

  return sendEmail(to, subject, html, attachments);
};

/** True when Mailgun env vars are present (does not verify the domain is approved in Mailgun). */
const isOutboundEmailConfigured = () =>
  Boolean(String(process.env.MAILGUN_API_KEY || '').trim() && String(process.env.MAILGUN_DOMAIN || '').trim());

module.exports = {
  sendEmail,
  createAttachment,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendWelcomeEmail,
  sendReferralInviteEmail,
  sendCoordinatorInviteEmail,
  sendInvoiceEmail,
  isOutboundEmailConfigured,
};
