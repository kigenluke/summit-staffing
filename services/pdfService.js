const fs = require('fs');
const path = require('path');

const puppeteer = require('puppeteer');

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

function systemChromeCandidates() {
  const fromEnv = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.GOOGLE_CHROME_SHIM,
  ].filter(Boolean);

  if (process.platform === 'win32') {
    return [
      ...fromEnv,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
  }

  if (process.platform === 'darwin') {
    return [
      ...fromEnv,
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }

  return [
    ...fromEnv,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
}

function resolveChromeExecutable() {
  for (const candidate of systemChromeCandidates()) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }

  try {
    const bundled = puppeteer.executablePath?.();
    if (bundled && fs.existsSync(bundled)) return bundled;
  } catch (_) {
    // bundled browser not downloaded
  }

  return null;
}

async function launchBrowser() {
  const launchOptions = {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  };

  const executablePath = resolveChromeExecutable();
  if (executablePath) {
    return puppeteer.launch({ ...launchOptions, executablePath });
  }

  try {
    return await puppeteer.launch(launchOptions);
  } catch (err) {
    const hint = 'Install Chrome on this machine, or run: npx puppeteer browsers install chrome';
    const wrapped = new Error(`${err.message || err}\n\n${hint}`);
    wrapped.code = 'PUPPETEER_CHROME_MISSING';
    throw wrapped;
  }
}

const generateInvoicePDF = async (invoiceData) => {
  const templatePath = path.join(__dirname, '..', 'templates', 'invoice-template.html');
  const template = fs.readFileSync(templatePath, 'utf8');

  const html = renderTemplate(template, {
    ...invoiceData,
    rate: formatMoney(invoiceData.rate),
    subtotal: formatMoney(invoiceData.subtotal),
    gst: formatMoney(invoiceData.gst),
    total: formatMoney(invoiceData.total),
    worker_amount: formatMoney(invoiceData.worker_amount),
    platform_fee: formatMoney(invoiceData.platform_fee),
  });

  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const rawPdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
    });
    const pdfBuffer = Buffer.isBuffer(rawPdf) ? rawPdf : Buffer.from(rawPdf);

    const invoiceNumber = invoiceData.invoice_number;
    const key = `invoices/${invoiceNumber}.pdf`;
    let url = null;
    try {
      url = await uploadBuffer(pdfBuffer, key, 'application/pdf');
    } catch (uploadErr) {
      // eslint-disable-next-line no-console
      console.warn('[pdf] invoice storage upload failed:', uploadErr.message);
    }

    return { url, buffer: pdfBuffer };
  } finally {
    await browser.close();
  }
};

module.exports = {
  generateInvoicePDF,
  launchBrowser,
};
