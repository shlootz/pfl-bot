// /utils/lineageQueries.js
require('dotenv').config();

const UP_DEFAULT = parseInt(process.env.CACHE_ANCESTOR_DEPTH || '3', 10);
const DOWN_DEFAULT = parseInt(process.env.CACHE_PROGENY_DEPTH || '3', 10);

/* -------------------------------- Utilities ------------------------------- */

async function refreshLineageCache(db, horseId, upDepth = UP_DEFAULT, downDepth = DOWN_DEFAULT) {
  const ancestors = await db.query(`
    SELECT ht.ancestor_id AS id,
           COALESCE(h.raw_data->>'name', a.raw_data->>'name', 'N/A') AS name,
           COALESCE((h.raw_data->>'gender')::int, (a.raw_data->>'gender')::int) AS gender,
           ht.depth
    FROM horse_tree ht
    LEFT JOIN horses   h ON h.id::text = ht.ancestor_id
    LEFT JOIN ancestors a ON a.id::text = ht.ancestor_id
    WHERE ht.descendant_id = $1 AND ht.depth BETWEEN 1 AND $2
    ORDER BY ht.depth, name
  `, [horseId, upDepth]);

  const progeny = await db.query(`
    SELECT ht.descendant_id AS id,
           COALESCE(h.raw_data->>'name', a.raw_data->>'name', 'N/A') AS name,
           COALESCE((h.raw_data->>'gender')::int, (a.raw_data->>'gender')::int) AS gender,
           ht.depth
    FROM horse_tree ht
    LEFT JOIN horses   h ON h.id::text = ht.descendant_id
    LEFT JOIN ancestors a ON a.id::text = ht.descendant_id
    WHERE ht.ancestor_id = $1 AND ht.depth BETWEEN 1 AND $2
    ORDER BY ht.depth, name
  `, [horseId, downDepth]);

  await db.query(`
    INSERT INTO horse_lineage_cache (horse_id, ancestors_json, progeny_json, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (horse_id)
    DO UPDATE SET
      ancestors_json = EXCLUDED.ancestors_json,
      progeny_json   = EXCLUDED.progeny_json,
      updated_at     = NOW()
  `, [horseId, JSON.stringify(ancestors.rows), JSON.stringify(progeny.rows)]);

  return { ancestors: ancestors.rows, progeny: progeny.rows };
}

async function readCache(db, horseId) {
  const rs = await db.query(
    `SELECT ancestors_json, progeny_json, updated_at FROM horse_lineage_cache WHERE horse_id = $1`,
    [horseId]
  );
  if (rs.rowCount === 0) return null;
  const row = rs.rows[0];
  return {
    ancestors: Array.isArray(row.ancestors_json) ? row.ancestors_json : [],
    progeny: Array.isArray(row.progeny_json) ? row.progeny_json : [],
    updated_at: row.updated_at
  };
}

/* -------------------------- Public: Ancestors/Progeny --------------------- */

async function getAncestors(db, horseId, opts = {}) {
  const { maxDepth = UP_DEFAULT, useCache = true, refreshIfMissing = false } = opts;

  if (useCache) {
    const cached = await readCache(db, horseId);
    if (cached && cached.ancestors.length) {
      return cached.ancestors.filter(a => a.depth >= 1 && a.depth <= maxDepth);
    }
    if (refreshIfMissing) {
      const { ancestors } = await refreshLineageCache(db, horseId, maxDepth, DOWN_DEFAULT);
      return ancestors;
    }
  }

  const rs = await db.query(`
    SELECT ht.ancestor_id AS id,
           COALESCE(h.raw_data->>'name', a.raw_data->>'name', 'N/A') AS name,
           COALESCE((h.raw_data->>'gender')::int, (a.raw_data->>'gender')::int) AS gender,
           ht.depth
    FROM horse_tree ht
    LEFT JOIN horses   h ON h.id::text = ht.ancestor_id
    LEFT JOIN ancestors a ON a.id::text = ht.ancestor_id
    WHERE ht.descendant_id = $1 AND ht.depth BETWEEN 1 AND $2
    ORDER BY ht.depth, name
  `, [horseId, maxDepth]);
  return rs.rows;
}

async function getProgeny(db, horseId, opts = {}) {
  const { maxDepth = DOWN_DEFAULT, useCache = true, refreshIfMissing = false } = opts;

  if (useCache) {
    const cached = await readCache(db, horseId);
    if (cached && cached.progeny.length) {
      return cached.progeny.filter(p => p.depth >= 1 && p.depth <= maxDepth);
    }
    if (refreshIfMissing) {
      const { progeny } = await refreshLineageCache(db, horseId, UP_DEFAULT, maxDepth);
      return progeny;
    }
  }

  const rs = await db.query(`
    SELECT ht.descendant_id AS id,
           COALESCE(h.raw_data->>'name', a.raw_data->>'name', 'N/A') AS name,
           COALESCE((h.raw_data->>'gender')::int, (a.raw_data->>'gender')::int) AS gender,
           ht.depth
    FROM horse_tree ht
    LEFT JOIN horses   h ON h.id::text = ht.descendant_id
    LEFT JOIN ancestors a ON a.id::text = ht.descendant_id
    WHERE ht.ancestor_id = $1 AND ht.depth BETWEEN 1 AND $2
    ORDER BY ht.depth, name
  `, [horseId, maxDepth]);
  return rs.rows;
}

/* --------------------------- Direct relations only ------------------------ */

async function getDirectParents(db, horseId) {
  const rs = await db.query(`
    SELECT parent_id AS id,
           parent_type,
           COALESCE(h.raw_data->>'name', a.raw_data->>'name', 'N/A') AS name,
           COALESCE((h.raw_data->>'gender')::int, (a.raw_data->>'gender')::int) AS gender
    FROM horse_parent p
    LEFT JOIN horses   h ON h.id::text = p.parent_id
    LEFT JOIN ancestors a ON a.id::text = p.parent_id
    WHERE p.child_id = $1
    ORDER BY parent_type
  `, [horseId]);
  return rs.rows;
}

async function getDirectChildren(db, horseId) {
  const rs = await db.query(`
    SELECT child_id AS id,
           parent_type,
           COALESCE(h.raw_data->>'name', a.raw_data->>'name', 'N/A') AS name,
           COALESCE((h.raw_data->>'gender')::int, (a.raw_data->>'gender')::int) AS gender
    FROM horse_parent p
    LEFT JOIN horses   h ON h.id::text = p.child_id
    LEFT JOIN ancestors a ON a.id::text = p.child_id
    WHERE p.parent_id = $1
    ORDER BY parent_type, name
  `, [horseId]);
  return rs.rows;
}

/* ------------------------------- Exports ---------------------------------- */

module.exports = {
  getAncestors,
  getProgeny,
  getDirectParents,
  getDirectChildren,
  refreshLineageCache
};