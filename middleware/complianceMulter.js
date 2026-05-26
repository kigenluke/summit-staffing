const multer = require('multer');

const COMPLIANCE_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/jpg',
]);

const COMPLIANCE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

const isAllowedComplianceFile = (file) => {
  const mime = String(file?.mimetype || '').toLowerCase();
  const name = String(file?.originalname || '').toLowerCase();

  if (COMPLIANCE_MIMES.has(mime)) {
    return true;
  }

  if (!mime || mime === 'application/octet-stream') {
    return COMPLIANCE_EXTENSIONS.some((ext) => name.endsWith(ext));
  }

  return false;
};

const complianceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (isAllowedComplianceFile(file)) {
      return cb(null, true);
    }
    return cb(new Error('Invalid file type. Only PDF, JPG, PNG are allowed.'));
  },
});

module.exports = {
  complianceUpload,
  isAllowedComplianceFile,
};
