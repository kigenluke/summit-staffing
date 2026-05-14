require('dotenv').config();

const mailgun = require('mailgun-js');

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

  return mg.messages().send(data);
};

const createAttachment = (buffer, filename, contentType = 'application/octet-stream') => {
  const mg = getClient();
  return new mg.Attachment({
    data: buffer,
    filename,
    contentType
  });
};

const getClientAppBaseUrl = () => {
  const base =
    process.env.WEB_APP_URL ||
    process.env.CLIENT_APP_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.APP_URL ||
    'http://localhost:5173';
  return String(base).replace(/\/$/, '');
};

const sendPasswordResetEmail = async (email, resetToken) => {
  const appUrl = getClientAppBaseUrl();
  const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

  const subject = 'Reset your password';
  const html = `<p>You requested a password reset.</p><p>Use this link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour.</p><p>If you did not request this, you can ignore this email.</p>`;
  const text = `Reset your Summit Staffing password (expires in 1 hour):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`;

  return sendEmail(email, subject, html, [], text);
};

const sendVerificationEmail = async (email, verificationToken) => {
  const appUrl = getClientAppBaseUrl();
  const verifyUrl = `${appUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`;

  const subject = 'Verify your email';
  const html = `<p>Welcome to Summit Staffing.</p><p>Please verify your email using this link:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`;

  return sendEmail(email, subject, html);
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

const sendInvoiceEmail = async (to, invoiceNumber, pdfBuffer) => {
  const subject = `Invoice ${invoiceNumber} - Summit Staffing`;
  const html = `<p>Please find attached your invoice <strong>${invoiceNumber}</strong>.</p><p>Payment due within 7 days.</p>`;

  const attachments = [];
  if (pdfBuffer) {
    attachments.push(createAttachment(pdfBuffer, `${invoiceNumber}.pdf`, 'application/pdf'));
  }

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
  sendCoordinatorInviteEmail,
  sendInvoiceEmail,
  isOutboundEmailConfigured,
};
