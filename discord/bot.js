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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function passesFilters(stats) {
  if (!stats || typeof stats !== 'object') return false;

  const directionStars = parseFloat(stats.direction?.weight ?? 0);
  const surfaceStars = parseFloat(stats.surface?.weight ?? 0);
  const subgrade = stats.subgrade ?? -999;
  const wins = parseInt(stats.wins ?? 0, 10);
  const races = parseInt(stats.races ?? stats.totalRaces ?? 0, 10);

  // Assume safe fallback if races are missing — adjust if needed
  const winRate = races > 0 ? wins / races : null;

  const isValid =
    directionStars >= 2 &&
    surfaceStars >= 2 &&
    subgrade >= 0 &&
    (winRate === null || winRate >= 0.5); // allow unknown winRate to pass

  if (!isValid) {
    console.log(`❌ FILTER FAIL: Grade=${stats.grade} Sub=${subgrade}, Stars: D=${directionStars}, S=${surfaceStars}, WR=${winRate}`);
  }

  return isValid;
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith('/breed')) {
    const parts = message.content.split(/\s+/);
    const marePart = parts.find((p) => p.startsWith('mare:'));
    const topPart = parts.find((p) => p.startsWith('topStuds:'));
    const racePart = parts.find((p) => p.startsWith('race:'));

    if (!marePart || !topPart || !racePart) {
      return message.reply(
        '❌ Usage: `/breed mare:{mareId} topStuds:{x} race:{raceName}`'
      );
    }

    const mareId = marePart.split(':')[1];
    const topX = parseInt(topPart.split(':')[1]);
    const race = racePart.split(':')[1].toLowerCase();

    if (!mareId || isNaN(topX) || !race) {
      return message.reply('❌ Invalid parameters provided.');
    }

    await message.reply(`🔍 Searching studs for mare ID: ${mareId}`);

    try {
      const res = await fetch('http://localhost:4000/api/kd-targets');
      if (!res.ok) throw new Error(`API responded with ${res.status}`);
      const data = await res.json();
      if (!data || typeof data !== 'object') throw new Error('Invalid response');

      const match = data[mareId];
      if (!match) {
        return message.reply('❌ Mare not found in KD target matches.');
      }

      const mareName = match.mare_name || mareId;
      const studs = (match.matches || []).filter((s) => passesFilters(s.stud_stats)).slice(0, topX);

      if (!studs.length) {
        return message.reply('⚠️ No suitable studs found after filtering.');
      }

      const chunks = [];
      for (let i = 0; i < studs.length; i += 5) {
        chunks.push(studs.slice(i, i + 5));
      }

      let n = 0;

      for (const chunk of chunks) {
        const msg = chunk
          .map((stud) => {
            const stats = stud.stud_stats || {};
            const reason = stud.reason || 'N/A';
            const podiumPercent =
              stats.wins && stats.races
                ? `${Math.round((stats.wins / stats.races) * 100)}%`
                : 'N/A';

            n++;
            return `**Match ${n}: ${mareName} x ${stud.stud_name}**\n` +
              `Score: ${stud.score} | Reason: ${reason}\n` +
              `🧬 Grade: ${stats.grade || '-'} (${stats.subgrade >= 0 ? '+' + stats.subgrade : stats.subgrade}), Stats: ${stats.heart || '-'}, ${stats.stamina || '-'}, ${stats.speed || '-'}\n` +
              `🎯 Direction: ${stats.direction?.value || '-'} (${stats.direction?.weight || '-'}) | Surface: ${stats.surface?.value || '-'} (${stats.surface?.weight || '-'})\n` +
              `🏆 Wins: ${stats.wins || 0} | Majors: ${stats.majorWins || 0} | Podium: ${podiumPercent}\n` +
              `🔗 https://photofinish.live/horses/${stud.stud_id}`;
          })
          .join('\n\n');

        await message.reply(msg);
        await delay(1000);
      }
    } catch (err) {
      console.error('❌ Bot error:', err);
      message.reply('❌ An error occurred while fetching matches.');
    }
  }
});

client.login(process.env.BOT_TOKEN);