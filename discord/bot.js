// discord/bot.js
require('dotenv').config();
const BASE_URL = process.env.HOST?.replace(/\/$/, ''); // remove trailing slash if any
const { Client, GatewayIntentBits } = require('discord.js');
const fetch = require('node-fetch');
const { exec } = require('child_process');

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

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content;

  // /help command
  if (content === '/help') {
    return message.reply(
      `📖 **Available Commands:**\n\n` +
      `• \`/breed mare:{mareId} topStuds:{x} race:{raceName}\`\n` +
      `   → Returns top X stud matches for a mare, optimized for a specific race (e.g., Kentucky Derby).\n\n` +
      `• \`/eliteStuds top:{x}\`\n` +
      `   → Shows the top X elite studs based on high-grade traits and stats.\n\n` +
      `• \`/winners top:{x}\`\n` +
      `   → Lists the top X studs ranked by biggest single race purse earned.\n\n` +
      `• \`/updateData\`\n` +
      `   → Triggers full data refresh. Only works if you're an authorized user. 🚫\n\n` +
      `• \`/help\`\n` +
      `   → Displays this list of commands.`
    );
  }

  // /eliteStuds top:{x}
  if (content.startsWith('/eliteStuds')) {
    const parts = content.split(/\s+/);
    const topPart = parts.find((p) => p.startsWith('top:'));
    const topX = topPart ? parseInt(topPart.split(':')[1]) : 10;

    if (isNaN(topX)) {
      return message.reply('❌ Invalid input. Use `/eliteStuds top:{x}`');
    }

    await message.reply(`🔍 Fetching top ${topX} elite studs...`);

    try {
      const res = await fetch(`${BASE_URL}/api/elite-studs-enriched?limit=${topX}`);
      if (!res.ok) throw new Error(`API responded with ${res.status}`);
      const studs = await res.json();

      if (!studs || studs.length === 0) {
        return message.reply('⚠️ No elite studs found.');
      }

      const chunks = [];
      for (let i = 0; i < studs.length; i += 5) {
        chunks.push(studs.slice(i, i + 5));
      }

      let n = 0;

      for (const chunk of chunks) {
        const msg = chunk
          .map((stud) => {
            const s = stud.stats || {};
            const podium = s.podium !== undefined ? `${s.podium}%` : 'N/A';
            const purse = s.largestPurse ? `${Math.round(s.largestPurse).toLocaleString()} Derby` : 'N/A';
            const statsLine = [
              `Start: ${s.start || '-'}`,
              `Speed: ${s.speed || '-'}`,
              `Stamina: ${s.stamina || '-'}`,
              `Finish: ${s.finish || '-'}`,
              `Heart: ${s.heart || '-'}`,
              `Temper: ${s.temper || '-'}`,
            ].join(' | ');
            n++;
            return `**Elite Stud ${n}: ${stud.name}**\n` +
              `🧬 Grade: ${s.grade || '-'} (${s.subgrade >= 0 ? '+' : ''}${s.subgrade})\n` +
              `${statsLine}\n` +
              `🎯 Direction: ${s.direction?.value || '-'} | Surface: ${s.surface?.value || '-'}\n` +
              `🏆 Wins: ${s.wins || 0} | Majors: ${s.majorWins || 0} | Podium: ${podium}\n` +
              `💰 Largest Purse: ${purse}\n` +
              `🔗 https://photofinish.live/horses/${stud.id}`;
          })
          .join('\n\n');

        await message.reply(msg);
        await delay(1000);
      }
    } catch (err) {
      console.error('❌ Bot error:', err);
      message.reply('❌ Failed to load elite studs.');
    }
    return;
  }

  // /updateData
  if (content === '/updateData') {
    if (message.author.id !== process.env.OWNER_USER_ID) {
      return message.reply('🚫 Your user ' + message.author.id + ' does not have the correct privileges.');
    }

    message.reply('🔄 Updating data... This may take a few minutes. A confirmation message will be sent.');

    exec('bash ./run_full_pipeline.sh', (err, stdout, stderr) => {
      if (err) {
        console.error(`❌ Update script error:\n${stderr}`);
        return message.reply('❌ Failed to execute update script.');
      }

      console.log(`✅ Script output:\n${stdout}`);
      message.reply('✅ Data update completed successfully.');
    });
    return;
  }

  // /winners top:{x}
  if (message.content.startsWith('/winners')) {
    const match = message.content.match(/top:(\d+)/);
    const limit = match ? parseInt(match[1]) : 10;

    try {
      const res = await fetch(`${BASE_URL}/api/winners`);
      const json = await res.json();

      if (!Array.isArray(json)) {
        console.error('❌ API did not return an array:', json);
        return message.reply('❌ Unexpected API response while fetching winners.');
      }

      const studs = json.slice(0, limit);
      let n = 0;

      for (let i = 0; i < studs.length; i += 5) {
        const chunk = studs.slice(i, i + 5);
        const msg = chunk.map(stud => {
          const s = stud.racing || {};
          const stats = stud.stats || {};
          n++;
          return `**Rank ${n}: ${stud.name}**\n` +
            `🧬 Grade: ${s.grade || '-'} (${s.subgrade >= 0 ? '+' : ''}${s.subgrade})\n` +
            `Start: ${s.start} | Speed: ${s.speed} | Stamina: ${s.stamina} | Finish: ${s.finish} | Heart: ${s.heart} | Temper: ${s.temper}\n` +
            `🎯 Direction: ${s.direction?.value || '-'} | Surface: ${s.surface?.value || '-'}\n` +
            `🏆 Wins: ${stats.wins || 0} | Majors: ${stats.majors || 0} | Podium: ${stats.podium || 'N/A'}%\n` +
            `💰 Biggest Purse: ${stats.biggestPurse ? `${Math.round(stats.biggestPurse).toLocaleString()} Derby` : 'N/A'}\n` +
            `🔗 https://photofinish.live/horses/${stud.id}`;
        }).join('\n\n');

        await message.reply(msg);
        await delay(1000);
      }
    } catch (err) {
      console.error('❌ Winners fetch error:', err);
      message.reply('❌ An error occurred while fetching winning studs.');
    }
  }

  // /breed command
  if (content.startsWith('/breed')) {
    const parts = content.split(/\s+/);
    const marePart = parts.find((p) => p.startsWith('mare:'));
    const topPart = parts.find((p) => p.startsWith('topStuds:'));
    const racePart = parts.find((p) => p.startsWith('race:'));

    if (!marePart || !topPart || !racePart) {
      return message.reply('❌ Usage: `/breed mare:{mareId} topStuds:{x} race:{raceName}`');
    }

    const mareId = marePart.split(':')[1];
    const topX = parseInt(topPart.split(':')[1]);
    const race = racePart.split(':')[1].toLowerCase();

    if (!mareId || isNaN(topX) || !race) {
      return message.reply('❌ Invalid parameters provided.');
    }

    await message.reply(`🔍 Searching studs for mare ID: ${mareId}`);

    try {
      const res = await fetch(`${BASE_URL}/api/kd-targets`);
      if (!res.ok) throw new Error(`API responded with ${res.status}`);
      const data = await res.json();
      if (!data || typeof data !== 'object') throw new Error('Invalid response');

      const match = data[mareId];
      if (!match) {
        return message.reply('❌ Mare not found in KD target matches.');
      }

      const mareName = match.mare_name || mareId;
      let studs = match.matches || [];

      // Sort by biggest purse
      studs.sort((a, b) => (b.stud_stats?.biggestPrize || 0) - (a.stud_stats?.biggestPrize || 0));

      studs = studs.slice(0, topX);

      if (!studs || studs.length === 0) {
        return message.reply('⚠️ No suitable studs found.');
      }

      const chunks = [];
      for (let i = 0; i < studs.length; i += 5) {
        chunks.push(studs.slice(i, i + 5));
      }

      let n = 0;
      for (const chunk of chunks) {
        const msg = chunk.map((stud) => {
          const stats = stud.stud_stats || {};
          const reason = stud.reason || 'N/A';
          const podium = stats.podium !== undefined ? `${stats.podium}%` : 'N/A';
          const biggest = stats.biggestPrize ? `${stats.biggestPrize.toLocaleString()} Derby` : 'N/A';
          const statsLine = [
            `Start: ${stats.start || '-'}`,
            `Speed: ${stats.speed || '-'}`,
            `Stamina: ${stats.stamina || '-'}`,
            `Finish: ${stats.finish || '-'}`,
            `Heart: ${stats.heart || '-'}`,
            `Temper: ${stats.temper || '-'}`,
          ].join(' | ');
          n++;
          return `**Match ${n}: ${mareName} x ${stud.stud_name}**\n` +
            `Score: ${stud.score} | Reason: ${reason}\n` +
            `🧬 Grade: ${stats.grade || '-'} (${stats.subgrade >= 0 ? '+' : ''}${stats.subgrade})\n` +
            `${statsLine}\n` +
            `🎯 Direction: ${stats.direction?.value || '-'} | Surface: ${stats.surface?.value || '-'}\n` +
            `🏆 Wins: ${stats.wins || 0} | Majors: ${stats.majorWins || 0} | Podium: ${podium}\n` +
            `💰 Biggest Purse: ${biggest}\n` +
            `🔗 https://photofinish.live/horses/${stud.stud_id}`;
        }).join('\n\n');

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
