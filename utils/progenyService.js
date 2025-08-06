require('dotenv').config();
const axios = require('axios');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const PFL_API_KEY = process.env.PFL_API_KEY;
const ACCESS_TOKEN = process.env.PFL_ACCESS_TOKEN;
const DB_URL = process.env.DATABASE_URL;
const DELAY_MS = parseInt(process.env.PFL_API_DELAY_MS || '1000', 10);
const MAX_RETRIES = parseInt(process.env.PFL_API_MAX_RETRIES || '5', 10);

const PFL_HORSE_DETAIL_API_URL = 'https://api.photofinish.live/pfl-pro/horse-api/{horse_id}';

// Load Major Races JSON
const majorsPath = path.join(__dirname, '../../data/major_races.json');
const majorRaces = fs.existsSync(majorsPath)
  ? JSON.parse(fs.readFileSync(majorsPath, 'utf8'))
  : [];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, horseIdForLog, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`API Call: Fetching data from ${url} for horse ${horseIdForLog}, attempt ${attempt}`);
      const response = await axios.get(url, {
        headers: { 'x-api-key': PFL_API_KEY, 'Authorization': `Bearer ${ACCESS_TOKEN}` },
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      console.warn(`API Warn: Attempt ${attempt} failed for ${url} (horse ${horseIdForLog}): ${error.message}`);
      if (attempt < retries) {
        const backoff = DELAY_MS * (2 ** (attempt - 1));
        console.log(`API Retry: Retrying in ${backoff} ms...`);
        await sleep(backoff);
      } else {
        console.error(`API Error: All ${retries} retries failed for ${url} (horse ${horseIdForLog}).`);
        return null;
      }
    }
  }
}

/**
 * Analyze major race performance for a given horse.
 * @param {object} horse - Horse raw data.
 * @returns {string[]} - Array of formatted major race results.
 */
function analyzeMajorRaces(horse) {
  if (!horse?.history?.raceSummaries) return [];

  const majorsStats = {};

  for (const race of horse.history.raceSummaries) {
    if (!race.raceName) continue;

    const matchedMajor = majorRaces.find(
      m => m.name.toLowerCase() === race.raceName.toLowerCase()
    );
    if (!matchedMajor) continue;

    if (!majorsStats[matchedMajor.name]) {
      majorsStats[matchedMajor.name] = { wins: 0, podiums: 0 };
    }

    if (race.finishPosition === 1) majorsStats[matchedMajor.name].wins++;
    if (race.finishPosition && race.finishPosition <= 3) majorsStats[matchedMajor.name].podiums++;
  }

  return Object.entries(majorsStats).map(([name, stats]) =>
    `${name} (${stats.wins} win${stats.wins !== 1 ? 's' : ''}, ${stats.podiums} podium${stats.podiums !== 1 ? 's' : ''})`
  );
}

async function getHorseDetails(horseId, dbClient) {
  let rawData;

  // 1. Try 'horses' table
  try {
    const dbResultHorses = await dbClient.query("SELECT raw_data FROM horses WHERE id = $1", [horseId]);
    if (dbResultHorses.rows.length > 0 && dbResultHorses.rows[0].raw_data) {
      rawData = dbResultHorses.rows[0].raw_data;
      console.log(`DB Hit: Found horse ${horseId} in 'horses' table.`);
    }
  } catch (dbError) {
    console.error(`DB Query Error (horses): ${dbError.message}`);
  }

  // 2. Try 'ancestors' table
  if (!rawData) {
    try {
      const dbResultAncestors = await dbClient.query("SELECT raw_data FROM ancestors WHERE id = $1", [horseId]);
      if (dbResultAncestors.rows.length > 0 && dbResultAncestors.rows[0].raw_data) {
        rawData = dbResultAncestors.rows[0].raw_data;
        console.log(`DB Hit: Found horse ${horseId} in 'ancestors' table.`);
      }
    } catch (dbError) {
      console.error(`DB Query Error (ancestors): ${dbError.message}`);
    }
  }

  // 3. Fetch from API if not found
  if (!rawData) {
    console.log(`DB Miss: Fetching horse ${horseId} from API.`);
    const detailUrl = PFL_HORSE_DETAIL_API_URL.replace('{horse_id}', horseId);
    const apiHorseData = await fetchWithRetry(detailUrl, horseId);
    await sleep(DELAY_MS);

    if (apiHorseData && apiHorseData.horse) {
      rawData = apiHorseData.horse;
      console.log(`API Hit: Horse ${horseId} fetched.`);

      // Cache in ancestors
      if (rawData.id) {
        try {
          const query = `
            INSERT INTO ancestors (id, raw_data, fetched)
            VALUES ($1, $2, NOW())
            ON CONFLICT (id) DO UPDATE SET
              raw_data = EXCLUDED.raw_data,
              fetched = NOW();
          `;
          await dbClient.query(query, [rawData.id, rawData]);
          console.log(`DB Cache: Cached horse ${rawData.id} from API.`);
        } catch (dbError) {
          console.error(`DB Cache Error: ${dbError.message}`);
        }
      }
    } else {
      console.log(`API Miss: Horse ${horseId} could not be fetched.`);
      return null;
    }
  }
  return rawData && rawData.id ? rawData : null;
}

async function getProgenyRecursive(
  parentHorseId,
  currentGeneration,
  maxGenerations,
  dbClient,
  allProgenyList,
  visitedHorseIds
) {
  if (currentGeneration > maxGenerations || visitedHorseIds.has(parentHorseId)) {
    return;
  }
  visitedHorseIds.add(parentHorseId);

  console.log(`Progeny Search: Gen ${currentGeneration}, Parent ID: ${parentHorseId}`);

  const parentDetails = await getHorseDetails(parentHorseId, dbClient);
  if (!parentDetails) {
    console.log(`Progeny Search: Details missing for parent ${parentHorseId}.`);
    return;
  }

  const childCandidates = new Map();

  // Determine query conditions
  let sireCondition = `raw_data->>'sireId' = $1`;
  let damCondition = `raw_data->>'damId' = $1`;
  let queryConditions = [];

  if (parentDetails.gender === 0) {
    queryConditions.push(sireCondition);
  } else if (parentDetails.gender === 1) {
    queryConditions.push(damCondition);
  } else {
    queryConditions.push(sireCondition, damCondition);
  }

  const dbQueryString = queryConditions.join(' OR ');

  // Search in horses
  try {
    const horsesResult = await dbClient.query(`SELECT id, raw_data FROM horses WHERE ${dbQueryString}`, [parentDetails.id]);
    for (const row of horsesResult.rows) {
      if (row.id && !childCandidates.has(row.id)) childCandidates.set(row.id, row.raw_data);
    }
  } catch (e) {
    console.error(`DB Query Error (horses): ${e.message}`);
  }

  // Search in ancestors
  try {
    const ancestorsResult = await dbClient.query(`SELECT id, raw_data FROM ancestors WHERE ${dbQueryString}`, [parentDetails.id]);
    for (const row of ancestorsResult.rows) {
      if (row.id && !childCandidates.has(row.id)) childCandidates.set(row.id, row.raw_data);
    }
  } catch (e) {
    console.error(`DB Query Error (ancestors): ${e.message}`);
  }

  console.log(`Progeny Search: Found ${childCandidates.size} children for parent ${parentHorseId}.`);

  for (const [childId, knownRawData] of childCandidates) {
    if (visitedHorseIds.has(childId)) continue;

    let childDetails = knownRawData;

    if (!childDetails || !childDetails.history?.raceStats?.allTime?.all) {
      const fetchedChildDetails = await getHorseDetails(childId, dbClient);
      if (fetchedChildDetails) {
        childDetails = fetchedChildDetails;
      } else {
        console.log(`Progeny Search: Missing details for child ${childId}.`);
        continue;
      }
    }

    if (childDetails && childDetails.id) {
      const stats = childDetails.history?.raceStats?.allTime?.all;
      const podiumFinishes = (stats?.wins || 0) + (stats?.places || 0) + (stats?.shows || 0);
      const totalWins = stats?.wins || 0;

      const majors = analyzeMajorRaces(childDetails);

      allProgenyList.push({
        id: childDetails.id,
        name: childDetails.name || 'N/A',
        podium_finishes: podiumFinishes,
        total_wins: totalWins,
        majors: majors,
        generation: currentGeneration,
        pfl_url: `https://photofinish.live/horses/${childDetails.id}`,
        sireId: childDetails.sireId,
        damId: childDetails.damId,
        gender: childDetails.gender
      });

      await getProgenyRecursive(childId, currentGeneration + 1, maxGenerations, dbClient, allProgenyList, visitedHorseIds);
    }
  }
}

async function fetchProgenyReport(initialHorseId, maxGenerations) {
  const client = new Client({ connectionString: DB_URL });
  try {
    await client.connect();
    console.log('DB Connect: Connected to PostgreSQL for progeny report.');
  } catch (err) {
    console.error('DB Connect Error:', err);
    throw new Error('Database connection failed.');
  }

  const allProgenyList = [];
  const visitedHorseIds = new Set();

  const initialHorseDetails = await getHorseDetails(initialHorseId, client);
  if (!initialHorseDetails) {
    console.log(`Progeny Report: Initial horse ${initialHorseId} not found.`);
    try { await client.end(); } catch(e) { console.error("DB Disconnect Error:", e); }
    return { progenyList: [], initialHorseName: initialHorseId };
  }
  const initialHorseName = initialHorseDetails.name || initialHorseId;

  await getProgenyRecursive(initialHorseId, 1, maxGenerations, client, allProgenyList, visitedHorseIds);

  // Sort results
  allProgenyList.sort((a, b) => {
    if (b.podium_finishes !== a.podium_finishes) {
      return b.podium_finishes - a.podium_finishes;
    }
    return b.total_wins - a.total_wins;
  });

  // Calculate direct progeny win percentage
  const directProgeny = allProgenyList.filter(p => p.generation === 1);
  const totalDirectProgeny = directProgeny.length;
  let directProgenyWinPercentage = 0;
  if (totalDirectProgeny > 0) {
    const directWinners = directProgeny.filter(p => p.total_wins > 0).length;
    directProgenyWinPercentage = (directWinners / totalDirectProgeny) * 100;
  }

  try {
    await client.end();
    console.log('DB Disconnect: PostgreSQL connection closed.');
  } catch (err) {
    console.error('DB Disconnect Error:', err);
  }

  return {
    progenyList: allProgenyList,
    initialHorseName,
    directProgenyWinPercentage
  };
}

module.exports = { fetchProgenyReport };