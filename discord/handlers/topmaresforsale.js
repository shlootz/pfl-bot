const {
  InteractionType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const fetch = require('node-fetch');
const { calculateSubgrade } = require('../../utils/calculateSubgrade'); // assumes subgrade function is in utils

const BASE_URL = process.env.HOST?.replace(/\/$/, '');

module.exports = async function handleTopMaresForSale(interaction) {
  if (
    interaction.type !== InteractionType.ModalSubmit ||
    interaction.customId !== 'topmares_modal'
  ) return;

  console.log(`🛒 /topmaresforsale submitted by ${interaction.user.username}`);
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

    if (!filtered.length) {
      return interaction.followUp('⚠️ No matching mares found in marketplace.');
    }

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
    console.error('❌ Error fetching top mares:', err);
    await interaction.followUp('❌ Failed to load top mares.');
  }
};