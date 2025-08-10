require('dotenv').config();
const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL;
const UP_DEPTH = parseInt(process.env.CACHE_ANCESTOR_DEPTH || '3', 10);
const DOWN_DEPTH = parseInt(process.env.CACHE_PROGENY_DEPTH || '3', 10);

/**
 * Usage:
 *   node scripts/refreshLineageCache.js <horse_id>    # one horse
 *   node scripts/refreshLineageCache.js ALL           # sweep all horses in 'horses'
 */
async function run() {
  const arg = process.argv[2];
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  async function refreshOne(horseId) {
    const ancestors = await client.query(`
      SELECT ht.ancestor_id AS id,
             COALESCE(h.raw_data->>'name', a.raw_data->>'name', 'N/A') AS name,
             ht.depth
      FROM horse_tree ht
      LEFT JOIN horses h   ON h.id   = ht.ancestor_id
      LEFT JOIN ancestors a ON a.id  = ht.ancestor_id
      WHERE ht.descendant_id = $1 AND ht.depth BETWEEN 1 AND $2
      ORDER BY ht.depth, name
    `, [horseId, UP_DEPTH]);

    const progeny = await client.query(`
      SELECT ht.descendant_id AS id,
             COALESCE(h.raw_data->>'name', a.raw_data->>'name', 'N/A') AS name,
             ht.depth
      FROM horse_tree ht
      LEFT JOIN horses h   ON h.id   = ht.descendant_id
      LEFT JOIN ancestors a ON a.id  = ht.descendant_id
      WHERE ht.ancestor_id = $1 AND ht.depth BETWEEN 1 AND $2
      ORDER BY ht.depth, name
    `, [horseId, DOWN_DEPTH]);

    await client.query(`
      INSERT INTO horse_lineage_cache (horse_id, ancestors_json, progeny_json, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (horse_id)
      DO UPDATE SET
        ancestors_json = EXCLUDED.ancestors_json,
        progeny_json   = EXCLUDED.progeny_json,
        updated_at     = NOW()
    `, [horseId, JSON.stringify(ancestors.rows), JSON.stringify(progeny.rows)]);

    console.log(`🧊 Cached ${horseId}: ${ancestors.rowCount} ancestors, ${progeny.rowCount} progeny`);
  }

  if (arg && arg !== 'ALL') {
    await refreshOne(arg);
  } else {
    const rs = await client.query(`SELECT id::text AS id FROM horses`);
    for (const r of rs.rows) {
      await refreshOne(r.id);
    }
  }

  await client.end();
  console.log('✅ Cache refresh complete');
}

run().catch(err => {
  console.error('❌ Cache refresh error:', err);
  process.exit(1);
});