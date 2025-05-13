// scripts/scoreKDTargets.js
require('dotenv').config();
const { Client } = require('pg');
const axios = require('axios');
const fs = require('fs');

const DB_URL = process.env.DATABASE_URL;
const API_KEY = process.env.PFL_API_KEY;
const KD_TRACK = 'Kentucky Derby';
const LOG_FILE = `logs/kd_target_scoring_patch_log_${Date.now()}.log`;

function log(message) {
  console.log(message);
  fs.appendFileSync(LOG_FILE, message + '\n');
}
async function fetchMareIfMissing(client, mareId) {
  const check = await client.query('SELECT 1 FROM mares WHERE id = $1', [mareId]);
  if (check.rowCount > 0) return;

  try {
    const res = await axios.get(`https://api.photofinish.live/pfl-pro/horse-api/${mareId}`, {
      headers: { 'x-api-key': API_KEY },
    });
    const mareData = res.data?.horse;
    if (mareData?.id) {
      await client.query(
        `INSERT INTO mares (id, raw_data)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET raw_data = $2, updated_at = CURRENT_TIMESTAMP`,
        [mareData.id, mareData]
      );
      log(`✅ Fetched and inserted missing mare ${mareData.name || mareData.id}`);
    }
  } catch (err) {
    log(`❌ Failed to fetch mare ${mareId}: ${err.message}`);
  }
}

function getScore(mare, stud, winnerProfiles) {
  let score = 0;
  for (const winner of winnerProfiles) {
    if (stud.heart?.startsWith('SS') || mare.heart?.startsWith('SS')) score += 3;
    if (stud.stamina?.startsWith('SS') || mare.stamina?.startsWith('SS')) score += 3;
    if (stud.speed?.startsWith('S+') || mare.speed?.startsWith('S+')) score += 2;
    if (stud.direction?.value === winner.direction?.value && mare.direction?.value === winner.direction?.value) score += 2;
    if (stud.surface?.value === winner.surface?.value && mare.surface?.value === winner.surface?.value) score += 2;
  }
  return score;
}

async function run() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  log('🚀 Connected to PostgreSQL');

  const kdWinners = await client.query(
    `SELECT raw_data FROM horses
     WHERE raw_data->'history'->'raceSummaries' @> $1`,
    [`[{"raceName": "${KD_TRACK}", "finishPosition": 1}]`]
  );
  const winnerTraits = kdWinners.rows.map(r => r.raw_data?.racing).filter(Boolean);

  const mares = await client.query('SELECT id, raw_data FROM mares');
  const studs = await client.query("SELECT id, raw_data FROM horses WHERE type = 'stud'");
  const inbreeding = await client.query('SELECT mare_id, stud_id FROM inbreeding_clean');
  const inbreedingPairs = new Set(inbreeding.rows.map(r => r.mare_id + '-' + r.stud_id));

  let count = 0;
  for (const mare of mares.rows) {
    const mareId = mare.id;
    const mareName = mare.raw_data?.name || 'Unknown Mare';
    const mareStats = mare.raw_data?.racing;
    if (!mareStats) continue;

    for (const stud of studs.rows) {
      const studId = stud.id;
      const studName = stud.raw_data?.name || 'Unknown Stud';
      const studStats = stud.raw_data?.racing;
      if (!studStats) continue;

      const inbreedingKey = mareId + '-' + studId;
      if (inbreedingPairs.has(inbreedingKey)) continue;

      if (mareStats.direction?.value && studStats.direction?.value && mareStats.direction.value !== studStats.direction.value) {
        continue;
      }

      const score = getScore(mareStats, studStats, winnerTraits);

      if (score >= 5) {
        await client.query(
          `INSERT INTO kd_target_matches (mare_id, mare_name, stud_id, stud_name, score, mare_stats, stud_stats)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (mare_id, stud_id) DO UPDATE SET score = EXCLUDED.score`,
          [mareId, mareName, studId, studName, score, mareStats, studStats]
        );
        count++;
      }
    }
  }

  log(`✅ Done. Inserted ${count} KD-target matches.`);
  await client.end();
  log('🔒 PostgreSQL connection closed');
}

run();