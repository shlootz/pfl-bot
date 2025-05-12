// server/index.js
require('dotenv').config();
const express = require('express');
const { Client } = require('pg');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;

// PostgreSQL client setup
const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

client.connect()
  .then(() => console.log('🐎 Connected to PostgreSQL'))
  .catch(err => console.error('❌ DB connection error:', err.stack));

app.use(cors());
app.use(express.json());

// API route to get all horses
app.get('/api/horses', async (req, res) => {
  try {
    const result = await client.query('SELECT id, type, raw_data FROM horses');
    const horses = result.rows.map(row => ({
      id: row.id,
      ...row.raw_data
    }));
    res.json(horses);
  } catch (err) {
    console.error('❌ Error fetching horses:', err);
    res.status(500).send('Server error');
  }
});

// Optional health check
app.get('/api/health', (req, res) => {
  res.send('✅ API is running');
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
