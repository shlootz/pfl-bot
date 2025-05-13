// discord/bot.js
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fetch = require('node-fetch');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// Utility to delay between messages
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Format a single stud match entry
function formatMatch(match) {
  const { stud_name, stud_id, stud_stats, score } = match;
  const heart = stud_stats?.heart || '-';
  const stamina = stud_stats?.stamina || '-';
  const speed = stud_stats?.speed || '-';
  const direction = stud_stats?.direction?.value || '-';
  const surface = stud_stats?.surface?.value || '-';

  return (
    `**${stud_name || stud_id}**\n` +
    `Score: ${score}\n` +
    `🧬 ${heart}, ${stamina}, ${speed}\n` +
    `🎯 ${direction} | ${surface}\n` +
    `🔗 https://photofinish.live/horses/${stud_id}`
  );
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith('/breed')) {
    const command = message.content.trim();
    const match = command.match(/\/breed mare:(\S+) topStuds:(\d+) race:(.+)/i);

    if (!match) {
      return message.reply(
        '❌ Invalid command format. Use: `/breed mare:{mareId} topStuds:{X} race:{Race Name}`'
      );
    }

    const [, mareId, topXStr, race] = match;
    const topX = parseInt(topXStr);

    message.reply(`🔍 Searching top ${topX} studs for mare ID: ${mareId} (target: ${race})...`);

    try {
      const response = await fetch(`http://localhost:4000/api/kd-targets?mare_id=${mareId}`);
      if (!response.ok) {
        return message.reply(`❌ Failed to fetch data for mare ${mareId}`);
      }
      const json = await response.json();

      const mareEntry = json[mareId];
      if (!mareEntry || !mareEntry.matches || mareEntry.matches.length === 0) {
        return message.reply(`❌ No matches found for mare ${mareId}`);
      }

      const mareName = mareEntry.mare_name || mareId;
      const batches = [];
      for (let i = 0; i < topX && i < mareEntry.matches.length; i += 5) {
        batches.push(mareEntry.matches.slice(i, i + 5));
      }

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const formatted = batch.map(formatMatch).join('\n\n');
        await message.reply(
          `**${mareName}** — Match batch ${i + 1}/${batches.length}:\n\n${formatted}`
        );
        await delay(1000);
      }
    } catch (err) {
      console.error('❌ Discord bot error:', err);
      message.reply('❌ Unexpected error while processing request.');
    }
  }
});

client.login(process.env.BOT_TOKEN);