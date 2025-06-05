const { EmbedBuilder } = require('discord.js');
const { horseBloodlineWinHistory } = require('../../utils/horseBloodlineWinHistory');

module.exports = async function handleCheckBloodline(interaction) {
  // Expected custom ID format: check_bloodline:<studId>:<raceName>
  const parts = interaction.customId?.split(':');
  if (!parts || parts.length < 2 || !parts[1]) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferReply({ ephemeral: true });
    }
    await interaction.editReply({ content: '❌ Invalid bloodline check format.' });
    return;
  }

  const [, studId, encodedRace] = parts;
  const raceName = decodeURIComponent(encodedRace || 'Kentucky Derby');

  if (!interaction.replied && !interaction.deferred) {
    await interaction.deferReply({ ephemeral: true });
  }

  try {
    console.log(`🧪 Parsed CheckBloodline - Stud ID: ${studId}, Race: ${raceName}`);

    const result = await horseBloodlineWinHistory(studId, [raceName], 3);

    const summaryLines = [];

    if (result.selfPodiumRaces?.length) {
      summaryLines.push(`🏇 **${result.horseName} has podiums in:** ${result.selfPodiumRaces.join(', ')}`);
    } else {
      summaryLines.push(`😕 ${result.horseName} has no podium finishes in the "${raceName}".`);
    }

    const gens = Object.entries(result.ancestry || {})
      .filter(([key]) => key.startsWith('gen_'))
      .sort(([a], [b]) => parseInt(a.split('_')[1]) - parseInt(b.split('_')[1]));

    for (const [genKey, horses] of gens) {
      const genNum = genKey.split('_')[1];
      const raceSummaries = horses.map(h => `${h.name || h.id} (${h.races.join(', ')})`);
      summaryLines.push(`📜 Gen ${genNum}: ${raceSummaries.join(', ')}`);
    }

    const embed = new EmbedBuilder()
      .setTitle('🧬 Bloodline Win History')
      .setDescription(summaryLines.join('\n'))
      .setColor(0x00AEEF)
      .setFooter({ text: 'Photo Finish Bot • Bloodline Checker' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

  } catch (err) {
    console.error('❌ Error in checkBloodline handler:', err);
    await interaction.editReply({ content: '❌ Failed to fetch bloodline info. Please try again later.' });
  }
};