/**
 * Generate Android/iOS/web icons from assets/summit-logo.png
 * Run: node scripts/generate_app_icons.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const src = path.join(root, 'assets', 'summit-logo.png');
const androidRes = path.join(root, 'android', 'app', 'src', 'main', 'res');
const iosIconDir = path.join(root, 'ios', 'SummitStaffingApp', 'Images.xcassets', 'AppIcon.appiconset');
const publicDir = path.join(root, 'public');

if (!fs.existsSync(src)) {
  console.error('Missing', src);
  process.exit(1);
}

const androidLauncherSizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

const iosIcons = [
  { name: 'AppIcon-40.png', size: 40 },
  { name: 'AppIcon-58.png', size: 58 },
  { name: 'AppIcon-60.png', size: 60 },
  { name: 'AppIcon-80.png', size: 80 },
  { name: 'AppIcon-87.png', size: 87 },
  { name: 'AppIcon-120.png', size: 120 },
  { name: 'AppIcon-180.png', size: 180 },
  { name: 'AppIcon-1024.png', size: 1024 },
];

async function makeSquareIcon(size, outPath, paddingRatio = 0.08) {
  const pad = Math.round(size * paddingRatio);
  const inner = size - pad * 2;
  const resized = await sharp(src)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([{ input: resized, gravity: 'centre' }])
    .png()
    .toFile(outPath);
}

async function main() {
  fs.mkdirSync(publicDir, { recursive: true });

  for (const [folder, size] of Object.entries(androidLauncherSizes)) {
    const dir = path.join(androidRes, folder);
    fs.mkdirSync(dir, { recursive: true });
    await makeSquareIcon(size, path.join(dir, 'ic_launcher.png'));
    await makeSquareIcon(size, path.join(dir, 'ic_launcher_round.png'));
    console.log('Android', folder, size);
  }

  const drawableDir = path.join(androidRes, 'drawable');
  fs.mkdirSync(drawableDir, { recursive: true });
  await makeSquareIcon(512, path.join(drawableDir, 'summit_logo.png'), 0.06);
  await makeSquareIcon(432, path.join(drawableDir, 'summit_logo_foreground.png'), 0.1);

  for (const icon of iosIcons) {
    fs.mkdirSync(iosIconDir, { recursive: true });
    await makeSquareIcon(icon.size, path.join(iosIconDir, icon.name));
    console.log('iOS', icon.name);
  }

  await makeSquareIcon(192, path.join(publicDir, 'summit-logo.png'));
  await makeSquareIcon(32, path.join(publicDir, 'favicon.png'));
  console.log('Web favicon + public logo');
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
