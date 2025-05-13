// bot.js
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith('/breed ')) {
    const mareId = message.content.split(' ')[1];
    if (!mareId) {
      message.reply('❌ Please provide a mare ID like `/breed 1234`');
    } else {
      // Your logic here
      message.reply(`Searching studs for mare ID: ${mareId}`);
    }
  }
});

client.login(process.env.BOT_TOKEN);