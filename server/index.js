require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Client } = require('pg');

const app = express();
const PORT = process.env.PORT || 4000;

const client = new Client({ connectionString: process.env.DATABASE_URL });

client.connect()
  .then(() => console.log('🐎 Connected to PostgreSQL'))
  .catch(err => console.error('❌ DB connection error:', err.stack));

app.use(cors());
app.use(express.json());

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