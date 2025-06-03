//discord/handlers/breed.js
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, InteractionType } = require('discord.js');
const fetch = require('node-fetch');
const insertMareToDb = require('../../server/helpers/insertMareToDb');
const { insertMatchesForMare } = require('../../scripts/scoreKDTargets');

const BASE_URL = process.env.HOST?.replace(/\/$/, '');

module.exports = async function handleBreed(interaction) {
  if (
    interaction.type !== InteractionType.ModalSubmit ||
    interaction.customId !== 'breed_modal'
  ) return;

  console.log(`🧾 /breed submitted by ${interaction.user.username}`);
  await interaction.deferReply();

  const mareId = interaction.fields.getTextInputValue('mare_id');
  const race = interaction.fields.getTextInputValue('race_target');
  const topX = parseInt(interaction.fields.getTextInputValue('top_x')) || 10;

  try {
    // Step 1: Fetch existing KD targets
    let res = await fetch(`${BASE_URL}/api/kd-targets`);
    if (!res.ok) throw new Error(`API responded with ${res.status}`);
    let data = await res.json();

    // Step 2: If missing mare, fetch and insert
    if (!data[mareId]) {
      console.log(`🔎 Mare ${mareId} not in DB. Fetching from PFL...`);
      await interaction.followUp('⚠️ Mare not found in DB. Fetching from PFL...');

      const mareRes = await fetch(`https://api.photofinish.live/pfl-pro/horse-api/${mareId}`, {
        headers: { 'x-api-key': process.env.PFL_API_KEY }
      });

      if (!mareRes.ok) throw new Error(`Mare fetch failed: ${mareRes.status}`);
      const mare = (await mareRes.json())?.horse;
      if (!mare?.id) throw new Error(`No horse returned from PFL API`);

      await insertMareToDb(mare);
      await insertMatchesForMare(mareId);

      // Re-fetch the full list
      res = await fetch(`${BASE_URL}/api/kd-targets`);
      data = await res.json();
    }

    const match = data[mareId];

    if (!match) {
      console.warn(`❌ Still no match for ${mareId}`);
      return interaction.followUp('❌ Mare not found in KD target matches after insertion.');
    }

    const mareName = match.mare_name || mareId;
    let studs = match.matches || [];

    studs.sort((a, b) => (b.stud_stats?.biggestPrize || 0) - (a.stud_stats?.biggestPrize || 0));
    studs = studs.slice(0, topX);

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
    console.error('❌ Error in /breed handler:', err);
    await interaction.followUp('❌ Failed to process breeding request.');
  }
};