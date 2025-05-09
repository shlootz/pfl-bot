require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');

const DB_URL = process.env.DATABASE_URL;
const TOP_N = 10;

async function run() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  const result = await client.query(`
    WITH scored_matches_raw AS (
      SELECT
        em.mare_id,
        em.stud_id,
        em.reason,
        s.raw_data->>'id' AS stud_id_actual,
        s.raw_data->>'name' AS stud_name,
        m.raw_data->>'name' AS mare_name,
        (
          CASE WHEN em.reason = 'KD_WINNER' THEN 3 ELSE 0 END +
          CASE WHEN em.reason = 'ELITE_PROGENY' THEN 2 ELSE 0 END +
          CASE WHEN em.reason = 'ELITE_PROGENY_KNOWN' THEN 2 ELSE 0 END +
          CASE WHEN (s.raw_data->'racing'->>'heart') LIKE 'SS%' THEN 3 ELSE 0 END +
          CASE WHEN (s.raw_data->'racing'->>'stamina') LIKE 'SS%' THEN 3 ELSE 0 END +
          CASE WHEN (s.raw_data->'racing'->>'speed') LIKE 'S+%' THEN 2 ELSE 0 END +
          CASE WHEN (s.raw_data->'racing'->>'temper') LIKE 'S+%' THEN 1 ELSE 0 END +
          CASE WHEN (s.raw_data->'racing'->>'start') LIKE 'S+%' THEN 1 ELSE 0 END
        ) AS score
      FROM elite_matches em
      JOIN horses s ON em.stud_id = s.id
      JOIN mares m ON em.mare_id = m.id
      WHERE em.mare_id IS NOT NULL
    ),
    deduped_matches AS (
      SELECT DISTINCT ON (mare_id, stud_id)
        mare_id, stud_id, reason, stud_name, mare_name, score
      FROM scored_matches_raw
      ORDER BY mare_id, stud_id, score DESC
    ),
    ranked_matches AS (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY mare_id ORDER BY score DESC) AS rank
      FROM deduped_matches
    )
    SELECT * FROM ranked_matches WHERE rank <= $1 ORDER BY mare_id, rank;
  `, [TOP_N]);

  const grouped = {};
  for (const row of result.rows) {
    if (!grouped[row.mare_id]) {
      grouped[row.mare_id] = {
        mare_name: row.mare_name,
        mare_link: `https://photofinish.live/horses/${row.mare_id}`,
        matches: []
      };
    }
    grouped[row.mare_id].matches.push({
      rank: row.rank,
      score: row.score,
      reason: row.reason,
      stud_name: row.stud_name,
      stud_id: row.stud_id,
      stud_link: `https://photofinish.live/horses/${row.stud_id}`
    });
  }

  fs.writeFileSync('top_stud_matches.json', JSON.stringify(grouped, null, 2));
  console.log(`✅ Saved top ${TOP_N} matches per mare to top_stud_matches.json`);

  await client.end();
}

run();