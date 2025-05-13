// bot.js
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');

const DISCORD_BOT_TOKEN = process.env.BOT_TOKEN;
const API_URL = 'http://localhost:4000/api/kd-targets'; // Adjust if deployed

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith('/breed')) return;

  const match = message.content.match(/\/breed\s+mare:(\S+)\s+topStuds:(\d+)\s+race:(.+)/i);
  if (!match) {
    return message.reply(
      '❌ Invalid format. Use `/breed mare:{mareId} topStuds:{x} race:{targetRace}`'
    );
  }

  const [, mareId, topX, race] = match;
  message.reply(`🔍 Searching studs for mare ID: \`${mareId}\` targeting **${race}**...`);

  try {
    const { data } = await axios.get(API_URL);
    const matchData = data[mareId];

    if (!matchData || !matchData.matches?.length) {
      return message.reply(`⚠️ No matches found for mare ID: \`${mareId}\``);
    }

    const mareName = matchData.mare_name || 'Unknown Mare';
    const topMatches = matchData.matches.slice(0, Number(topX));

    const lines = [
      `🐎 **Mare:** ${mareName} (\`${mareId}\`)`,
      `🎯 **Target Race:** ${race}`,
      `🔝 **Top ${topX} Matches:**`,
    ];

    for (const [i, match] of topMatches.entries()) {
      lines.push(
        `\n${i + 1}. **${match.stud_name}** (\`${match.stud_id}\`) — Score: ${match.score}` +
        `\n Grade: ${match.stud_stats?.grade}, Heart: ${match.stud_stats?.heart}, Stamina: ${match.stud_stats?.stamina},` +
        ` Speed: ${match.stud_stats?.speed}, Start: ${match.stud_stats?.start}, Temper: ${match.stud_stats?.temper}` +
        `\n 🌐 [View Profile](https://photofinish.live/horses/${match.stud_id})`
      );
    }

    message.reply(lines.join('\n'));
  } catch (err) {
    console.error('❌ Error fetching KD targets:', err.message);
    message.reply('❌ Failed to fetch breeding matches. Please try again later.');
  }
});

client.login(DISCORD_BOT_TOKEN);