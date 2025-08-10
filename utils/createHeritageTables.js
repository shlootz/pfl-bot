// /utils/createHeritageTables.js
require('dotenv').config();
const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('❌ Missing DATABASE_URL in .env');
  process.exit(1);
}

const SQL = `
-- 1) Ground truth: parent edges (adjacency list)
CREATE TABLE IF NOT EXISTS horse_parent (
  child_id    TEXT NOT NULL,
  parent_id   TEXT NOT NULL,
  parent_type TEXT NOT NULL CHECK (parent_type IN ('sire','dam')),
  PRIMARY KEY (child_id, parent_id, parent_type)
);

CREATE INDEX IF NOT EXISTS idx_horse_parent_child  ON horse_parent(child_id);
CREATE INDEX IF NOT EXISTS idx_horse_parent_parent ON horse_parent(parent_id);

-- 2) Transitive closure: all ancestors/descendants with depth
CREATE TABLE IF NOT EXISTS horse_tree (
  ancestor_id   TEXT NOT NULL,
  descendant_id TEXT NOT NULL,
  depth         SMALLINT NOT NULL,  -- 1 = parent, 2 = grandparent, ...
  PRIMARY KEY (ancestor_id, descendant_id)
);

CREATE INDEX IF NOT EXISTS idx_horse_tree_ancestor_depth ON horse_tree(ancestor_id, depth);
CREATE INDEX IF NOT EXISTS idx_horse_tree_descendant     ON horse_tree(descendant_id);

-- 3) Optional cache for UI/Bot
CREATE TABLE IF NOT EXISTS horse_lineage_cache (
  horse_id        TEXT PRIMARY KEY,
  ancestors_json  JSONB,
  progeny_json    JSONB,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

async function main() {
  const client = new Client({ connectionString: DB_URL });
  try {
    console.log('🐎 Connecting to PostgreSQL…');
    await client.connect();

    console.log('🧱 Creating heritage tables & indexes (idempotent)…');
    await client.query('BEGIN');
    await client.query(SQL);
    await client.query('COMMIT');

    console.log('✅ Done. Tables ready:\n  - horse_parent\n  - horse_tree\n  - horse_lineage_cache');
  } catch (err) {
    console.error('❌ Failed to create heritage tables:', err.message);
    try { await client.query('ROLLBACK'); } catch (_) {}
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();