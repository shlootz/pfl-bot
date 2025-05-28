require('dotenv').config();
const axios = require('axios');
const { Client } = require('pg');

const PFL_API_KEY = process.env.PFL_API_KEY;
const DB_URL = process.env.DATABASE_URL;
const DELAY_MS = parseInt(process.env.PFL_API_DELAY_MS || '1000', 10); // Delay between API calls
const MAX_RETRIES = parseInt(process.env.PFL_API_MAX_RETRIES || '5', 10);

const PFL_HORSE_DETAIL_API_URL = 'https://api.photofinish.live/pfl-pro/horse-api/{horse_id}';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, horseIdForLog, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`API Call: Fetching data from ${url} for horse ${horseIdForLog}, attempt ${attempt}`);
      const response = await axios.get(url, {
        headers: { 'x-api-key': PFL_API_KEY },
        timeout: 10000 // 10 seconds timeout
      });
      return response.data;
    } catch (error) {
      console.warn(`API Warn: Attempt ${attempt} failed for ${url} (horse ${horseIdForLog}): ${error.message}`);
      if (attempt < retries) {
        const backoff = DELAY_MS * (2 ** (attempt - 1)); // Exponential backoff
        console.log(`API Retry: Retrying in ${backoff} ms...`);
        await sleep(backoff);
      } else {
        console.error(`API Error: All ${retries} retries failed for ${url} (horse ${horseIdForLog}).`);
        return null; // Indicate failure after all retries
      }
    }
  }
}

async function getHorseDetails(horseId, dbClient) {
  let rawData;

  // 1. Try 'horses' table
  try {
    const dbResultHorses = await dbClient.query("SELECT raw_data FROM horses WHERE id = $1", [horseId]);
    if (dbResultHorses.rows.length > 0 && dbResultHorses.rows[0].raw_data) {
      rawData = dbResultHorses.rows[0].raw_data;
      console.log(`DB Hit (getHorseDetails): Found horse ${horseId} in 'horses' table.`);
    }
  } catch (dbError) {
    console.error(`DB Query Error (getHorseDetails): Failed to query 'horses' for ${horseId}: ${dbError.message}`);
  }

  // 2. Try 'ancestors' table if not found in 'horses'
  if (!rawData) {
    try {
      const dbResultAncestors = await dbClient.query("SELECT raw_data FROM ancestors WHERE id = $1", [horseId]);
      if (dbResultAncestors.rows.length > 0 && dbResultAncestors.rows[0].raw_data) {
        rawData = dbResultAncestors.rows[0].raw_data;
        console.log(`DB Hit (getHorseDetails): Found horse ${horseId} in 'ancestors' table.`);
      }
    } catch (dbError) {
      console.error(`DB Query Error (getHorseDetails): Failed to query 'ancestors' for ${horseId}: ${dbError.message}`);
    }
  }

  // 3. If not found in DB, fetch from API
  if (!rawData) {
    console.log(`DB Miss (getHorseDetails): Horse ${horseId} not in local tables. Fetching from API.`);
    const detailUrl = PFL_HORSE_DETAIL_API_URL.replace('{horse_id}', horseId);
    const apiHorseData = await fetchWithRetry(detailUrl, horseId); // This returns { horse: ... } or null
    await sleep(DELAY_MS);

    if (apiHorseData && apiHorseData.horse) {
      rawData = apiHorseData.horse;
      console.log(`API Hit (getHorseDetails): Fetched horse ${horseId} from API.`);

      // 4. Cache in 'ancestors' table if fetched from API
      if (rawData.id) { // Ensure we have an ID to cache
        try {
          const query = `
            INSERT INTO ancestors (id, raw_data, fetched)
            VALUES ($1, $2, NOW())
            ON CONFLICT (id) DO UPDATE SET
              raw_data = EXCLUDED.raw_data,
              fetched = NOW();
          `;
          await dbClient.query(query, [rawData.id, rawData]);
          console.log(`DB Cache (getHorseDetails): Cached/Updated horse ${rawData.id} in ancestors from API data.`);
        } catch (dbError) {
          console.error(`DB Cache Error (getHorseDetails): Failed to cache ${rawData.id}: ${dbError.message}`);
        }
      }
    } else {
      console.log(`API Miss (getHorseDetails): Failed to fetch horse ${horseId} from API.`);
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
    console.log(`Progeny Search: Could not retrieve details for parent ${parentHorseId}. Skipping.`);
    return;
  }

  const childCandidates = new Map(); // Stores { id: raw_data_from_db_if_any }

  // Determine query conditions based on parent gender
  let sireCondition = `raw_data->>'sireId' = $1`;
  let damCondition = `raw_data->>'damId' = $1`;
  let queryConditions = [];

  if (parentDetails.gender === 0) { // Male parent (Sire)
    queryConditions.push(sireCondition);
  } else if (parentDetails.gender === 1) { // Female parent (Dam)
    queryConditions.push(damCondition);
  } else {
    console.warn(`Progeny Search: Unknown gender for parent ${parentHorseId}. Will search both sire and dam fields.`);
    queryConditions.push(sireCondition, damCondition); // Search both if gender unknown
  }
  
  if (queryConditions.length === 0) { // Should not happen if gender is 0 or 1
      console.error(`Progeny Search: No query conditions for parent ${parentHorseId}, gender: ${parentDetails.gender}`);
      return;
  }
  const dbQueryString = queryConditions.join(' OR ');

  // Query 'horses' table
  try {
    const horsesResult = await dbClient.query(`SELECT id, raw_data FROM horses WHERE ${dbQueryString}`, [parentDetails.id]);
    for (const row of horsesResult.rows) {
      if (row.id && !childCandidates.has(row.id)) {
        childCandidates.set(row.id, row.raw_data);
      }
    }
  } catch (e) {
    console.error(`DB Query Error: Failed to query 'horses' for children of ${parentHorseId}: ${e.message}`);
  }

  // Query 'ancestors' table
  try {
    const ancestorsResult = await dbClient.query(`SELECT id, raw_data FROM ancestors WHERE ${dbQueryString}`, [parentDetails.id]);
    for (const row of ancestorsResult.rows) {
      if (row.id && !childCandidates.has(row.id)) { // Add if not already found from 'horses'
        childCandidates.set(row.id, row.raw_data);
      }
    }
  } catch (e) {
    console.error(`DB Query Error: Failed to query 'ancestors' for children of ${parentHorseId}: ${e.message}`);
  }

  console.log(`Progeny Search: Found ${childCandidates.size} unique potential children for parent ${parentHorseId} from DB.`);

  for (const [childId, knownRawData] of childCandidates) {
    if (visitedHorseIds.has(childId)) continue;

    let childDetails = knownRawData;

    // If DB data is missing crucial stats, or if knownRawData is null/undefined, fetch full details
    if (!childDetails || !childDetails.history?.raceStats?.allTime?.all) {
      const fetchedChildDetails = await getHorseDetails(childId, dbClient);
      if (fetchedChildDetails) {
        childDetails = fetchedChildDetails;
      } else {
        console.log(`Progeny Search: Failed to get details for child ${childId}. Skipping.`);
        continue;
      }
    }

    // Ensure childDetails is valid and has an ID after potential fetching
    if (childDetails && childDetails.id) {
      const stats = childDetails.history?.raceStats?.allTime?.all;
      const podiumFinishes = (stats?.wins || 0) + (stats?.places || 0) + (stats?.shows || 0);
      const totalWins = stats?.wins || 0;

      allProgenyList.push({
        id: childDetails.id,
        name: childDetails.name || 'N/A',
        podium_finishes: podiumFinishes,
        total_wins: totalWins,
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
    console.log('DB Connect: Successfully connected to PostgreSQL for progeny report.');
  } catch (err) {
    console.error('DB Connect Error: Failed to connect to PostgreSQL:', err);
    throw new Error('Database connection failed.'); // Propagate error
  }

  const allProgenyList = [];
  const visitedHorseIds = new Set();

  const initialHorseDetails = await getHorseDetails(initialHorseId, client);
  if (!initialHorseDetails) {
    console.log(`Progeny Report: Initial horse ${initialHorseId} not found or details could not be fetched.`);
    try { await client.end(); } catch(e) { console.error("DB Disconnect Error:", e); }
    return { progenyList: [], initialHorseName: initialHorseId }; // Return ID if name not found
  }
  // We have initial horse details, now start recursion
  const initialHorseName = initialHorseDetails.name || initialHorseId;

  await getProgenyRecursive(
    initialHorseId,
    1, // Start at generation 1
    maxGenerations,
    client,
    allProgenyList,
    visitedHorseIds
  );

  // Sort results: primary by podium_finishes (desc), secondary by total_wins (desc)
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