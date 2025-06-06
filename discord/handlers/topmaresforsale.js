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
  // ✅ Early exit unless this is a modal submit from topmares_modal
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
  const gradeRank = Object.fromEntries(acceptedGrades.map((g, i) => [g, i]));
  const traits = ['start', 'speed', 'stamina', 'finish', 'heart', 'temper'];

  const minStatInputRaw = interaction.fields.getTextInputValue('min_stat')?.trim().toUpperCase();
  const hasTraitFilter = acceptedGrades.includes(minStatInputRaw);
  const minStatValue = hasTraitFilter ? gradeRank[minStatInputRaw] : null;

  try {
    const res = await fetch(`${BASE_URL}/api/marketplace-mares`);
    if (!res.ok) throw new Error(`API responded with ${res.status}`);
    const mares = await res.json();
    console.log(`🔍 Retrieved ${mares.length} mares from marketplace`);

    const withSubgrades = mares.map((mare) => {
      const stats = mare?.racing || {};
      const sub = calculateSubgrade(stats.grade, stats);
      return { ...mare, subgrade: sub };
    });

    const afterDirectionSurface = withSubgrades.filter((m) => {
      const stats = m.racing || {};
      return stats.direction?.value === direction && stats.surface?.value === surface;
    });
    console.log(`📏 After direction & surface filter: ${afterDirectionSurface.length}`);

    const afterSubgrade = afterDirectionSurface.filter((m) => m.subgrade >= minSub);
    console.log(`⭐️ After subgrade filter (≥ ${minSub}): ${afterSubgrade.length}`);

    const filtered = afterSubgrade.filter((m) => {
      if (!hasTraitFilter) return true;

      const stats = m.racing || {};
      return traits.every((t) => {
        const raw = stats[t];
        if (!raw) return true; // skip missing
        const grade = raw.trim().toUpperCase();
        const rank = gradeRank[grade];
        if (rank == null) return true; // skip unknown
        return rank >= minStatValue;
      });
    });

    if (hasTraitFilter) {
      console.log(`📊 After trait filter (≥ ${minStatInputRaw}): ${filtered.length}`);
    }

    const sorted = filtered
      .sort((a, b) => {
        const purseA = a.history?.relevantRaceStats?.biggestPrize?.consolidatedValue?.value || 0;
        const purseB = b.history?.relevantRaceStats?.biggestPrize?.consolidatedValue?.value || 0;
        return purseB - purseA;
      })
      .slice(0, topX);

    if (!sorted.length) {
      return interaction.followUp('⚠️ No matching mares found in marketplace.');
    }

    for (const mare of sorted) {
      const s = mare.racing || {};
      const purse = mare.history?.relevantRaceStats?.biggestPrize?.consolidatedValue?.value || 0;
      const price = mare.listing?.price?.value || mare.listing_details?.price?.value || 0;

      const statsLine = [
        `Start: ${s.start || '-'}`,
        `Speed: ${s.speed || '-'}`,
        `Stamina: ${s.stamina || '-'}`,
        `Finish: ${s.finish || '-'}`,
        `Heart: ${s.heart || '-'}`,
        `Temper: ${s.temper || '-'}`
      ].join(' | ');

      const prefLine = [
        `${s.surface?.value || '-'}: ${s.surface?.weight ?? '-'}`,
        `${s.condition?.value || '-'}: ${s.condition?.weight ?? '-'}`,
        `${s.direction?.value || '-'}: ${s.direction?.weight ?? '-'}`
      ].join(', ');

      const embed = new EmbedBuilder()
        .setTitle(mare.name || 'Unnamed Mare')
        .setColor(0xEC4899)
        .setURL(`https://photofinish.live/horses/${mare.id}`)
        .addFields(
          { name: 'Grade | Subgrade', value: `${s.grade || '-'} (${mare.subgrade >= 0 ? '+' : ''}${mare.subgrade})`, inline: true },
          { name: 'Top Purse Won', value: `${purse.toLocaleString()} Derby`, inline: true },
          { name: 'Price (if listed)', value: `${price.toLocaleString()} Derby`, inline: true },
          { name: 'Direction / Surface', value: `${s.direction?.value || '-'} / ${s.surface?.value || '-'}`, inline: true },
          { name: 'Preference Weights min: 0 max: 3', value: prefLine },
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