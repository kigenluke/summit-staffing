/**
 * One-off: create coordinator_profiles for coordinator Edit Profile.
 * Usage: DATABASE_URL=... node scripts/migrate_coordinator_profile.js
 */
require('dotenv').config();
const { Client } = require('pg');

const SQL = `
CREATE TABLE IF NOT EXISTS coordinator_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL missing in environment/.env');
  }
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  await client.query(SQL);
  // eslint-disable-next-line no-console
  console.log('coordinator_profiles migration done.');
  await client.end();
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
