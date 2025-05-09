const fs = require('fs');
const { Client } = require('pg');

const DB_URL = process.env.DATABASE_URL;

async function loadMares() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  const text = fs.readFileSync('data/mare_ids.txt', 'utf-8');
  const mareIds = text.split(',').map((id) => id.trim());

  const { rows } = await client.query(
    `SELECT id, raw_data FROM horses WHERE id = ANY($1) AND type = 'mare'`,
    [mareIds]
  );

  await client.end();
  return rows.map((r) => ({ id: r.id, ...r.raw_data }));
}

module.exports = { loadMares };