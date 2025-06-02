require('dotenv').config();
const { Client, GatewayIntentBits, InteractionType } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const handlers = [
  require('./handlers/go'),
  require('./handlers/breed'),
  require('./handlers/topmaresforsale'),
  require('./handlers/winners'),
  require('./handlers/simulate'),
  require('./handlers/help'),
  require('./handlers/updatedata'),
  require('./handlers/progeny'),
  require('./handlers/bestBreedMatch'),
  require('./handlers/checkBloodline')/*,
  require('./handlers/addmare'),
  require('./handlers/elitestuds')*/
];

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  for (const handler of handlers) {
    try {
      await handler(interaction);
    } catch (err) {
      console.error(`❌ Error in handler:`, err);
    }
  }
});

client.login(process.env.BOT_TOKEN);