const fs = require('fs');
const path = require('path');
const { isS3Configured, getPublicBaseUrl } = require('./s3Service');

const getUploadsRoot = () => path.join(process.cwd(), 'uploads');

const guessFileName = (fileUrl, fallback = 'identity.jpg') => {
  try {
    const name = path.basename(new URL(fileUrl).pathname);
    if (name && name !== '/') return name;
  } catch (_) {}
  return fallback;
};

const guessContentType = (filename) => {
  const lower = String(filename || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
};

const parseS3KeyFromUrl = (fileUrl) => {
  const url = new URL(fileUrl);
  return decodeURIComponent(url.pathname.replace(/^\//, ''));
};

const fetchLocalUpload = async (fileUrl) => {
  const marker = '/uploads/';
  const idx = fileUrl.indexOf(marker);
  if (idx < 0) throw new Error('Local upload path not found');
  const key = fileUrl.slice(idx + marker.length);
  const fullPath = path.join(getUploadsRoot(), key);
  if (!fs.existsSync(fullPath)) {
    throw new Error('Uploaded file not found on server');
  }
  const filename = path.basename(fullPath);
  return {
    buffer: fs.readFileSync(fullPath),
    contentType: guessContentType(filename),
    filename,
  };
};

const fetchS3Upload = async (fileUrl) => {
  const { S3Client, GetObjectCommand: GetCmd } = require('@aws-sdk/client-s3');
  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_S3_BUCKET;
  if (!region || !bucket) throw new Error('S3 not configured');
  const s3 = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  const key = parseS3KeyFromUrl(fileUrl);
  const res = await s3.send(new GetCmd({ Bucket: bucket, Key: key }));
  const chunks = [];
  for await (const chunk of res.Body) {
    chunks.push(chunk);
  }
  const filename = path.basename(key);
  return {
    buffer: Buffer.concat(chunks),
    contentType: res.ContentType || guessContentType(filename),
    filename,
  };
};

const fetchRemoteUpload = async (fileUrl) => {
  const res = await fetch(fileUrl, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Could not download file (${res.status})`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const filename = guessFileName(fileUrl);
  return {
    buffer,
    contentType: res.headers.get('content-type') || guessContentType(filename),
    filename,
  };
};

/** Download a compliance document by URL (local / S3 / Cloudinary / public URL). */
const fetchFileBuffer = async (fileUrl) => {
  const url = String(fileUrl || '').trim();
  if (!url) throw new Error('Missing file URL');

  if (url.includes('/uploads/')) {
    return fetchLocalUpload(url);
  }

  if (url.includes('amazonaws.com') && isS3Configured()) {
    try {
      return await fetchS3Upload(url);
    } catch (_) {
      /* fall through to HTTP */
    }
  }

  const base = getPublicBaseUrl();
  const absolute = url.startsWith('http') ? url : `${base.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
  return fetchRemoteUpload(absolute);
};

module.exports = { fetchFileBuffer, guessContentType };
