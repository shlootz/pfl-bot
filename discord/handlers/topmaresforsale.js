const {
  InteractionType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const fetch = require('node-fetch');
const { calculateSubgrade } = require('../../utils/calculateSubgrade');

const BASE_URL = process.env.HOST?.replace(/\/$/, '');

module.exports = async function handleTopMaresForSale(interaction) {
  if (
    interaction.type !== InteractionType.ModalSubmit ||
    interaction.customId !== 'topmares_modal'
  ) return;

  console.log(`🛒 /topmaresforsale submitted by ${interaction.user.username}`);
  await interaction.deferReply();

  const topX = parseInt(interaction.fields.getTextInputValue('top_x') || '20');
  const direction = interaction.fields.getTextInputValue('direction')?.trim();
  const surface = interaction.fields.getTextInputValue('surface')?.trim();
  const minSubRaw = interaction.fields.getTextInputValue('min_sub')?.trim();
  const minStatRaw = interaction.fields.getTextInputValue('min_stat')?.trim();

  const acceptedGrades = ['D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S-', 'S', 'S+', 'SS-', 'SS', 'SS+', 'SSS-', 'SSS'];
  const gradeRank = Object.fromEntries(acceptedGrades.map((g, i) => [g, i]));

  const traits = ['start', 'speed', 'stamina', 'finish', 'heart', 'temper'];

  const minStat = minStatRaw?.toUpperCase();
  const minStatValue = acceptedGrades.includes(minStat) ? gradeRank[minStat] : null;
  const minSub = isNaN(parseInt(minSubRaw)) ? null : parseInt(minSubRaw);

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

        if (direction && stats.direction?.value !== direction) return false;
        if (surface && stats.surface?.value !== surface) return false;
        if (minSub != null && m.subgrade < minSub) return false;

        if (minStatValue != null) {
          const allTraitsAbove = traits.every((t) => {
            const g = (stats[t] || 'D-').toUpperCase();
            return gradeRank[g] >= minStatValue;
          });
          if (!allTraitsAbove) return false;
        }

        return true;
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
        `Start: ${s.start || '-'}`,
        `Speed: ${s.speed || '-'}`,
        `Stamina: ${s.stamina || '-'}`,
        `Finish: ${s.finish || '-'}`,
        `Heart: ${s.heart || '-'}`,
        `Temper: ${s.temper || '-'}`
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