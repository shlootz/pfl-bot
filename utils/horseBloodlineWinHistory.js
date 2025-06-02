// utils/horseBloodlineWinHistory.js

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
      console.warn(`⏳ Retry ${i + 1} failed for gentleFetchHorse. Waiting ${backoff}ms: ${err.message}`);
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
    if (!res.ok) throw new Error(`API fetch failed for ${id}`);
    const json = await res.json();
    return json?.horse;
  });
}

async function fetchHorseAndCache(client, horseId) {
  const sources = ['horses', 'mares', 'marketplace_mares', 'ancestors'];
  for (const table of sources) {
    const res = await client.query(`SELECT * FROM ${table} WHERE id = $1`, [horseId]);
    if (res.rows.length > 0) return res.rows[0].raw_data;
  }

  // Not found, fetch and insert
  const horse = await gentleFetchHorse(horseId);
  if (horse?.id) {
    await client.query(
      'INSERT INTO ancestors (id, raw_data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
      [horse.id, horse]
    );
    return horse;
  }

  throw new Error(`Horse ${horseId} not found in DB or API.`);
}

function hasPodiumInRace(horse, raceNames) {
  const summaries = horse?.history?.raceSummaries || [];
  return raceNames.filter((race) =>
    summaries.some((summary) =>
      summary.raceName === race && parseInt(summary.finishPosition || 99) <= 3
    )
  );
}

async function recursiveSearch(client, horseId, raceNames, maxDepth, currentDepth = 1, lineage = {}) {
  const horse = await fetchHorseAndCache(client, horseId);
  const trackWins = hasPodiumInRace(horse, raceNames);

  if (trackWins.length > 0) {
    lineage[`gen_${currentDepth}`] = lineage[`gen_${currentDepth}`] || [];
    lineage[`gen_${currentDepth}`].push({ id: horse.id, name: horse.name, races: trackWins });
  }

  if (currentDepth >= maxDepth || !Array.isArray(horse.simpleFamilyTree)) return lineage;

  for (const ancestorId of horse.simpleFamilyTree) {
    try {
      await recursiveSearch(client, ancestorId, raceNames, maxDepth, currentDepth + 1, lineage);
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
    const selfPodiumRaces = hasPodiumInRace(horse, raceNames);
    const ancestry = await recursiveSearch(client, horseId, raceNames, generations);

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