// discord/bot.js
require('dotenv').config();
const insertMareToDb = require('../server/helpers/insertMareToDb');
const { insertMatchesForMare } = require('../scripts/scoreKDTargets');

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, GatewayIntentBits } = require('discord.js');
const fetch = require('node-fetch');
const { exec } = require('child_process');

const BASE_URL = process.env.HOST?.replace(/\/$/, '');
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content;

  // /help
  if (content === '/help') {
    return message.reply(
      `📖 **Available Commands:**\n\n` +
      `• \`/breed mare:{mareId} topStuds:{x} race:{raceName}\`\n` +
      `   → Returns top X stud matches for a mare, optimized for a specific race (e.g., Kentucky Derby).\n\n` +
      `• \`/eliteStuds top:{x}\`\n` +
      `   → Shows the top X elite studs based on high-grade traits and stats.\n\n` +
      `• \`/winners top:{x} direction:{LeftTurning|RightTurning} surface:{Dirt|Turf}\`\n` +
      `   → Lists the top X studs ranked by biggest single race purse. Filters optional.\n\n` +
      `• \`/updateData\`\n` +
      `   → Triggers full data refresh. Only works if you're an authorized user. 🚫\n\n` +
      `• \`/help\`\n` +
      `   → Displays this list of commands.`
    );
  }

  // /eliteStuds
  if (content.startsWith('/eliteStuds')) {
    const topMatch = content.match(/top:(\d+)/);
    const topX = topMatch ? parseInt(topMatch[1]) : 10;
    if (isNaN(topX)) return message.reply('❌ Invalid input. Use `/eliteStuds top:{x}`');

    await message.reply(`🔍 Fetching top ${topX} elite studs...`);

    try {
      const res = await fetch(`${BASE_URL}/api/elite-studs-enriched?limit=${topX}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const studs = await res.json();
      if (!studs?.length) return message.reply('⚠️ No elite studs found.');

      const chunks = [];
      for (let i = 0; i < studs.length; i += 5) chunks.push(studs.slice(i, i + 5));
      let n = 0;

      for (const chunk of chunks) {
        const msg = chunk.map((stud) => {
          const s = stud.stats || {};
          const podium = s.podium !== undefined ? `${s.podium}%` : 'N/A';
          const purse = s.largestPurse ? `${Math.round(s.largestPurse).toLocaleString()} Derby` : 'N/A';
          const statsLine = [
            `Start: ${s.start || '-'}`, `Speed: ${s.speed || '-'}`, `Stamina: ${s.stamina || '-'}`,
            `Finish: ${s.finish || '-'}`, `Heart: ${s.heart || '-'}`, `Temper: ${s.temper || '-'}`,
          ].join(' | ');
          n++;
          return `**Elite Stud ${n}: ${stud.name}**\n` +
            `🧬 Grade: ${s.grade || '-'} (${s.subgrade >= 0 ? '+' : ''}${s.subgrade})\n` +
            `${statsLine}\n🎯 Direction: ${s.direction?.value || '-'} | Surface: ${s.surface?.value || '-'}\n` +
            `🏆 Wins: ${s.wins || 0} | Majors: ${s.majorWins || 0} | Podium: ${podium}\n` +
            `💰 Largest Purse: ${purse}\n🔗 https://photofinish.live/horses/${stud.id}`;
        }).join('\n\n');
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
      return message.reply('🚫 Unauthorized user.');
    }

    message.reply('🔄 Updating data...');

    exec('bash ./run_full_pipeline.sh', (err, stdout, stderr) => {
      if (err) {
        console.error(`❌ Script error:\n${stderr}`);
        return message.reply('❌ Failed to run update script.');
      }
      console.log(`✅ Script output:\n${stdout}`);
      message.reply('✅ Data update completed.');
    });
    return;
  }

  // /winners
  if (content.startsWith('/winners')) {
    const directionMatch = content.match(/direction:(LeftTurning|RightTurning)/i);
    const surfaceMatch = content.match(/surface:(Dirt|Turf)/i);
    const topMatch = content.match(/top:(\d+)/);
    const directionFilter = directionMatch?.[1] || null;
    const surfaceFilter = surfaceMatch?.[1] || null;
    const limit = topMatch ? parseInt(topMatch[1]) : 10;

    try {
      const res = await fetch(`${BASE_URL}/api/winners`);
      const json = await res.json();
      const filtered = json.filter(stud => {
        const dir = stud.racing?.direction?.value;
        const surf = stud.racing?.surface?.value;
        return (!directionFilter || dir === directionFilter) &&
               (!surfaceFilter || surf === surfaceFilter);
      });
      const studs = filtered.slice(0, limit);
      let n = 0;

      for (const stud of studs) {
        const s = stud.racing || {};
        const stats = stud.stats || {};
        const sub = s.subgrade != null ? ` (${s.subgrade >= 0 ? '+' : ''}${s.subgrade})` : '';
        n++;

        const msg = `**Rank ${n}: ${stud.name}**\n` +
          `🧬 Grade: ${s.grade || '-'}${sub}\n` +
          `Start: ${s.start} | Speed: ${s.speed} | Stamina: ${s.stamina} | Finish: ${s.finish} | Heart: ${s.heart} | Temper: ${s.temper}\n` +
          `🎯 Direction: ${s.direction?.value || '-'} | Surface: ${s.surface?.value || '-'}\n` +
          `🏆 Wins: ${stats.wins || 0} | Majors: ${stats.majors || 0} | Podium: ${stats.podium || 'N/A'}%\n` +
          `💰 Biggest Purse: ${stats.biggestPurse ? `${Math.round(stats.biggestPurse).toLocaleString()} Derby` : 'N/A'}\n` +
          `🔗 https://photofinish.live/horses/${stud.id}`;

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`check_bloodline:${stud.id}`)
            .setLabel('🧬 Check Bloodline')
            .setStyle(ButtonStyle.Primary)
        );

        await message.reply({ content: msg, components: [row] });
        await delay(1000);
      }
    } catch (err) {
      console.error('❌ Winners fetch error:', err);
      message.reply('❌ An error occurred while fetching winning studs.');
    }
  }

  // /breed
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
      let res = await fetch(`${BASE_URL}/api/kd-targets`);
      if (!res.ok) throw new Error(`API responded with ${res.status}`);
      let data = await res.json();

      if (!data[mareId]) {
        await message.reply('⚠️ Mare not found in KD target matches. Extending search...');

        const mareRes = await fetch(`https://api.photofinish.live/pfl-pro/horse-api/${mareId}`, {
          headers: { 'x-api-key': process.env.PFL_API_KEY }
        });

        if (!mareRes.ok) return message.reply(`❌ Failed to fetch mare from PFL API (${mareRes.status})`);
        const mareData = await mareRes.json();
        const mare = mareData?.horse;
        if (!mare?.id) return message.reply('❌ Invalid mare received from PFL API.');

        await insertMareToDb(mare);
        await message.reply(`✅ Mare inserted into DB: [${mare.name}](https://photofinish.live/horses/${mare.id})`);

        await message.reply('⚙️ Generating new KD target matches...');
        await insertMatchesForMare(mareId);

        res = await fetch(`${BASE_URL}/api/kd-targets`);
        data = await res.json();
      }

      const match = data[mareId];
      if (!match) return message.reply('❌ Mare still not found in KD matches.');

      const mareName = match.mare_name || mareId;
      let studs = match.matches || [];
      studs.sort((a, b) => (b.stud_stats?.biggestPrize || 0) - (a.stud_stats?.biggestPrize || 0));
      studs = studs.slice(0, topX);

      if (!studs.length) return message.reply('⚠️ No suitable studs found.');

      const chunks = [];
      for (let i = 0; i < studs.length; i += 5) chunks.push(studs.slice(i, i + 5));
      let n = 0;

      for (const chunk of chunks) {
        const msg = chunk.map((stud) => {
          const stats = stud.stud_stats || {};
          const reason = stud.reason || 'N/A';
          const podium = stats.podium !== undefined ? `${stats.podium}%` : 'N/A';
          const biggest = stats.biggestPrize ? `${stats.biggestPrize.toLocaleString()} Derby` : 'N/A';
          const statsLine = [
            `Start: ${stats.start || '-'}`, `Speed: ${stats.speed || '-'}`, `Stamina: ${stats.stamina || '-'}`,
            `Finish: ${stats.finish || '-'}`, `Heart: ${stats.heart || '-'}`, `Temper: ${stats.temper || '-'}`,
          ].join(' | ');
          n++;
          return `**Match ${n}: ${mareName} x ${stud.stud_name}**\n` +
            `Score: ${stud.score} | Reason: ${reason}\n` +
            `🧬 Grade: ${stats.grade || '-'} (${stats.subgrade >= 0 ? '+' : ''}${stats.subgrade})\n` +
            `${statsLine}\n🎯 Direction: ${stats.direction?.value || '-'} | Surface: ${stats.surface?.value || '-'}\n` +
            `🏆 Wins: ${stats.wins || 0} | Majors: ${stats.majorWins || 0} | Podium: ${podium}\n` +
            `💰 Biggest Purse: ${biggest}\n🔗 https://photofinish.live/horses/${stud.stud_id}`;
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

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const horseId = interaction.customId.replace('check_bloodline:', '');
  await interaction.deferReply();

  try {
    const baseRes = await fetch(`${BASE_URL}/api/horse/${horseId}`);
    if (!baseRes.ok) throw new Error(`HTTP ${baseRes.status}`);
    const baseHorse = await baseRes.json();

    const allAncestorIds = await getAllAncestorsDeep(horseId, 3);
    const winnerIds = await fetch(`${BASE_URL}/api/winner-ids`).then(r => r.json());

    const kdWinners = [];
    for (const ancestorId of allAncestorIds) {
      const res = await fetch(`${BASE_URL}/api/horse/${ancestorId}`);
      if (!res.ok) continue;
      const h = await res.json();
      const races = h?.history?.raceSummaries || [];
      const kdWin = races.find(r => r.raceName === 'Kentucky Derby' && r.finishPosition === 1);
      if (kdWin) {
        kdWinners.push({ name: h.name || ancestorId, season: kdWin.season || '?' });
      }
    }

    const summary = `🧬 Bloodline of **${baseHorse.name}**\n` +
      `• Total Ancestors Checked: ${allAncestorIds.length}\n` +
      (kdWinners.length > 0
        ? '• **KD Winners in Lineage:**\n' + kdWinners.map(w => `  - ${w.name} (Season ${w.season})`).join('\n')
        : '• No major winners found in lineage.');

    await interaction.editReply(summary);
  } catch (err) {
    console.error('❌ Bloodline error:', err);
    await interaction.editReply('❌ Failed to resolve bloodline.');
  }
});

async function getAllAncestorsDeep(horseId, depth = 3, visited = new Set()) {
  if (depth === 0 || visited.has(horseId)) return [];
  visited.add(horseId);
  const res = await fetch(`${BASE_URL}/api/horse/${horseId}`);
  if (!res.ok) return [];
  const horse = await res.json();
  const ancestors = horse.simpleFamilyTree || [];
  let all = [...ancestors];
  for (const ancestorId of ancestors) {
    const subAncestors = await getAllAncestorsDeep(ancestorId, depth - 1, visited);
    all.push(...subAncestors);
  }
  return [...new Set(all)];
}

client.login(process.env.BOT_TOKEN);