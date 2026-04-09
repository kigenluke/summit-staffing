const fs = require('fs');
const path = require('path');

const gradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
const contents = fs.readFileSync(gradlePath, 'utf8');

const versionCodeMatch = contents.match(/versionCode\s+(\d+)/);
if (!versionCodeMatch) {
  throw new Error('versionCode not found in android/app/build.gradle');
}

const current = Number(versionCodeMatch[1]);
const next = current + 1;

const updated = contents.replace(/versionCode\s+\d+/, `versionCode ${next}`);
fs.writeFileSync(gradlePath, updated);

// eslint-disable-next-line no-console
console.log(`Android versionCode incremented: ${current} -> ${next}`);
