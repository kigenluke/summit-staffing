const express = require('express');
const multer = require('multer');
const { body } = require('express-validator');

const auth = require('../middleware/auth');
const checkWorker = require('../middleware/checkWorker');
const incidentsController = require('../controllers/incidentsController');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5,
  },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only images are allowed.'));
    }
    return cb(null, true);
  },
});

const complaintImagesIfMultipart = (req, res, next) => {
  const ct = String(req.headers['content-type'] || '');
  if (ct.includes('multipart/form-data')) {
    return upload.array('images', 5)(req, res, next);
  }
  return next();
};

router.post(
  ['/',''],
  [
    auth,
    checkWorker,
    complaintImagesIfMultipart,
    body('complaint_details').isString().isLength({ min: 5, max: 2000 }),
  ],
  incidentsController.createComplaint
);

module.exports = router;

