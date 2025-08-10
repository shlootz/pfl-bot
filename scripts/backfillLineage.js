require('dotenv').config();
const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL;
const MAX_DEPTH = parseInt(process.env.LINEAGE_MAX_DEPTH || '10', 10);

function getIdRow(row) {
  // prefer table id; fallback to raw_data.id
  return row.id || (row.raw_data && row.raw_data.id) || row.raw_data?.id || null;
}

function parentIdsFromRaw(raw) {
  if (!raw) return { sireId: null, damId: null };
  return {
    sireId: raw.sireId || raw.raw_data?.sireId || null,
    damId: raw.damId || raw.raw_data?.damId || null,
  };
}

async function backfill() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log('🐎 Connected to PostgreSQL for lineage backfill');

  // 1) Load horses from both tables
  const sources = ['horses', 'ancestors'];
  const seen = new Set();
  const rows = [];

  for (const table of sources) {
    const res = await client.query(`SELECT id::text AS id, raw_data FROM ${table}`);
    for (const r of res.rows) {
      const id = getIdRow(r);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      rows.push({ id, raw: r.raw_data || r });
    }
    console.log(`… loaded ${res.rowCount} from ${table}`);
  }
  console.log(`📦 Unique horses: ${rows.length}`);

  // 2) Upsert parent edges
  console.log('✍️ Upserting parent edges into horse_parent…');
  for (const { id: childId, raw } of rows) {
    const { sireId, damId } = parentIdsFromRaw(raw);
    if (sireId) {
      await client.query(
        `INSERT INTO horse_parent (child_id, parent_id, parent_type)
         VALUES ($1, $2, 'sire') ON CONFLICT DO NOTHING`,
        [childId, sireId]
      );
    }
    if (damId) {
      await client.query(
        `INSERT INTO horse_parent (child_id, parent_id, parent_type)
         VALUES ($1, $2, 'dam') ON CONFLICT DO NOTHING`,
        [childId, damId]
      );
    }
  }
  console.log('✅ Parent edges upserted');

  // 3) Seed closure with depth=1 (parents)
  console.log('🌱 Seeding horse_tree depth=1…');
  await client.query(`
    INSERT INTO horse_tree (ancestor_id, descendant_id, depth)
    SELECT DISTINCT parent_id, child_id, 1
    FROM horse_parent
    ON CONFLICT DO NOTHING
  `);

  // 4) Expand closure iteratively up to MAX_DEPTH
  console.log(`🌳 Expanding closure up to depth ${MAX_DEPTH}…`);
  for (let d = 2; d <= MAX_DEPTH; d++) {
    const result = await client.query(`
      INSERT INTO horse_tree (ancestor_id, descendant_id, depth)
      SELECT DISTINCT hp.parent_id AS ancestor_id,
             ht.descendant_id,
             $1::smallint AS depth
      FROM horse_parent hp
      JOIN horse_tree ht ON ht.ancestor_id = hp.child_id
      WHERE ht.depth = $2::smallint - 1
      ON CONFLICT DO NOTHING
    `, [d, d]);
    console.log(`  depth ${d}: +${result.rowCount}`);
    if (result.rowCount === 0) break; // converged early
  }

  console.log('✅ Lineage backfill completed');
  await client.end();
}

backfill().catch(err => {
  console.error('❌ Backfill error:', err);
  process.exit(1);
});