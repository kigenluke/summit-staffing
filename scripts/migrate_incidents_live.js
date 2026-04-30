require('dotenv').config();
const { Client } = require('pg');

const SQL = `
CREATE TABLE IF NOT EXISTS worker_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL,
  incident_name TEXT NOT NULL,
  incident_details TEXT,
  image_urls TEXT[] DEFAULT '{}'::text[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT worker_incidents_worker_fk FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
);

ALTER TABLE worker_incidents ADD COLUMN IF NOT EXISTS triage_category TEXT;
ALTER TABLE worker_incidents ADD COLUMN IF NOT EXISTS called_000 BOOLEAN DEFAULT FALSE;
ALTER TABLE worker_incidents ADD COLUMN IF NOT EXISTS is_reportable BOOLEAN DEFAULT FALSE;
ALTER TABLE worker_incidents ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';
ALTER TABLE worker_incidents ADD COLUMN IF NOT EXISTS incident_status TEXT DEFAULT 'received';
ALTER TABLE worker_incidents ADD COLUMN IF NOT EXISTS admin_handover_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS worker_incidents_worker_id_idx ON worker_incidents (worker_id);
CREATE INDEX IF NOT EXISTS worker_incidents_created_at_idx ON worker_incidents (created_at DESC);

CREATE TABLE IF NOT EXISTS worker_complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL,
  complaint_details TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT worker_complaints_worker_fk FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS worker_complaints_worker_id_idx ON worker_complaints (worker_id);
CREATE INDEX IF NOT EXISTS worker_complaints_created_at_idx ON worker_complaints (created_at DESC);
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

  const tables = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('worker_incidents','worker_complaints')
    ORDER BY table_name
  `);

  const cols = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'worker_incidents'
      AND column_name IN ('triage_category','called_000','is_reportable','priority','incident_status','admin_handover_at')
    ORDER BY column_name
  `);

  console.log('Migration done.');
  console.log('Tables:', tables.rows.map((r) => r.table_name).join(', '));
  console.log('Incident columns:', cols.rows.map((r) => r.column_name).join(', '));

  await client.end();
}

run().catch((err) => {
  console.error('Migration failed:', err.message || err);
  process.exit(1);
});

