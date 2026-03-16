const fs = require('fs');
const path = require('path');

let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  // puppeteer not available in this environment
}

const { uploadBuffer } = require('./s3Service');

const renderTemplate = (template, data) => {
  let html = template;
  for (const [key, value] of Object.entries(data)) {
    const safeValue = value === undefined || value === null ? '' : String(value);
    html = html.replace(new RegExp(`{{${key}}}`, 'g'), safeValue);
  }
  return html;
};

const formatMoney = (value) => {
  const n = Number(value || 0);
  return n.toFixed(2);
};

const generateInvoicePDF = async (invoiceData) => {
  if (!puppeteer) {
    // Return a placeholder or error response if puppeteer not available
    console.warn('Puppeteer not available - PDF generation skipped');
    return { 
      url: null, 
      buffer: null,
      warning: 'PDF generation not available in this environment'
    };
  }

  const templatePath = path.join(__dirname, '..', 'templates', 'invoice-template.html');
  const template = fs.readFileSync(templatePath, 'utf8');

  const html = renderTemplate(template, {
    ...invoiceData,
    rate: formatMoney(invoiceData.rate),
    subtotal: formatMoney(invoiceData.subtotal),
    gst: formatMoney(invoiceData.gst),
    total: formatMoney(invoiceData.total),
    worker_amount: formatMoney(invoiceData.worker_amount),
    platform_fee: formatMoney(invoiceData.platform_fee)
  });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
    });

    const invoiceNumber = invoiceData.invoice_number;
    const key = `invoices/${invoiceNumber}.pdf`;
    const url = await uploadBuffer(pdfBuffer, key, 'application/pdf');

    return { url, buffer: pdfBuffer };
  } finally {
    await browser.close();
  }
};

module.exports = {
  generateInvoicePDF
};
