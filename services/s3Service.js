require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');
const {
  isCloudinaryConfigured,
  uploadFileToCloudinary,
  uploadBufferToCloudinary,
  deleteFromCloudinary,
} = require('./cloudinaryService');

const isS3Configured = () => Boolean(
  process.env.AWS_REGION
  && process.env.AWS_ACCESS_KEY_ID
  && process.env.AWS_SECRET_ACCESS_KEY
  && process.env.AWS_S3_BUCKET
);

const isStorageConfigured = () => isCloudinaryConfigured() || isS3Configured();

const getPublicBaseUrl = () => {
  if (process.env.NODE_ENV !== 'production') {
    const port = process.env.PORT || 3000;
    return `http://localhost:${port}`;
  }

  const fromEnv = process.env.PUBLIC_API_URL || process.env.APP_URL || process.env.RAILWAY_PUBLIC_DOMAIN;
  if (fromEnv) {
    const trimmed = String(fromEnv).trim().replace(/\/$/, '');
    if (trimmed.startsWith('http')) return trimmed;
    return `https://${trimmed}`;
  }

  const port = process.env.PORT || 3000;
  return `http://localhost:${port}`;
};

const getS3Client = () => {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error('AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY must be set in .env');
  }

  return new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
};

const getBucket = () => {
  if (!process.env.AWS_S3_BUCKET) {
    throw new Error('AWS_S3_BUCKET must be set in .env');
  }
  return process.env.AWS_S3_BUCKET;
};

const buildPublicUrl = (bucket, region, key) => {
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodeURIComponent(key).replace(/%2F/g, '/')}`;
};

const safeFileName = (name) => {
  const base = String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  const rand = crypto.randomBytes(8).toString('hex');
  return `${rand}-${base}`;
};

const getUploadsRoot = () => path.join(process.cwd(), 'uploads');

const uploadBufferLocal = async (buffer, key, contentType = 'application/octet-stream') => {
  const normalizedKey = String(key).replace(/^\//, '').replace(/\\/g, '/');
  const fullPath = path.join(getUploadsRoot(), normalizedKey);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, buffer);
  return `${getPublicBaseUrl()}/uploads/${normalizedKey}`;
};

const uploadFileLocal = async (file, folder) => {
  const normalizedFolder = String(folder || '').replace(/\/+$/, '').replace(/^\//, '');
  const filename = safeFileName(file.originalname);
  const key = normalizedFolder ? `${normalizedFolder}/${filename}` : filename;
  return uploadBufferLocal(file.buffer, key, file.mimetype || 'application/octet-stream');
};

const uploadBufferS3 = async (buffer, key, contentType = 'application/octet-stream') => {
  const region = process.env.AWS_REGION;
  const bucket = getBucket();
  const s3 = getS3Client();
  const normalizedKey = String(key).replace(/^\//, '');

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: normalizedKey,
      Body: buffer,
      ContentType: contentType
    })
  );

  return buildPublicUrl(bucket, region, normalizedKey);
};

const uploadFileS3 = async (file, folder) => {
  const region = process.env.AWS_REGION;
  const bucket = getBucket();
  const s3 = getS3Client();
  const key = `${String(folder || '').replace(/\/+$/, '')}/${safeFileName(file.originalname)}`.replace(/^\//, '');

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype || 'application/octet-stream'
    })
  );

  return buildPublicUrl(bucket, region, key);
};

const uploadBuffer = async (buffer, key, contentType = 'application/octet-stream') => {
  if (!buffer) throw new Error('No buffer to upload');
  if (!key) throw new Error('Storage key is required');

  if (isCloudinaryConfigured()) {
    return uploadBufferToCloudinary(buffer, key, contentType);
  }
  if (isS3Configured()) {
    return uploadBufferS3(buffer, key, contentType);
  }
  return uploadBufferLocal(buffer, key, contentType);
};

const uploadFile = async (file, folder) => {
  if (!file || !file.buffer) {
    throw new Error('No file to upload');
  }

  if (isCloudinaryConfigured()) {
    return uploadFileToCloudinary(file, folder);
  }
  if (isS3Configured()) {
    return uploadFileS3(file, folder);
  }

  // eslint-disable-next-line no-console
  console.warn('[storage] Cloudinary/S3 not configured — saving uploads to local disk (uploads/). Set CLOUDINARY_* or AWS_* for production.');
  return uploadFileLocal(file, folder);
};

const parseKeyFromUrl = (fileUrl) => {
  const url = new URL(fileUrl);
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
};

const deleteFile = async (fileUrl) => {
  if (!fileUrl) return;

  if (String(fileUrl).includes('res.cloudinary.com')) {
    await deleteFromCloudinary(fileUrl);
    return;
  }

  if (String(fileUrl).includes('/uploads/')) {
    const marker = '/uploads/';
    const idx = fileUrl.indexOf(marker);
    if (idx >= 0) {
      const key = fileUrl.slice(idx + marker.length);
      const fullPath = path.join(getUploadsRoot(), key);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }
    return;
  }

  if (!isS3Configured()) return;

  const bucket = getBucket();
  const s3 = getS3Client();
  const key = parseKeyFromUrl(fileUrl);

  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key
    })
  );
};

module.exports = {
  isCloudinaryConfigured,
  isS3Configured,
  isStorageConfigured,
  uploadBuffer,
  uploadFile,
  deleteFile,
  getPublicBaseUrl,
};
