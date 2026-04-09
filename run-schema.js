/**
 * Run schema.sql against the Railway database
 * Usage: node run-schema.js <DATABASE_URL>
 */
const fs = require('fs');
const { Pool } = require('pg');

const databaseUrl = process.argv[2];
if (!databaseUrl) {
  console.error('Usage: node run-schema.js <DATABASE_URL>');
  console.error('Example: node run-schema.js "postgresql://postgres:PASSWORD@shortline.proxy.rlwy.net:14151/railway"');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const sql = fs.readFileSync('./models/schema.sql', 'utf8');
  console.log('Connecting to database...');
  const client = await pool.connect();
  try {
    console.log('Running schema.sql...');
    await client.query(sql);
    console.log('Schema applied successfully!');
  } catch (err) {
    console.error('Error applying schema:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
