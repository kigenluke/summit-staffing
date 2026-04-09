require('dotenv').config();

const crypto = require('crypto');
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');

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

const uploadBuffer = async (buffer, key, contentType = 'application/octet-stream') => {
  if (!buffer) {
    throw new Error('No buffer to upload');
  }
  if (!key) {
    throw new Error('S3 key is required');
  }

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

const uploadFile = async (file, folder) => {
  if (!file || !file.buffer) {
    throw new Error('No file to upload');
  }

  const region = process.env.AWS_REGION;
  const bucket = getBucket();
  const s3 = getS3Client();

  const key = `${String(folder || '').replace(/\/+$/, '')}/${safeFileName(file.originalname)}`.replace(/^\//, '');

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype
    })
  );

  return buildPublicUrl(bucket, region, key);
};

const parseKeyFromUrl = (fileUrl) => {
  const url = new URL(fileUrl);
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
};

const deleteFile = async (fileUrl) => {
  if (!fileUrl) return;

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
  uploadBuffer,
  uploadFile,
  deleteFile
};
