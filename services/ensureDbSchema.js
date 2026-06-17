const fs = require('fs');
const path = require('path');

/**
 * Apply idempotent SQL migrations on boot so production DB stays in sync with the app.
 */
async function ensureDbSchema(pool) {
  const migrationPath = path.join(__dirname, '..', 'migrations', 'bookings_source_shift_id.sql');
  if (!fs.existsSync(migrationPath)) return;

  try {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await pool.query(sql);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[db] ensureDbSchema:', err.message);
  }
}

module.exports = { ensureDbSchema };
