require('dotenv').config();
const { Client } = require('pg');
const fetch = require('node-fetch');
const { fetchMareWithRetries } = require('../scripts/fetchMaresFromAPI');
const insertMareToDb = require('../server/helpers/insertMareToDb');

const DB_URL = process.env.DATABASE_URL;
const PFL_API_KEY = process.env.PFL_API_KEY;
const PFL_API_URL = 'https://api.photofinish.live/pfl-pro/horse-api';

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function retryWithBackoff(fn, retries = 5, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      const backoff = delayMs * Math.pow(2, i);
      console.warn(`⏳ Retry ${i + 1} failed. Waiting ${backoff}ms: ${err.message}`);
      await delay(backoff);
    }
  }
  throw new Error('Exceeded maximum retries');
}

async function gentleFetchHorse(id) {
  return retryWithBackoff(async () => {
    const res = await fetch(`${PFL_API_URL}/${id}`, {
      headers: { 'x-api-key': PFL_API_KEY },
    });
    if (!res.ok) throw new Error(`API fetch failed for ${id}: ${res.status} ${res.statusText}`);
    const json = await res.json();
    return json?.horse;
  });
}

async function fetchHorseAndCache(client, horseId) {
  if (!/^[a-zA-Z0-9\-]{10,}$/.test(horseId)) {
    console.warn(`⚠️ Skipping symbolic or invalid horse ID: ${horseId}`);
    return null;
  }

  const sources = ['horses', 'mares', 'marketplace_mares', 'ancestors'];
    for (const table of sources) {
      try {
        const res = await client.query(`SELECT * FROM ${table} WHERE id::text = $1`, [horseId]);
        if (res.rows.length > 0) return res.rows[0].raw_data;
      } catch (err) {
        console.warn(`Skipping table ${table} for ID ${horseId}: ${err.message}`);
      }
    }

  try {
    const horse = await gentleFetchHorse(horseId);
    if (horse?.id) {
      await client.query(
        'INSERT INTO ancestors (id, raw_data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
        [horse.id, horse]
      );
      return horse;
    }
  } catch (err) {
    console.warn(`❌ Failed to fetch and cache horse ${horseId}: ${err.message}`);
    return null;
  }

  return null;
}

function hasPodiumInRace(horse, raceNames) {
  const summaries = horse?.history?.raceSummaries || [];
  return raceNames.filter((race) =>
    summaries.some((summary) =>
      summary.raceName === race && parseInt(summary.finishPosition || 99) <= 3
    )
  );
}

async function recursiveSearch(client, horseId, raceNames, maxDepth, currentDepth = 1, lineage = {}, visited = new Map(), rootId = horseId) {
  if (visited.has(horseId) && visited.get(horseId) <= currentDepth) return lineage;
  visited.set(horseId, currentDepth);

  const horse = await fetchHorseAndCache(client, horseId);
  if (!horse) {
    console.warn(`❌ Skipping horse ${horseId}: null returned.`);
    return lineage;
  }

  if (horse.id !== rootId) {
    const trackWins = hasPodiumInRace(horse, raceNames);
    if (trackWins.length > 0) {
      const genKey = `gen_${currentDepth}`; // ✅ Correct: parents = gen_1
      lineage[genKey] = lineage[genKey] || [];

      const alreadyLogged = lineage[genKey].some(h => h.id === horse.id);
      if (!alreadyLogged) {
        for (const key of Object.keys(lineage)) {
          if (key !== genKey) {
            lineage[key] = lineage[key].filter(h => h.id !== horse.id);
          }
        }

        lineage[genKey].push({ id: horse.id, name: horse.name, races: trackWins });
      }
    }
  }

  if (currentDepth >= maxDepth || !Array.isArray(horse.simpleFamilyTree)) return lineage;

  for (const ancestorId of horse.simpleFamilyTree) {
    try {
      await recursiveSearch(client, ancestorId, raceNames, maxDepth, currentDepth + 1, lineage, visited, rootId);
    } catch (err) {
      console.warn(`Skipping ancestor ${ancestorId}: ${err.message}`);
    }
  }

  return lineage;
}

async function horseBloodlineWinHistory(horseId, raceNames = ['Kentucky Derby'], generations = 3) {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    const horse = await fetchHorseAndCache(client, horseId);
    if (!horse) throw new Error(`Unable to fetch horse ${horseId} from DB or API.`);

    const selfPodiumRaces = hasPodiumInRace(horse, raceNames);
    const lineage = {};

    const ancestry = await recursiveSearch(client, horseId, raceNames, generations, 0, lineage);

    const summary = {
      horseId,
      horseName: horse.name,
      isWinner: selfPodiumRaces.length > 0,
      selfPodiumRaces,
      hasWinningBloodline: Object.keys(ancestry).some(k => ancestry[k]?.some(h => h.id !== horseId)),
      ancestry
    };

    return summary;
  } finally {
    await client.end();
  }
}

module.exports = { horseBloodlineWinHistory };