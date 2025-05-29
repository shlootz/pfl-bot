const { InteractionType } = require('discord.js');
const { fetchMareWithRetries } = require('../../scripts/fetchMaresFromAPI');
const insertMareToDb = require('../../server/helpers/insertMareToDb');
const { Client } = require('pg');

const checkIfMareExists = async (id) => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query('SELECT 1 FROM mares WHERE id = $1', [id]);
  await client.end();
  return res.rowCount > 0;
};

module.exports = async function handleAddMare(interaction) {
  if (
    interaction.type !== InteractionType.ModalSubmit ||
    interaction.customId !== 'addmare_modal'
  ) return;

  await interaction.deferReply({ ephemeral: true });

  const idsRaw = interaction.fields.getTextInputValue('mare_ids');
  const ids = idsRaw
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0);

  const results = [];

  for (const id of ids) {
    try {
      const alreadyExists = await checkIfMareExists(id);
      if (alreadyExists) {
        results.push(`⚠️ ${id} – Already exists in DB`);
        continue;
      }

      const mareData = await fetchMareWithRetries(id);

      if (!mareData?.horse || mareData.horse.gender !== 1) {
        results.push(`❌ ${id} – Not found or not a mare`);
        continue;
      }

      const inserted = await insertMareToDb(mareData.horse);
      if (inserted) {
        results.push(`✅ ${id} – ${mareData.horse.name} added`);
      } else {
        results.push(`❌ ${id} – DB insert failed`);
      }
    } catch (err) {
      results.push(`❌ ${id} – Error: ${err.message}`);
    }
  }

  await interaction.followUp({
    content: `📝 Add Mare Results:\n${results.join('\n')}`,
    ephemeral: true
  });
};