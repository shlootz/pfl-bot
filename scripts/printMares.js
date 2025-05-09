require('dotenv').config();
const { loadMares } = require('../loadMares');

async function run() {
  const mares = await loadMares();
  console.log(`🐎 Loaded ${mares.length} mares`);
  mares.forEach((m) => console.log(m.name, m.id));
}

run();