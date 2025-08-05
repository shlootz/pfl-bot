require('dotenv').config();
const axios = require('axios');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const BASE_URL = process.env.HOST?.replace(/\/$/, ''); // remove trailing slash if any

const DB_URL = process.env.DATABASE_URL;
const API_KEY = process.env.PFL_API_KEY;
const ACCESS_TOKEN = process.env.PFL_ACCESS_TOKEN;
const DELAY_MS = 1000;
const MAX_RETRIES = 5;
const LOG_FILE = `logs/fetchProgenyFilter_log_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;

fs.mkdirSync('logs', { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function log(message) {
  console.log(message);
  logStream.write(message + '\n');
}

function hasEliteTraits(h) {
  const heart = h?.heart || '';
  const stamina = h?.stamina || '';
  const speed = h?.speed || '';
  const temper = h?.temper || '';
  const start = h?.start || '';

  return (
    [heart, stamina].every((v) => v && v.startsWith('SS')) &&
    speed.startsWith('S+') &&
    ([temper, start].some((v) => v && v.startsWith('S+')))
  );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchHorseProfileWithRetry(id, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      log(`📡 Fetching child horse ${id}, attempt ${attempt}`);
      const res = await axios.get(
        `https://api.photofinish.live/pfl-pro/horse-api/${id}`,
        { headers: { 'x-api-key': API_KEY, 'Authorization': `Bearer ${ACCESS_TOKEN}` } }
      );
      return res.data?.horse;
    } catch (err) {
      log(`⚠️ Attempt ${attempt} failed for horse ${id}: ${err.message}`);
      if (attempt < retries) {
        const backoff = DELAY_MS * 2 ** (attempt - 1);
        log(`⏳ Retrying in ${backoff} ms...`);
        await sleep(backoff);
      } else {
        log(`❌ All ${retries} retries failed for horse ${id}`);
        return null;
      }
    }
  }
}

async function run() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  log('🚀 Connected to PostgreSQL');

  const knownKDWinnerIds = fs.readFileSync('data/kd_winners.txt', 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line);

  const { rows: pairs } = await client.query(
    `SELECT * FROM inbreeding_clean WHERE stud_id NOT IN (
      SELECT stud_id FROM elite_matches
    )`
  );

  let kept = 0;
  let checked = 0;

  for (const { mare_id, stud_id } of pairs) {
    checked++;
    if (checked % 500 === 0) log(`🔎 Checked ${checked} pairs...`);

    const { rows } = await client.query(`SELECT raw_data FROM horses WHERE id = $1`, [stud_id]);
    const stud = rows[0]?.raw_data;
    if (!stud?.id) continue;

    // Skip if already in known winners list
    const studIdMatch = knownKDWinnerIds.includes(stud.id);

    const { rows: children } = await client.query(
      `SELECT id FROM horses WHERE raw_data->>'sireId' = $1`,
      [stud.id]
    );

    for (let i = 0; i < children.length; i++) {
      const childId = children[i].id;
      process.stdout.write(`\r🔬 Checking child ${i + 1}/${children.length}: ${childId}       `);

      const childData = await fetchHorseProfileWithRetry(childId);
      await sleep(DELAY_MS);

      if (!childData) continue;

      const traits = childData?.racing || {};
      if (hasEliteTraits(traits)) {
        kept++;
        log(`🧬 Another Elite progeny matches stored: ${kept}`);
        await client.query(
          `INSERT INTO elite_matches (mare_id, stud_id, reason)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [mare_id, stud_id, studIdMatch ? 'ELITE_PROGENY_KNOWN' : 'ELITE_PROGENY']
        );
        break;
      }
    }
  }

  log(`✅ Done.`);
  log(`🧬 Elite progeny matches stored: ${kept}`);

  await client.end();
  log('🔒 PostgreSQL connection closed');
  logStream.end();
}

run();
