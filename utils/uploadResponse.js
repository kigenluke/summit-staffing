const mapUploadErrorMessage = (err) => {
  const msg = String(err?.message || '');

  if (/relation "participant_documents" does not exist/i.test(msg)) {
    return 'Database migration required: run models/schema.sql (participant_documents table).';
  }
  if (/relation "worker_documents" does not exist/i.test(msg)) {
    return 'Database migration required: run models/schema.sql (worker_documents table).';
  }
  if (/invalid input value for enum/i.test(msg)) {
    return 'Invalid document type for this upload.';
  }
  if (/CLOUDINARY_|Cloudinary is not configured/i.test(msg)) {
    return 'File storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.';
  }
  if (/AWS_|S3_BUCKET|must be set in \.env/i.test(msg)) {
    return 'File storage is not configured. Set Cloudinary or AWS S3 variables on the server.';
  }
  if (/No file to upload|No buffer to upload/i.test(msg)) {
    return 'File was not received. Try choosing the document again.';
  }

  return 'Failed to upload document';
};

const respondUploadFailure = (res, err, logLabel = 'upload') => {
  // eslint-disable-next-line no-console
  console.error(`${logLabel} failed:`, err);

  const payload = {
    ok: false,
    error: mapUploadErrorMessage(err),
  };

  if (process.env.NODE_ENV !== 'production') {
    payload.details = err?.message || String(err);
  }

  return res.status(500).json(payload);
};

module.exports = {
  mapUploadErrorMessage,
  respondUploadFailure,
};
