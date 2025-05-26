// discord/bot.js
require('dotenv').config();
const {
  Client, GatewayIntentBits,
  SlashCommandBuilder, Routes,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle,
  InteractionType, REST
} = require('discord.js');

const fetch = require('node-fetch');
const insertMareToDb = require('../server/helpers/insertMareToDb');
const { insertMatchesForMare } = require('../scripts/scoreKDTargets');
//const calculateSubgrade = require('../utils/calculateSubgrade');
const { calculateSubgrade } = require('../utils/calculateSubgrade');

const BASE_URL = process.env.HOST?.replace(/\/$/, '');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

const commands = [
  new SlashCommandBuilder().setName('breed').setDescription('Breed a mare with optimal studs'),
  new SlashCommandBuilder().setName('winners').setDescription('View top studs by biggest purse with filters'),
  new SlashCommandBuilder().setName('topmaresforsale').setDescription('Find top mares for sale based on filters'),
  new SlashCommandBuilder().setName('elitestuds').setDescription('Show top elite studs by trait grade'),
  new SlashCommandBuilder().setName('updatedata').setDescription('Refresh bot database (authorized only)'),
  new SlashCommandBuilder().setName('help').setDescription('List all available bot commands and usage')
];

(async () => {
  try {
    console.log('📡 Registering slash commands...');
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: commands
    });
    console.log('✅ All slash commands registered');
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
})();

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  const { exec } = require('child_process'); //used by updateData

  if (interaction.isChatInputCommand() && interaction.commandName === 'help') {
    const embed = new EmbedBuilder()
      .setTitle('📖 Bot Commands Help')
      .setColor(0x00BFFF)
      .setDescription('Here are the available commands:')
      .addFields(
        {
          name: '/breed',
          value: 'Breed a mare with optimal studs. Prompts a modal for Mare ID, Race Target, and Top X studs.'
        },
        {
          name: '/topmaresforsale',
          value: 'Shows top X mares for sale filtered by direction, surface, and min subgrade.'
        },
        {
          name: '/winners',
          value: 'Lists top studs by biggest single race purse. Optional filters for direction and surface.'
        },
        {
          name: '/elitestuds',
          value: 'Displays top elite studs based on high-grade traits: SS Heart/Stamina, S+ Speed, S+ Start/Temper.'
        },
        {
          name: '/updatedata',
          value: 'Triggers a full data refresh. Restricted to authorized users.'
        },
        {
          name: '/help',
          value: 'Displays this help message with all available commands.'
        }
      )
      .setFooter({ text: 'Photo Finish Live Discord Bot', iconURL: client.user.displayAvatarURL() });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'updatedata') {
    const authorizedUserId = process.env.OWNER_USER_ID;

    if (interaction.user.id !== authorizedUserId) {
      return interaction.reply({
        content: '🚫 You are not authorized to run this command.',
        ephemeral: true
      });
    }

    await interaction.reply('🔄 Starting full data update. This may take a few minutes...');

    exec('bash ./run_full_pipeline.sh', (err, stdout, stderr) => {
      if (err) {
        console.error(`❌ Update script error:\n${stderr}`);
        return interaction.followUp('❌ Failed to run update script.');
      }

      console.log(`✅ Update script output:\n${stdout}`);
      interaction.followUp('✅ Data update completed successfully.');
    });
  }

  try {
    // Slash Command: /eliteStuds → open modal
    if (interaction.isChatInputCommand() && interaction.commandName === 'elitestuds') {
      const modal = new ModalBuilder()
        .setCustomId('elitestuds_modal')
        .setTitle('Elite Studs');

      const topInput = new TextInputBuilder()
        .setCustomId('top_x')
        .setLabel('Top X (default: 10)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue('10');

      modal.addComponents(new ActionRowBuilder().addComponents(topInput));
      await interaction.showModal(modal);
    }
    // SLASH: /breed
    if (interaction.isChatInputCommand() && interaction.commandName === 'breed') {
      console.log(`📥 Received /breed from ${interaction.user.username}`);
      const modal = new ModalBuilder().setCustomId('breed_modal').setTitle('Breed Mare');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('mare_id')
            .setLabel('Enter Mare ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('race_target')
            .setLabel('Enter Race Target (e.g. kentucky-derby)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue('Kentucky Derby')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('top_x')
            .setLabel('Top X Studs')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue('10')
        )
      );

      await interaction.showModal(modal);
      return;
    }

    // MODAL SUBMIT
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'breed_modal') {
      console.log(`🧾 Modal submitted by ${interaction.user.username}`);
      await interaction.deferReply();

      const mareId = interaction.fields.getTextInputValue('mare_id');
      const race = interaction.fields.getTextInputValue('race_target');
      const topX = parseInt(interaction.fields.getTextInputValue('top_x'));

      console.log(`➡️ Inputs: mareId=${mareId}, race=${race}, topX=${topX}`);

      try {
        let res = await fetch(`${BASE_URL}/api/kd-targets`);
        if (!res.ok) throw new Error(`API responded with ${res.status}`);
        let data = await res.json();

        // If mare not found — fetch & insert
        if (!data[mareId]) {
          console.log(`🔎 Mare ${mareId} not found in KD targets. Fetching from PFL API...`);
          await interaction.followUp('⚠️ Mare not found in DB. Fetching from PFL...');

          const mareRes = await fetch(`https://api.photofinish.live/pfl-pro/horse-api/${mareId}`, {
            headers: { 'x-api-key': process.env.PFL_API_KEY }
          });

          if (!mareRes.ok) throw new Error(`Could not fetch mare: ${mareRes.status}`);
          const mare = (await mareRes.json())?.horse;
          if (!mare?.id) throw new Error(`No horse returned from PFL API`);

          console.log(`✅ Fetched mare ${mare.name} (${mare.id}) from API`);
          await insertMareToDb(mare);
          await insertMatchesForMare(mareId);

          // Refresh KD targets after insert
          res = await fetch(`${BASE_URL}/api/kd-targets`);
          data = await res.json();
        }

        const match = data[mareId];
        if (!match) {
          console.warn(`❌ Mare ${mareId} still not found after insertion`);
          return interaction.followUp('❌ Mare not found in KD target matches after insertion.');
        }

        const mareName = match.mare_name || mareId;
        let studs = match.matches || [];

        studs.sort((a, b) => (b.stud_stats?.biggestPrize || 0) - (a.stud_stats?.biggestPrize || 0));
        studs = studs.slice(0, topX);

        if (!studs.length) {
          console.warn(`⚠️ No studs found for ${mareName}`);
          return interaction.followUp('⚠️ No suitable studs found.');
        }

        console.log(`🎯 Returning top ${studs.length} matches for mare ${mareName}`);

        for (const stud of studs) {
          const stats = stud.stud_stats;
          const embed = new EmbedBuilder()
            .setTitle(`Match: ${mareName} x ${stud.stud_name}`)
            .setURL(`https://photofinish.live/horses/${stud.stud_id}`)
            .setColor(0x00AEEF)
            .addFields(
              { name: 'Score / Reason', value: `${stud.score} | ${stud.reason}`, inline: true },
              { name: 'Grade', value: `${stats.grade} (${stats.subgrade >= 0 ? '+' : ''}${stats.subgrade})`, inline: true },
              { name: 'Direction / Surface', value: `${stats.direction?.value || '-'} / ${stats.surface?.value || '-'}`, inline: true },
              {
                name: 'Traits',
                value: `Start: ${stats.start} | Speed: ${stats.speed} | Stamina: ${stats.stamina}\nFinish: ${stats.finish} | Heart: ${stats.heart} | Temper: ${stats.temper}`
              },
              {
                name: 'Stats',
                value: `🏆 Wins: ${stats.wins} | Majors: ${stats.majorWins} | Podium: ${stats.podium}%\n💰 Purse: ${Math.round(stats.biggestPrize).toLocaleString()} Derby`
              }
            );

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`check_bloodline:${stud.stud_id}`)
              .setLabel('🧬 Check Bloodline')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setLabel('🔗 View on PFL')
              .setStyle(ButtonStyle.Link)
              .setURL(`https://photofinish.live/horses/${stud.stud_id}`)
          );

          await interaction.followUp({ embeds: [embed], components: [row] });
        }
      } catch (err) {
        console.error('❌ Error in /breed modal logic:', err);
        await interaction.followUp('❌ Failed to process breeding request.');
      }
    }
  } catch (err) {
    console.error('❌ Global interaction handler error:', err);
  }
});

// Register /winners command
rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
  body: [
    new SlashCommandBuilder()
      .setName('breed')
      .setDescription('Breed a mare with optimal studs'),
    new SlashCommandBuilder()
      .setName('winners')
      .setDescription('View top studs by biggest purse with filters')
  ]
});

// Handle /winners modal
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'winners') {
    const modal = new ModalBuilder()
      .setCustomId('winners_modal')
      .setTitle('Top Stud Winners');

    const topInput = new TextInputBuilder()
      .setCustomId('top_x')
      .setLabel('Top X (default: 10)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue('10');

    const directionInput = new TextInputBuilder()
      .setCustomId('direction')
      .setLabel('Direction (LeftTurning / RightTurning)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue('LeftTurning');

    const surfaceInput = new TextInputBuilder()
      .setCustomId('surface')
      .setLabel('Surface (Dirt / Turf)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue('Dirt');

    modal.addComponents(
      new ActionRowBuilder().addComponents(topInput),
      new ActionRowBuilder().addComponents(directionInput),
      new ActionRowBuilder().addComponents(surfaceInput)
    );

    await interaction.showModal(modal);
  }

  if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'elitestuds_modal') {
  await interaction.deferReply();

  const topX = parseInt(interaction.fields.getTextInputValue('top_x') || '10');

  try {
    const res = await fetch(`${BASE_URL}/api/elite-studs-enriched?limit=${topX}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const studs = await res.json();
    if (!studs?.length) return interaction.followUp('⚠️ No elite studs found.');

    let n = 1;
    for (const stud of studs) {
      const s = stud.stats || {};
      const podium = s.podium !== undefined ? `${s.podium}%` : 'N/A';
      const purse = s.largestPurse ? `${Math.round(s.largestPurse).toLocaleString()} Derby` : 'N/A';

      const embed = new EmbedBuilder()
        .setTitle(`Elite Stud #${n++}: ${stud.name}`)
        .setURL(`https://photofinish.live/horses/${stud.id}`)
        .setColor(0xA21CAF)
        .addFields(
          { name: 'Grade', value: `${s.grade || '-'} (${s.subgrade >= 0 ? '+' : ''}${s.subgrade})`, inline: true },
          { name: 'Direction / Surface', value: `${s.direction?.value || '-'} / ${s.surface?.value || '-'}`, inline: true },
          { name: 'Traits', value: `Start: ${s.start || '-'} | Speed: ${s.speed || '-'} | Stamina: ${s.stamina || '-'}\nFinish: ${s.finish || '-'} | Heart: ${s.heart || '-'} | Temper: ${s.temper || '-'}` },
          { name: 'Stats', value: `🏆 Wins: ${s.wins || 0} | Majors: ${s.majorWins || 0} | Podium: ${podium}\n💰 Largest Purse: ${purse}` }
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`check_bloodline:${stud.id}`)
          .setLabel('🧬 Check Bloodline')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setLabel('🔗 View on PFL')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://photofinish.live/horses/${stud.id}`)
      );

      await interaction.followUp({ embeds: [embed], components: [row] });
    }
  } catch (err) {
    console.error('❌ Error loading elite studs:', err);
    await interaction.followUp('❌ Failed to load elite studs.');
  }
}

  // Handle modal submit for /winners
  if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'winners_modal') {
    await interaction.deferReply();

    const topX = parseInt(interaction.fields.getTextInputValue('top_x') || '10');
    const direction = interaction.fields.getTextInputValue('direction')?.trim();
    const surface = interaction.fields.getTextInputValue('surface')?.trim();

    try {
      const res = await fetch(`${BASE_URL}/api/winners`);
      const studs = await res.json();

      const filtered = studs.filter((s) => {
        const d = s.racing?.direction?.value;
        const sfc = s.racing?.surface?.value;
        return (!direction || d === direction) && (!surface || sfc === surface);
      }).slice(0, topX);

      if (!filtered.length) return interaction.followUp('⚠️ No matching studs found.');

      for (const stud of filtered) {
        const r = stud.racing || {};
        const stats = stud.stats || {};
        const embed = new EmbedBuilder()
          .setTitle(`🏆 ${stud.name}`)
          .setColor(0xFFD700)
          .setURL(`https://photofinish.live/horses/${stud.id}`)
          .addFields(
            { name: 'Grade', value: `${r.grade || '-'} (${r.subgrade >= 0 ? '+' : ''}${r.subgrade || 0})`, inline: true },
            { name: 'Score / Reason', value: `${stud.score} | ${stud.reason}`, inline: true },
            { name: 'Traits', value: `Start: ${r.start} | Speed: ${r.speed} | Stamina: ${r.stamina}\nFinish: ${r.finish} | Heart: ${r.heart} | Temper: ${r.temper}` },
            { name: 'Racing Style', value: `${r.direction?.value || '-'} | ${r.surface?.value || '-'}`, inline: true },
            { name: 'Stats', value: `Wins: ${stats.wins} | Majors: ${stats.majors} | Podium: ${stats.podium}%\n💰 Purse: ${Math.round(stats.biggestPurse).toLocaleString()} Derby` }
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`check_bloodline:${stud.id}`)
            .setLabel('🧬 Check Bloodline')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setLabel('🔗 View on PFL')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://photofinish.live/horses/${stud.id}`)
        );

        await interaction.followUp({ embeds: [embed], components: [row] });
      }
    } catch (err) {
      console.error('❌ Error in /winners modal:', err);
      await interaction.followUp('❌ Failed to fetch winners.');
    }
  }
});

// Register /topMaresForSale
rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
  body: [
    // existing ones...
    new SlashCommandBuilder()
      .setName('topmaresforsale')
      .setDescription('Find top mares for sale based on filters')
  ]
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'topmaresforsale') {
    const modal = new ModalBuilder()
      .setCustomId('topmares_modal')
      .setTitle('Top Mares For Sale');

    const topInput = new TextInputBuilder()
      .setCustomId('top_x')
      .setLabel('Top X (default: 20)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue('20');

    const dirInput = new TextInputBuilder()
      .setCustomId('direction')
      .setLabel('Direction (LeftTurning/RightTurning)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue('LeftTurning');

    const surfInput = new TextInputBuilder()
      .setCustomId('surface')
      .setLabel('Surface (Dirt/Turf)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue('Dirt');

    const minSub = new TextInputBuilder()
      .setCustomId('min_sub')
      .setLabel('Min Subgrade (e.g. +1)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setValue('+1');

    modal.addComponents(
      new ActionRowBuilder().addComponents(topInput),
      new ActionRowBuilder().addComponents(dirInput),
      new ActionRowBuilder().addComponents(surfInput),
      new ActionRowBuilder().addComponents(minSub)
    );

    await interaction.showModal(modal);
  }

  // 🧬 Modal logic for Top Mares For Sale
if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'topmares_modal') {
  await interaction.deferReply();

  const topX = parseInt(interaction.fields.getTextInputValue('top_x') || '20');
  const direction = interaction.fields.getTextInputValue('direction') || 'LeftTurning';
  const surface = interaction.fields.getTextInputValue('surface') || 'Dirt';
  const minSub = parseInt(interaction.fields.getTextInputValue('min_sub') || '1');

  try {
    const res = await fetch(`${BASE_URL}/api/marketplace-mares`);
    if (!res.ok) throw new Error(`API responded with ${res.status}`);
    const mares = await res.json();

    const filtered = mares
      .map((mare) => {
        const stats = mare?.racing || {};
        const sub = calculateSubgrade(stats.grade, stats);
        return {
          ...mare,
          subgrade: sub,
        };
      })
      .filter((m) => {
        const stats = m.racing || {};
        return (
          stats.direction?.value === direction &&
          stats.surface?.value === surface &&
          m.subgrade >= minSub
        );
      })
      .sort((a, b) => (b.listing?.price?.value || 0) - (a.listing?.price?.value || 0))
      .slice(0, topX);

    if (!filtered.length) return interaction.followUp('⚠️ No matching mares found in marketplace.');

    for (const mare of filtered) {
      const s = mare.racing || {};
      const price = mare.listing?.price?.value || 0;
      const statsLine = [
        `Start: ${s.start || '-'}`, `Speed: ${s.speed || '-'}`, `Stamina: ${s.stamina || '-'}`,
        `Finish: ${s.finish || '-'}`, `Heart: ${s.heart || '-'}`, `Temper: ${s.temper || '-'}`,
      ].join(' | ');

      const embed = new EmbedBuilder()
        .setTitle(mare.name || 'Unnamed Mare')
        .setColor(0xEC4899)
        .setURL(`https://photofinish.live/horses/${mare.id}`)
        .addFields(
          { name: 'Subgrade', value: `${s.grade || '-'} (${mare.subgrade >= 0 ? '+' : ''}${mare.subgrade})`, inline: true },
          { name: 'Price', value: `${price.toLocaleString()} Derby`, inline: true },
          { name: 'Direction / Surface', value: `${s.direction?.value || '-'} / ${s.surface?.value || '-'}`, inline: true },
          { name: 'Traits', value: statsLine }
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('🔗 View on PFL')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://photofinish.live/horses/${mare.id}`)
      );

      await interaction.followUp({ embeds: [embed], components: [row] });
    }
  } catch (err) {
    console.error('❌ Error fetching marketplace mares:', err);
    await interaction.followUp('❌ Failed to load marketplace mares.');
  }
}
});

client.login(process.env.BOT_TOKEN);