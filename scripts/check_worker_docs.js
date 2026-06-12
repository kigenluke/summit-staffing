require('dotenv').config();
const pool = require('../config/database');
const { WORKER_DOCUMENT_CATALOG } = require('../utils/workerDocumentCatalog.cjs');

(async () => {
  const r = await pool.query(`
    SELECT w.id, w.first_name, w.last_name, u.email, w.verification_status,
           (SELECT COUNT(*)::int FROM worker_documents d WHERE d.worker_id = w.id) AS doc_count
    FROM workers w
    JOIN users u ON u.id = w.user_id
    WHERE lower(w.first_name) LIKE '%luke%'
       OR lower(u.email) LIKE '%luke%'
       OR lower(u.email) LIKE '%akram%'
    ORDER BY w.updated_at DESC
    LIMIT 5
  `);
  console.log('workers:', JSON.stringify(r.rows, null, 2));

  for (const w of r.rows) {
    const docs = await pool.query(
      `SELECT document_type, status, (file_url IS NOT NULL AND file_url <> '') AS has_file,
              LEFT(file_url, 140) AS file_url, issue_date, expiry_date, created_at
       FROM worker_documents WHERE worker_id = $1 ORDER BY created_at`,
      [w.id]
    );
    const catalogKeys = new Set(WORKER_DOCUMENT_CATALOG.filter((d) => d.key !== 'other').map((d) => d.key));
    const inDb = new Set(docs.rows.map((d) => d.document_type));
    const unknown = docs.rows.filter((d) => !catalogKeys.has(d.document_type));
    const missing = [...catalogKeys].filter((k) => !inDb.has(k));
    console.log(`\n${w.first_name} ${w.last_name} (${w.email}) — ${docs.rows.length} rows in DB`);
    console.log('in DB:', docs.rows.map((d) => ({ type: d.document_type, status: d.status, url: d.file_url })));
    if (unknown.length) console.log('UNKNOWN TYPES (not in app catalog):', unknown);
    console.log('missing from catalog keys:', missing.length, missing.slice(0, 10));
  }
  await pool.end();
})().catch((e) => {
  console.error(e);
  pool.end();
  process.exit(1);
});
