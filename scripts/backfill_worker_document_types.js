/**
 * Fix legacy admin uploads saved as document_type "other" by setting the correct catalog key.
 * Run: node scripts/backfill_worker_document_types.js [--dry-run]
 */
require('dotenv').config();
const pool = require('../config/database');
const { buildDocumentCatalogKeyMap, resolveDocumentCatalogKey } = require('../utils/workerDocumentResolver.cjs');

const dryRun = process.argv.includes('--dry-run');

(async () => {
  const workers = await pool.query(
    `SELECT DISTINCT worker_id FROM worker_documents WHERE document_type = 'other' OR compliance_item_key IS NULL`
  );

  let updated = 0;
  for (const { worker_id } of workers.rows) {
    const docsRes = await pool.query(
      `SELECT id, document_type, compliance_item_key, file_url, created_at
       FROM worker_documents WHERE worker_id = $1 ORDER BY created_at`,
      [worker_id]
    );
    const keyMap = buildDocumentCatalogKeyMap(docsRes.rows);

    for (const doc of docsRes.rows) {
      const catalogKey = resolveDocumentCatalogKey(doc, keyMap);
      if (!catalogKey || catalogKey === 'other') continue;

      const needsType = doc.document_type === 'other' || (doc.document_type !== catalogKey && doc.document_type !== 'insurance');
      const needsItemKey = !doc.compliance_item_key;
      if (!needsType && !needsItemKey) continue;

      console.log(
        dryRun ? '[dry-run]' : '[update]',
        worker_id.slice(0, 8),
        doc.id.slice(0, 8),
        `${doc.document_type} -> ${catalogKey}`,
        (doc.file_url || '').split('/').pop()
      );

      if (!dryRun) {
        if (needsType) {
          await pool.query(
            `UPDATE worker_documents
             SET document_type = $2::worker_document_type, updated_at = now()
             WHERE id = $1`,
            [doc.id, catalogKey]
          );
        }
        if (needsItemKey || needsType) {
          await pool.query(
            `UPDATE worker_documents SET compliance_item_key = $2, updated_at = now() WHERE id = $1`,
            [doc.id, catalogKey]
          );
        }
      }
      updated += 1;
    }
  }

  console.log(dryRun ? `Would update ${updated} rows` : `Updated ${updated} rows`);
  await pool.end();
})().catch((err) => {
  console.error(err);
  pool.end();
  process.exit(1);
});
