require('dotenv').config();
const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL;

/**
 * Usage:
 *   node scripts/updateLineageForHorse.js <child_id> <sire_id_or_- > <dam_id_or_- >
 * Example:
 *   node scripts/updateLineageForHorse.js 123 SIRE777 DAM888
 */
async function run() {
  const childId = process.argv[2];
  const sireId = process.argv[3] && process.argv[3] !== '-' ? process.argv[3] : null;
  const damId = process.argv[4] && process.argv[4] !== '-' ? process.argv[4] : null;

  if (!childId) {
    console.error('Usage: node scripts/updateLineageForHorse.js <child_id> <sire_id_or_-> <dam_id_or_->');
    process.exit(1);
  }

  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log(`🔧 Updating lineage for child=${childId} (sire=${sireId || 'null'}, dam=${damId || 'null'})`);

  try {
    await client.query('BEGIN');

    // 1) Upsert edges for provided parents
    if (sireId) {
      await client.query(`
        INSERT INTO horse_parent (child_id, parent_id, parent_type)
        VALUES ($1, $2, 'sire')
        ON CONFLICT DO NOTHING
      `, [childId, sireId]);
    }
    if (damId) {
      await client.query(`
        INSERT INTO horse_parent (child_id, parent_id, parent_type)
        VALUES ($1, $2, 'dam')
        ON CONFLICT DO NOTHING
      `, [childId, damId]);
    }

    // 2) Ensure direct links in horse_tree (depth=1)
    await client.query(`
      INSERT INTO horse_tree (ancestor_id, descendant_id, depth)
      SELECT DISTINCT parent_id, child_id, 1
      FROM horse_parent
      WHERE child_id = $1
      ON CONFLICT DO NOTHING
    `, [childId]);

    // 3) Stitch:
    //    - all ancestors of the child's parents
    //    - to all descendants of the child (including itself)
    await client.query(`
      WITH parent_ids AS (
        SELECT parent_id FROM horse_parent WHERE child_id = $1
      ),
      parent_ancestors AS (
        SELECT parent_id AS ancestor_id FROM parent_ids
        UNION
        SELECT ht.ancestor_id
        FROM horse_tree ht
        JOIN parent_ids p ON ht.descendant_id = p.parent_id
      ),
      child_descendants AS (
        SELECT $1::text AS descendant_id, 0 AS d
        UNION ALL
        SELECT ht.descendant_id, ht.depth
        FROM horse_tree ht
        WHERE ht.ancestor_id = $1
      )
      INSERT INTO horse_tree (ancestor_id, descendant_id, depth)
      SELECT pa.ancestor_id,
             cd.descendant_id,
             CASE WHEN cd.d = 0 THEN 1 ELSE cd.d + 1 END
      FROM parent_ancestors pa
      CROSS JOIN child_descendants cd
      ON CONFLICT (ancestor_id, descendant_id) DO UPDATE
      SET depth = LEAST(horse_tree.depth, EXCLUDED.depth)
    `, [childId]);

    await client.query('COMMIT');
    console.log('✅ Lineage updated successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Update failed:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});