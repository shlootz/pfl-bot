const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, InteractionType } = require('discord.js');
const fetch = require('node-fetch');
const insertMareToDb = require('../../server/helpers/insertMareToDb');
const { insertMatchesForMare } = require('../../scripts/scoreKDTargets');
const { fetchMareWithRetries } = require('../../scripts/fetchMaresFromAPI');

const BASE_URL = process.env.HOST?.replace(/\/$/, '');

module.exports = async function handleBreed(interaction) {
  if (
    interaction.type !== InteractionType.ModalSubmit ||
    interaction.customId !== 'breed_modal'
  ) {
    return;
  }

  console.log(`🧾 /breed submitted by ${interaction.user.username}`);
  await interaction.deferReply();

  const mareId = interaction.fields.getTextInputValue('mare_id');
  const race = interaction.fields.getTextInputValue('race_target');
  const topX = parseInt(interaction.fields.getTextInputValue('top_x')) || 10;

  try {
    let res = await fetch(`${BASE_URL}/api/kd-targets`);
    if (!res.ok) throw new Error(`API responded with ${res.status}`);
    let data = await res.json();

    if (!data[mareId]) {
      console.log(`🔎 Mare ${mareId} not in KD targets. Checking marketplace_mares...`);
      await interaction.followUp('⚠️ Mare not found in KD targets. Checking local marketplace cache...');

      let mare;

      // Check marketplace cache
      const marketMaresRes = await fetch(`${BASE_URL}/api/marketplace-mares`);
      if (marketMaresRes.ok) {
        const marketMares = await marketMaresRes.json();
        mare = marketMares.find((m) => m.id === mareId);
        if (mare) {
          console.log(`✅ Found mare ${mareId} in marketplace_mares`);
        }
      }

      // Fallback to API
      if (!mare) {
        console.log(`📡 Mare ${mareId} not in marketplace_mares. Fetching from PFL API...`);
        await interaction.followUp('📡 Fetching mare from PFL API...');
        mare = await fetchMareWithRetries(mareId);

        console.log('breed.js reads this mare id: '+mare.horse.id);
        if (!mare.horse?.id) {
          console.warn(`❌ Failed to fetch mare ${mareId} from PFL API`);
          return await interaction.followUp(`❌ Mare **${mareId}** could not be found in marketplace or PFL API. It may be invalid or delisted.`);
        }

        console.log(`✅ Successfully fetched mare ${mareId}`);
      }

      // Save and score
      console.log(`??? Attempting to insert into scoring DB`);
      //await insertMareToDb(mare.horse);
      await insertMareToDb(mare);
      await insertMatchesForMare(mareId);

      res = await fetch(`${BASE_URL}/api/kd-targets`);
      data = await res.json();
    }

    const match = data[mareId];
    if (!match) {
      console.warn(`❌ Still no match for ${mareId}`);
      return interaction.followUp('❌ Mare not found in KD target matches after insertion.');
    }

    const mareName = match.mare_name || mareId;
    let studs = (match.matches || []).sort((a, b) =>
      (b.stud_stats?.biggestPrize || 0) - (a.stud_stats?.biggestPrize || 0)
    ).slice(0, topX);

    if (!studs.length) {
      return interaction.followUp('⚠️ No suitable studs found.');
    }

    console.log(`🎯 Showing ${studs.length} matches for ${mareName}`);

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
          .setCustomId(`check_bloodline:${stud.stud_id}:${encodeURIComponent(race)}`)
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
    console.error('❌ Error in /breed handler:', err);
    await interaction.followUp('❌ Failed to process breeding request.');
  }
};