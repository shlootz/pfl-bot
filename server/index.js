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
      SELECT * FROM elite_matches
      JOIN horses s ON elite_matches.stud_id = s.id
      JOIN mares m ON elite_matches.mare_id = m.id
    `);
    const pairs = result.rows.map(row => ({
      mare_id: row.mare_id,
      mare_name: row.m.raw_data?.name,
      mare: row.m.raw_data,
      stud_id: row.stud_id,
      stud_name: row.s.raw_data?.name,
      stud: row.s.raw_data,
      reason: row.reason
    }));
    res.json(pairs);
  } catch (err) {
    console.error('❌ Error fetching breeding pairs:', err.message);
    res.status(500).send('Server error');
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