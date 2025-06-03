//discord/handlers/breed.js
const { InteractionType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { findBestBreedingPartners } = require('../../utils/bestMatchService');

module.exports = async function handleBestBreedMatch(interaction) {
  let mareId;
  let topXStudsInput;

  console.log(`🧾 /Best Breed Match submitted by ${interaction.user.username}`);

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
    // Destructure the 'error' field as well
    const { sortedResults, mareName, totalSimsRun, studsProcessedCount, error } = await findBestBreedingPartners(mareId, topXStuds);

    // Check for the specific error message first
    if (error) {
      await interaction.followUp({ content: error, ephemeral: true });
      return;
    }

    if (!sortedResults || sortedResults.length === 0 || studsProcessedCount === 0) {
      await interaction.followUp(`No suitable stud matches or simulation results found for mare ${mareName} (ID: ${mareId}) with the given criteria. This could be due to no studs meeting the filtering criteria or other issues.`);
      return;
    }

    // Initial follow-up to acknowledge the command and provide a summary
    await interaction.followUp({
        content: `Found ${studsProcessedCount} suitable stud(s) for **${mareName}** (ID: ${mareId}). Total simulations run: ${totalSimsRun}.\nDisplaying top results:`,
        ephemeral: false // Or true if you prefer the initial summary to be ephemeral
    });

    // Display top N results (e.g., up to 5 to keep embed clean)
    const resultsToShow = sortedResults.slice(0, 5); // Can adjust this limit

    for (const result of resultsToShow) {
      const foalTraitsString = Object.entries(result.bestFoal.traits)
        .map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`)
        .join(', ');

      const studEmbed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle(`Match: ${mareName} x ${result.stud.name}`)
        .addFields(
          { name: 'Stud', value: `[${result.stud.name} (ID: ${result.stud.id})](https://photofinish.live/horses/${result.stud.id})` },
          { name: 'Best Foal Projected Grade', value: `${result.bestFoal.overallGradeString} (Subgrade: ${result.bestFoal.subgrade})`, inline: true },
          { name: 'Weighted Trait Score', value: `${result.bestFoal.weightedScore.toFixed(2)}`, inline: true },
          { name: 'Projected Traits', value: foalTraitsString }
        )
        .setTimestamp();

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`run_10k_sim:${mareId}:${result.stud.id}`)
            .setLabel('Simulate 10k Foals')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setLabel('View Mare')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://photofinish.live/horses/${mareId}`),
          new ButtonBuilder()
            .setLabel('View Stud')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://photofinish.live/horses/${result.stud.id}`)
        );
      
      // Send each result as a new follow-up message
      await interaction.followUp({ embeds: [studEmbed], components: [row] });
    }
    
    if (sortedResults.length > resultsToShow.length) {
        await interaction.followUp({ content: `Showing top ${resultsToShow.length} of ${sortedResults.length} stud matches. More results were found but not displayed to keep the channel clean.`, ephemeral: true });
    }

  } catch (error) {
    console.error(`❌ Error in /bestbreedmatch handler for mare ID ${mareId}:`, error);
    await interaction.followUp({ content: `An error occurred while finding best breed matches for mare ID: ${mareId}. Please try again later.`, ephemeral: true });
  }
};