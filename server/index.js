require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Client } = require('pg');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 4000;
const { validate: isUuid } = require('uuid');
const client = new Client({ connectionString: process.env.DATABASE_URL });

const fetchAndCacheAncestors = require('../scripts/fetchAndCacheAncestors');

client.connect()
  .then(() => console.log('🐎 Connected to PostgreSQL'))
  .catch(err => console.error('❌ DB connection error:', err.stack));

app.use(cors());
app.use(express.json());

async function resolveSymbolicId(symbolicId) {
  try {
    const { rows } = await client.query(
      `SELECT id FROM horses WHERE raw_data->>'symbolicId' = $1 LIMIT 1`,
      [symbolicId]
    );
    return rows[0]?.id || null;
  } catch (err) {
    console.error(`❌ Error resolving symbolicId: ${symbolicId}`, err);
    return null;
  }
}

// GET: My Mares
app.get('/api/mares', async (req, res) => {
  console.log('🧪 /api/mares route hit'); // <––– ADD THIS
  try {
    const result = await client.query('SELECT id, raw_data FROM mares');
    const mares = result.rows.map(row => ({
      id: row.id,
      ...row.raw_data
    }));
    res.json(mares);
  } catch (err) {
    console.error('❌ Error fetching mares:', err);
    res.status(500).send('Server error');
  }
});

// GET: All Studs
app.get('/api/studs', async (req, res) => {
  try {
    const result = await client.query("SELECT id, raw_data FROM horses WHERE type = 'stud'");
    const studs = result.rows.map(row => ({
      id: row.id,
      ...row.raw_data
    }));
    res.json(studs);
  } catch (err) {
    console.error('❌ Error fetching studs:', err.message);
    res.status(500).send('Server error');
  }
});

// GET: KD Winners
app.get('/api/kd-winners', async (req, res) => {
  try {
    const result = await client.query(`
      SELECT id, raw_data FROM horses
      WHERE raw_data->'history'->'raceSummaries' @> $1
    `, [`[{"raceName": "Kentucky Derby", "finishPosition": 1}]`]);
    const winners = result.rows.map(row => ({
      id: row.id,
      ...row.raw_data
    }));
    res.json(winners);
  } catch (err) {
    console.error('❌ Error fetching KD winners:', err.message);
    res.status(500).send('Server error');
  }
});

// GET: Elite Studs (based on scoring)
app.get('/api/elite-studs', async (req, res) => {
  try {
    const result = await client.query(`
      SELECT id, raw_data FROM horses
      WHERE type = 'stud'
      AND (
        (raw_data->'racing'->>'heart') LIKE 'SS%' AND
        (raw_data->'racing'->>'stamina') LIKE 'SS%' AND
        (raw_data->'racing'->>'speed') LIKE 'S+%' AND
        (
          (raw_data->'racing'->>'temper') LIKE 'S+%' OR
          (raw_data->'racing'->>'start') LIKE 'S+%'
        )
      )
    `);
    const elite = result.rows.map(row => ({
      id: row.id,
      ...row.raw_data
    }));
    res.json(elite);
  } catch (err) {
    console.error('❌ Error fetching elite studs:', err.message);
    res.status(500).send('Server error');
  }
});

// GET: Enriched Elite Studs for Discord Bot or UI
app.get('/api/elite-studs-enriched', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);

  try {
    const result = await client.query(`
      SELECT id, raw_data
      FROM horses
      WHERE type = 'stud'
      AND (raw_data->'racing'->>'heart') LIKE 'SS%'
      AND (raw_data->'racing'->>'stamina') LIKE 'SS%'
      AND (raw_data->'racing'->>'speed') LIKE 'S+%'
      AND (
        (raw_data->'racing'->>'temper') LIKE 'S+%'
        OR (raw_data->'racing'->>'start') LIKE 'S+%'
      )
    `);

    const gradeRank = { 'S': -1, 'S+': 0, 'SS-': 1, 'SS': 2 };
    const enriched = result.rows.map(row => {
      const d = row.raw_data;
      const r = d.racing || {};
      const stats = d.history?.raceStats?.allTime?.all || {};
      const purse = stats?.biggestPrize?.consolidatedValue?.value || 0;
      const starts = stats.starts || stats.races || 0;
      const podium = starts > 0 ? Math.round((stats.wins / starts) * 100) : null;

      // Calculate subgrade
      let subgrade = 0;
      if (r.grade in gradeRank) {
        ['heart', 'stamina', 'speed', 'start', 'finish', 'temper'].forEach(attr => {
          const val = r[attr];
          if (val in gradeRank) {
            subgrade += gradeRank[val] - gradeRank[r.grade];
          }
        });
      }

      return {
        id: row.id,
        name: d.name || 'Unknown',
        stats: {
          ...r,
          grade: r.grade || '-',
          subgrade,
          wins: stats.wins || 0,
          races: starts,
          majorWins: stats.majorWins || 0,
          podium,
          largestPurse: purse
        }
      };
    });

    const sorted = enriched.sort((a, b) => (b.stats.largestPurse || 0) - (a.stats.largestPurse || 0));
    res.json(sorted.slice(0, limit));
  } catch (err) {
    console.error('❌ Error fetching enriched elite studs:', err.message);
    res.status(500).send('Server error');
  }
});

// --- Winners: Top by Biggest Purse ---
app.get('/api/winners', async (req, res) => {
  const limit = parseInt(req.query.top) || 20;

  const gradeRank = { 'S': -1, 'S+': 0, 'SS-': 1, 'SS': 2 };
  function getSubgradeScore(base, traits) {
    let total = 0;
    ['heart', 'stamina', 'speed', 'start', 'finish', 'temper'].forEach(attr => {
      const value = traits?.[attr] || '';
      if (value in gradeRank && base in gradeRank) {
        total += gradeRank[value] - gradeRank[base];
      }
    });
    return total;
  }

  try {
    const result = await client.query(`
      SELECT id, raw_data FROM horses
      WHERE type = 'stud'
      ORDER BY (raw_data->'history'->'raceStats'->'allTime'->'all'->'biggestPrize'->'currencies'->'Derby'->>'value')::float DESC
      LIMIT $1
    `, [limit]);

    const studs = result.rows.map(row => {
      const data = row.raw_data || {};
      const racing = data.racing || {};
      const stats = data.history?.raceStats?.allTime?.all || {};
      const biggestPurse = parseFloat(stats.biggestPrize?.currencies?.Derby?.value || 0);

      const grade = racing.grade;
      const subgrade = (grade in gradeRank) ? getSubgradeScore(grade, racing) : null;

      return {
        id: row.id,
        name: data.name || 'Unknown',
        score: data.score || 0,
        reason: data.reason || 'N/A',
        racing: {
          ...racing,
          subgrade
        },
        stats: {
          wins: stats.wins || 0,
          majors: stats.majorWins || 0,
          podium: stats.starts > 0 ? Math.round((stats.wins / stats.starts) * 100) : null,
          biggestPurse
        }
      };
    });

    res.json(studs);
  } catch (err) {
    console.error('❌ Error fetching winning studs:', err.message);
    res.status(500).send('Server error');
  }
});


async function gentleFetchHorse(id, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(`https://api.photofinish.live/pfl-pro/horse-api/${id}`, {
        headers: { 'x-api-key': process.env.PFL_API_KEY },
      });
      return res.data?.horse;
    } catch (err) {
      console.warn(`⚠️ gentleFetchHorse attempt ${attempt} failed for ${id}: ${err.message}`);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * 2 ** (attempt - 1)));
      }
    }
  }
  return null;
}

function isValidUUID(str) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// ✅ GET: Full horse data by ID
app.get('/api/horse/:id', async (req, res) => {
  const horseId = req.params.id;

  const queryHorseFromTables = async () => {
    if (!isUuid(horseId)) {
      console.warn(`⚠️ Skipping invalid UUID: ${horseId}`);
      return null;
    }

    const { rows: main } = await client.query('SELECT raw_data FROM horses WHERE id = $1', [horseId]);
    if (main.length) return main[0].raw_data;

    const { rows: ancestors } = await client.query('SELECT raw_data FROM ancestors WHERE id = $1', [horseId]);
    if (ancestors.length) return ancestors[0].raw_data;

    return null;
  };

  let horse = await queryHorseFromTables();

  if (!horse) {
    const data = await gentleFetchHorse(horseId);
    if (data?.id) {
      await client.query(
        `INSERT INTO ancestors (id, raw_data)
         VALUES ($1, $2)
         ON CONFLICT (id) DO NOTHING`,
        [data.id, data]
      );
      horse = data;
    }
  }

  if (!horse) return res.status(404).send('Horse not found');
  res.json(horse);
});

// ✅ GET: 3 levels down ancestors
async function getAllAncestorsDeep(horseId, depth = 3, visited = new Set()) {
  if (depth === 0 || visited.has(horseId)) return [];

  visited.add(horseId);
  const horse = await queryHorseById(horseId);
  if (!horse?.simpleFamilyTree || !Array.isArray(horse.simpleFamilyTree)) return [];

  const currentAncestors = horse.simpleFamilyTree;
  const nextGen = [];
  for (const ancestorId of currentAncestors) {
    const subAncestors = await getAllAncestorsDeep(ancestorId, depth - 1, visited);
    nextGen.push(...subAncestors);
  }

  return [...new Set([...currentAncestors, ...nextGen])];
}


async function queryHorseById(id) {
  if (!isUuid(id)) {
    console.warn(`⚠️ Skipping invalid UUID: ${id}`);
    return null;
  }
  const horseFromDb = async () => {
    const { rows: h } = await client.query('SELECT raw_data FROM horses WHERE id = $1', [id]);
    if (h.length) return h[0].raw_data;
    const { rows: a } = await client.query('SELECT raw_data FROM ancestors WHERE id = $1', [id]);
    if (a.length) return a[0].raw_data;
    return null;
  };

  let horse = await horseFromDb();
  if (!horse) {
    const fetched = await gentleFetchHorse(id);
    if (fetched?.id) {
      await client.query(
        `INSERT INTO ancestors (id, raw_data)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET raw_data = EXCLUDED.raw_data, updated_at = CURRENT_TIMESTAMP`,
        [fetched.id, fetched]
      );
      horse = fetched;
    }
  }
  return horse;
}

// ✅ GET: Winner horse IDs (KD winners)
app.get('/api/winner-ids', async (req, res) => {
  try {
    const { rows } = await client.query(`
      SELECT id FROM horses
      WHERE raw_data->'history'->'raceSummaries' @> $1
    `, [`[{"raceName": "Kentucky Derby", "finishPosition": 1}]`] );

    const ids = rows.map(row => row.id);
    res.json(ids);
  } catch (err) {
    console.error('❌ Error fetching winner IDs:', err.message);
    res.status(500).send('Server error');
  }
});

// GET: KD Winners' Progeny
app.get('/api/kd-progeny', async (req, res) => {
  try {
    const kdSires = await client.query(`
      SELECT id FROM horses
      WHERE raw_data->'history'->'raceSummaries' @> $1
    `, [`[{"raceName": "Kentucky Derby", "finishPosition": 1}]`]);

    const kdIds = kdSires.rows.map(row => row.id);
    if (kdIds.length === 0) return res.json([]);

    const result = await client.query(`
      SELECT id, raw_data FROM horses
      WHERE raw_data->>'sireId' = ANY($1)
    `, [kdIds]);

    const progeny = result.rows.map(row => ({
      id: row.id,
      ...row.raw_data
    }));
    res.json(progeny);
  } catch (err) {
    console.error('❌ Error fetching KD progeny:', err.message);
    res.status(500).send('Server error');
  }
});

// GET: Breeding Pairs
app.get('/api/breeding-pairs', async (req, res) => {
  try {
    const result = await client.query(`
  SELECT em.mare_id, em.stud_id, em.reason,
         m.raw_data AS mare_raw,
         s.raw_data AS stud_raw
  FROM elite_matches em
  JOIN mares m ON em.mare_id = m.id
  JOIN horses s ON em.stud_id = s.id
`);
   const pairs = result.rows.map(row => ({
  mare_id: row.mare_id,
  mare_name: row.mare_raw?.name,
  mare: row.mare_raw,
  stud_id: row.stud_id,
  stud_name: row.stud_raw?.name,
  stud: row.stud_raw,
  reason: row.reason
}));
    res.json(pairs);
  } catch (err) {
    console.error('❌ Error fetching breeding pairs:', err.message);
    res.status(500).send('Server error');
  }
});

app.get('/api/family-tree', async (req, res) => {
  try {
    const result = await client.query(`
      SELECT
        ft.horse_id,
        ft.sire_id,
        ft.dam_id,
        ft.race_grade,
        ft.is_kd_winner,
        COALESCE(h.raw_data->>'name', us.raw_data->>'name') AS name,
        COALESCE(h.raw_data->'history'->'raceStats'->'allTime'->'all'->>'wins', '0') AS total_wins,
        COALESCE(h.raw_data->'history'->'raceStats'->'allTime'->'all'->>'majorWins', '0') AS major_wins,
        COALESCE(hs.raw_data->>'name', uss.raw_data->>'name') AS sire_name
      FROM family_tree ft
      LEFT JOIN horses h ON ft.horse_id = h.id
      LEFT JOIN unlisted_sires us ON ft.horse_id = us.id
      LEFT JOIN horses hs ON ft.sire_id = hs.id
      LEFT JOIN unlisted_sires uss ON ft.sire_id = uss.id
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching family tree:", err.message);
    res.status(500).json({ error: "Failed to fetch family tree" });
  }
});

app.get('/api/family-tree-v2', async (req, res) => {
  const depth = Math.min(parseInt(req.query.depth || "2"), 5);
  //const client = await getClient();

  try {
    const result = await client.query('SELECT * FROM family_tree');
    const horses = {};

    // Preload all data to avoid n+1 queries
    result.rows.forEach(row => {
      horses[row.horse_id] = row;
    });

    // Load corresponding names from horses table
    const horseData = await client.query('SELECT id, raw_data FROM horses');
    const horseNames = {};
    horseData.rows.forEach(row => {
      horseNames[row.id] = {
        name: row.raw_data?.name || '-',
        grade: row.raw_data?.racing?.grade || '-',
      };
    });

    function buildTree(horseId, currentDepth = 0) {
      const node = horses[horseId];
      if (!node) return null;

      const enriched = {
        horse_id: node.horse_id,
        name: horseNames[node.horse_id]?.name || '-',
        grade: node.race_grade || '-',
        is_kd_winner: node.is_kd_winner,
      };

      if (currentDepth < depth) {
        enriched.sire = buildTree(node.sire_id, currentDepth + 1);
        enriched.dam = buildTree(node.dam_id, currentDepth + 1);
      }

      return enriched;
    }

    const trees = Object.keys(horses).map(horseId => buildTree(horseId)).filter(Boolean);
    res.json(trees);

  } catch (err) {
    console.error('❌ Error building family tree v2:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET: Winners grouped by raceName (fallback from missing trackName)
app.get('/api/tracks-winners', async (req, res) => {
  try {
    const result = await client.query(`
      SELECT id, raw_data FROM horses WHERE raw_data->'history'->'raceSummaries' IS NOT NULL
    `);

    const horsesByRace = {};

    for (const row of result.rows) {
      const summaries = row.raw_data?.history?.raceSummaries || [];
      const stats = row.raw_data?.racing || {};
      const name = row.raw_data?.name;

      summaries.forEach((race) => {
        if (race.finishPosition === 1 && race.raceName) {
          if (!horsesByRace[race.raceName]) {
            horsesByRace[race.raceName] = [];
          }

          horsesByRace[race.raceName].push({
            id: row.id,
            name,
            race: race.raceName,
            season: race.season,
            grade: stats?.grade || '-',
            heart: stats?.heart || '-',
            stamina: stats?.stamina || '-',
            speed: stats?.speed || '-',
            start: stats?.start || '-',
            temper: stats?.temper || '-',
          });
        }
      });
    }

    res.json(horsesByRace);
  } catch (err) {
    console.error('❌ Error fetching track winners:', err.message);
    res.status(500).send('Server error');
  }
});

// GET: Top Studs Ranked
app.get('/api/top-studs', async (req, res) => {
  try {
    const result = await client.query(`
      SELECT
        mare_id,
        mare_name,
        mare_stats,
        mare_link,
        stud_id,
        stud_name,
        stud_stats,
        stud_link,
        rank,
        score,
        reason
      FROM top_studs_ranked
      ORDER BY mare_id, rank;
    `);

    const grouped = {};
    for (const row of result.rows) {
      if (!grouped[row.mare_id]) {
        grouped[row.mare_id] = {
          mare_name: row.mare_name,
          mare_link: row.mare_link,
          mare_stats: row.mare_stats,
          matches: []
        };
      }
      grouped[row.mare_id].matches.push({
        rank: row.rank,
        score: row.score,
        reason: row.reason,
        stud_name: row.stud_name,
        stud_id: row.stud_id,
        stud_link: row.stud_link,
        stud_stats: row.stud_stats
      });
    }

    res.json(grouped);
  } catch (err) {
    console.error('❌ Error fetching top studs ranked:', err.message);
    res.status(500).json({ error: 'Failed to fetch top studs' });
  }
});

app.get('/api/kd-targets', async (req, res) => {
  try {
    const result = await client.query(`
      SELECT mare_id, mare_name, stud_id, stud_name, score, mare_stats, stud_stats
      FROM kd_target_matches
      ORDER BY score DESC
    `);

    const grouped = {};

    for (const row of result.rows) {
      if (!grouped[row.mare_id]) {
        grouped[row.mare_id] = {
          mare_name: row.mare_name,
          mare_link: `https://photofinish.live/horses/${row.mare_id}`,
          mare_stats: row.mare_stats,
          matches: []
        };
      }

      grouped[row.mare_id].matches.push({
        stud_id: row.stud_id,
        stud_name: row.stud_name,
        stud_link: `https://photofinish.live/horses/${row.stud_id}`,
        stud_stats: row.stud_stats,
        score: row.score
      });
    }

    res.json(grouped);
  } catch (err) {
    console.error('❌ Error fetching KD targets:', err.message);
    res.status(500).json({ error: 'Failed to fetch KD targets' });
  }
});


// Health Check
app.get('/api/health', (req, res) => {
  res.send('✅ API is live');
});

// Catch-all to avoid frontend interfering with API
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  next();
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});