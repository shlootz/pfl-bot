require('dotenv').config();
const { loadMares } = require('../loadMares');

const BASE_URL = process.env.HOST?.replace(/\/$/, ''); // remove trailing slash if any

async function run() {
  const mares = await loadMares();
  console.log(`🐎 Loaded ${mares.length} mares`);
  mares.forEach((m) => console.log(m.name, m.id));
}

run();