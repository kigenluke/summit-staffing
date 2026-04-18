require('dotenv').config();

const mailgun = require('mailgun-js');

const getClient = () => {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;

  if (!apiKey || !domain) {
    throw new Error('MAILGUN_API_KEY and/or MAILGUN_DOMAIN not set in .env');
  }

  return mailgun({ apiKey, domain });
};

const sendEmail = async (to, subject, html, attachments = []) => {
  const mg = getClient();
  const from = process.env.MAILGUN_FROM || 'Summit Staffing <info@summitstaffing.com.au>';

  const data = {
    from,
    to,
    subject,
    html,
    attachment: attachments
  };

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

const sendPasswordResetEmail = async (email, resetToken) => {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const resetUrl = `${appUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(resetToken)}`;

  const subject = 'Reset your password';
  const html = `<p>You requested a password reset.</p><p>Use this link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour.</p>`;

  return sendEmail(email, subject, html);
};

const sendVerificationEmail = async (email, verificationToken) => {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const verifyUrl = `${appUrl.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(verificationToken)}`;

  const subject = 'Verify your email';
  const html = `<p>Welcome to Summit Staffing.</p><p>Please verify your email using this link:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`;

  return sendEmail(email, subject, html);
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

module.exports = {
  sendEmail,
  createAttachment,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendInvoiceEmail
};
