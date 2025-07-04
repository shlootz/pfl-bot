const { InteractionType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { findBestBreedingPartners } = require('../../utils/bestMatchService');

module.exports = async function handleBestBreedMatch(interaction) {
  let mareId;
  let topXStudsInput;

  console.log(`🧾 /Best Breed Match submitted by ${interaction.user.username}`);

  if (interaction.type === InteractionType.ApplicationCommand && interaction.commandName === 'bestbreedmatch') {
    mareId = interaction.options.getString('mare_id');
    topXStudsInput = interaction.options.getInteger('top_x_studs');
    console.log(`🌟 /bestbreedmatch slash command initiated for Mare ID: ${mareId}, Top X: ${topXStudsInput}`);
  } else if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'bestbreedmatch_modal') {
    mareId = interaction.fields.getTextInputValue('mare_id');
    topXStudsInput = interaction.fields.getTextInputValue('top_x_studs');
    console.log(`🌟 bestbreedmatch_modal submitted for Mare ID: ${mareId}, Top X: ${topXStudsInput}`);
  } else {
    return; // Ignore unrelated interactions
  }

  const topXStuds = parseInt(topXStudsInput, 10);
  if (isNaN(topXStuds) || topXStuds <= 0) {
    await interaction.reply({ content: '❌ Invalid number for "Top X Studs". Please provide a positive integer.', ephemeral: true });
    return;
  }

  console.log(`   Parameters: Mare ID: ${mareId}, Top X Studs: ${topXStuds}`);
  await interaction.deferReply();

  try {
    const {
      sortedResults,
      mareName,
      totalSimsRun,
      studsProcessedCount,
      error
    } = await findBestBreedingPartners(mareId, topXStuds);

    if (error) {
      await interaction.followUp({ content: `❌ ${error}`, ephemeral: true });
      return;
    }

    if (!sortedResults?.length || studsProcessedCount === 0) {
      await interaction.followUp(`⚠️ No suitable stud matches or simulation results found for mare **${mareName}** (ID: ${mareId}).`);
      return;
    }

    await interaction.followUp({
      content: `✅ Found **${studsProcessedCount}** stud(s) for **${mareName}** (ID: ${mareId}). Simulations run: ${totalSimsRun}. Displaying top ${Math.min(5, sortedResults.length)} results:`,
      ephemeral: false
    });

    const resultsToShow = sortedResults.slice(0, 5);

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

      const row = new ActionRowBuilder().addComponents(
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

      await interaction.followUp({ embeds: [studEmbed], components: [row] });
    }

    if (sortedResults.length > resultsToShow.length) {
      await interaction.followUp({
        content: `📦 Showing top ${resultsToShow.length} of ${sortedResults.length} stud matches. More results were found.`,
        ephemeral: true
      });
    }

  } catch (err) {
    console.error(`❌ Error in /bestbreedmatch handler for mare ID ${mareId}:`, err);
    await interaction.followUp({
      content: `❌ An error occurred while evaluating best breed matches for mare ID: ${mareId}. Please try again later.`,
      ephemeral: true
    });
  }
};