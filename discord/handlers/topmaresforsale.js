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
  const direction = interaction.fields.getTextInputValue('direction') || 'LeftTurning';
  const surface = interaction.fields.getTextInputValue('surface') || 'Dirt';
  const minSub = parseInt(interaction.fields.getTextInputValue('min_sub') || '1');
  const acceptedGrades = ['D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S-', 'S', 'S+', 'SS-', 'SS', 'SS+', 'SSS-', 'SSS'];
  const minStatInput = (interaction.fields.getTextInputValue('min_stat') || 'S').toUpperCase();

  if (!acceptedGrades.includes(minStatInput)) {
    return interaction.followUp(`❌ Invalid "Min Stat" value: \`${minStatInput}\`. Must be one of: ${acceptedGrades.join(', ')}`);
  }

  const minStat = minStatInput;

  const gradeRank = {
  'D-': 0, 'D': 1, 'D+': 2,
  'C-': 3, 'C': 4, 'C+': 5,
  'B-': 6, 'B': 7, 'B+': 8,
  'A-': 9, 'A': 10, 'A+': 11,
  'S-': 12, 'S': 13, 'S+': 14,
  'SS-': 15, 'SS': 16, 'SS+': 17,
  'SSS-': 18, 'SSS': 19
  };

  const minStatValue = gradeRank[minStat.toUpperCase()] ?? 5;
  const traits = ['start', 'speed', 'stamina', 'finish', 'heart', 'temper'];

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
        const allTraitsAboveThreshold = traits.every((t) => {
          const grade = (stats[t] || 'D-').toUpperCase();
          return gradeRank[grade] >= minStatValue;
        });

        return (
          stats.direction?.value === direction &&
          stats.surface?.value === surface &&
          m.subgrade >= minSub &&
          allTraitsAboveThreshold
        );
      })

      .sort((a, b) => (b.listing?.price?.value || 0) - (a.listing?.price?.value || 0))
      .slice(0, topX);

    if (!filtered.length) {
      return interaction.followUp('⚠️ No matching mares found in marketplace.');
    }

    for (const mare of filtered) {
      const s = mare.racing || {};
      const price = mare.listing?.price?.value || mare.listing_details?.price?.value || 0;

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