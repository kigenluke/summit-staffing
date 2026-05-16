require('dotenv').config();

const crypto = require('crypto');

const isCloudinaryConfigured = () => Boolean(
  process.env.CLOUDINARY_CLOUD_NAME
  && process.env.CLOUDINARY_API_KEY
  && process.env.CLOUDINARY_API_SECRET
);

const getRootFolder = () => {
  const root = String(process.env.CLOUDINARY_FOLDER || 'summit-staffing').replace(/^\/+|\/+$/g, '');
  return root || 'summit-staffing';
};

const buildFolderPath = (folder) => {
  const sub = String(folder || '').replace(/^\/+|\/+$/g, '');
  return sub ? `${getRootFolder()}/${sub}` : getRootFolder();
};

const signParams = (params) => {
  const secret = process.env.CLOUDINARY_API_SECRET;
  const sorted = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return crypto.createHash('sha1').update(`${sorted}${secret}`).digest('hex');
};

const uploadBufferToCloudinary = async (buffer, folder, contentType = 'application/octet-stream') => {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary is not configured');
  }
  if (!buffer?.length) {
    throw new Error('No buffer to upload');
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const timestamp = Math.round(Date.now() / 1000);
  const uploadFolder = buildFolderPath(folder);

  const signatureParams = {
    folder: uploadFolder,
    timestamp,
  };
  const signature = signParams(signatureParams);

  const form = new FormData();
  const blob = new Blob([buffer], { type: contentType || 'application/octet-stream' });
  form.append('file', blob, 'upload');
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('folder', uploadFolder);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: 'POST',
    body: form,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.error || `Cloudinary upload failed (${response.status})`;
    throw new Error(message);
  }
  if (!payload.secure_url) {
    throw new Error('Cloudinary upload did not return a file URL');
  }
  return payload.secure_url;
};

const uploadFileToCloudinary = async (file, folder) => {
  if (!file?.buffer) {
    throw new Error('No file to upload');
  }
  return uploadBufferToCloudinary(
    file.buffer,
    folder,
    file.mimetype || 'application/octet-stream'
  );
};

const publicIdFromUrl = (fileUrl) => {
  try {
    const pathname = new URL(fileUrl).pathname;
    const marker = '/upload/';
    const idx = pathname.indexOf(marker);
    if (idx === -1) return null;
    let rest = pathname.slice(idx + marker.length).replace(/^v\d+\//, '');
    rest = decodeURIComponent(rest);
    return rest.replace(/\.[a-z0-9]+$/i, '');
  } catch {
    return null;
  }
};

const resourceTypeFromUrl = (fileUrl) => {
  if (String(fileUrl).includes('/raw/upload/')) return 'raw';
  if (String(fileUrl).includes('/image/upload/')) return 'image';
  return 'image';
};

const deleteFromCloudinary = async (fileUrl) => {
  if (!fileUrl || !String(fileUrl).includes('res.cloudinary.com')) return;
  if (!isCloudinaryConfigured()) return;

  const publicId = publicIdFromUrl(fileUrl);
  if (!publicId) return;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const timestamp = Math.round(Date.now() / 1000);
  const resourceType = resourceTypeFromUrl(fileUrl);

  const signatureParams = {
    public_id: publicId,
    timestamp,
  };
  const signature = signParams(signatureParams);

  const body = new URLSearchParams({
    public_id: publicId,
    api_key: apiKey,
    timestamp: String(timestamp),
    signature,
  });

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok && payload?.result !== 'not found') {
    const message = payload?.error?.message || payload?.error || `Cloudinary delete failed (${response.status})`;
    throw new Error(message);
  }
};

module.exports = {
  isCloudinaryConfigured,
  uploadFileToCloudinary,
  uploadBufferToCloudinary,
  deleteFromCloudinary,
};
