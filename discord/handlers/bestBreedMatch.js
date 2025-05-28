const { InteractionType, EmbedBuilder } = require('discord.js');
const { findBestBreedingPartners } = require('../../utils/bestMatchService');

module.exports = async function handleBestBreedMatch(interaction) {
  let mareId;
  let topXStudsInput;

  if (interaction.type === InteractionType.ApplicationCommand && interaction.commandName === 'bestbreedmatch') {
    mareId = interaction.options.getString('mare_id');
    topXStudsInput = interaction.options.getInteger('top_x_studs');
    console.log(`🌟 /bestbreedmatch slash command initiated by ${interaction.user.username} for mare ID: ${mareId}, top X: ${topXStudsInput}`);
  } else if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'bestbreedmatch_modal') {
    mareId = interaction.fields.getTextInputValue('mare_id');
    topXStudsInput = interaction.fields.getTextInputValue('top_x_studs');
    console.log(`🌟 bestbreedmatch_modal submitted by ${interaction.user.username} for mare ID: ${mareId}, top X: ${topXStudsInput}`);
  } else {
    return; // Not for this handler
  }

  const topXStuds = parseInt(topXStudsInput, 10);
  if (isNaN(topXStuds) || topXStuds <= 0) {
      await interaction.reply({ content: 'Invalid number for "Top X Studs". Please provide a positive integer.', ephemeral: true });
      return;
  }

  console.log(`   Parameters: Mare ID: ${mareId}, Top X Studs: ${topXStuds}`);
  await interaction.deferReply();

  try {
    const { sortedResults, mareName, totalSimsRun, studsProcessedCount } = await findBestBreedingPartners(mareId, topXStuds);

    if (!sortedResults || sortedResults.length === 0 || studsProcessedCount === 0) {
      await interaction.followUp(`No suitable stud matches or simulation results found for mare ${mareName} (ID: ${mareId}) with the given criteria.`);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0xFFD700) // Gold color
      .setTitle(`🏆 Best Breeding Matches for ${mareName}`)
      .setDescription(`Simulated 1000 foals for each of the top ${studsProcessedCount} suitable studs. Total simulations: ${totalSimsRun}.`)
      .setTimestamp();

    // Display top N results (e.g., up to 5 to keep embed clean)
    const resultsToShow = sortedResults.slice(0, 5);

    resultsToShow.forEach(result => {
      const foalTraitsString = Object.entries(result.bestFoal.traits)
        .map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`)
        .join(', ');

      embed.addFields({
        name: `Stud: ${result.stud.name} (ID: ${result.stud.id})`,
        value: `**Best Foal Projected Grade:** ${result.bestFoal.overallGradeString} (Subgrade: ${result.bestFoal.subgrade})\n` +
               `**Weighted Trait Score:** ${result.bestFoal.weightedScore.toFixed(2)}\n` +
               `**Projected Traits:** ${foalTraitsString}\n` +
               `PFL Link: [View Stud](https://photofinish.live/horses/${result.stud.id})`
      });
    });
    
    if (sortedResults.length > resultsToShow.length) {
        embed.setFooter({ text: `Showing top ${resultsToShow.length} of ${sortedResults.length} stud matches.` });
    }

    await interaction.followUp({ embeds: [embed] });

  } catch (error) {
    console.error(`❌ Error in /bestbreedmatch handler for mare ID ${mareId}:`, error);
    await interaction.followUp({ content: `An error occurred while finding best breed matches for mare ID: ${mareId}. Please try again later.`, ephemeral: true });
  }
};