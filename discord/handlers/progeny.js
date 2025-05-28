const { InteractionType, EmbedBuilder } = require('discord.js');
const { fetchProgenyReport } = require('../../utils/progenyService');

const DEFAULT_MAX_GENERATIONS = 3;

module.exports = async function handleProgeny(interaction) {
  let horseId;
  let maxGenerationsInput;

  if (interaction.type === InteractionType.ApplicationCommand && interaction.commandName === 'progeny') {
    horseId = interaction.options.getString('horse_id');
    maxGenerationsInput = interaction.options.getInteger('max_generations');
    console.log(`🐴 /progeny slash command initiated by ${interaction.user.username} for horse ID: ${horseId}`);
  } else if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'progeny_modal') {
    horseId = interaction.fields.getTextInputValue('horse_id');
    maxGenerationsInput = interaction.fields.getTextInputValue('max_generations');
    console.log(`🐴 progeny_modal submitted by ${interaction.user.username} for horse ID: ${horseId}`);
  } else {
    return; // Not a progeny command or modal
  }

  const maxGenerations = parseInt(maxGenerationsInput, 10) || DEFAULT_MAX_GENERATIONS;
  
  console.log(`   Parameters: Horse ID: ${horseId}, Max Generations: ${maxGenerations}`);
  await interaction.deferReply();

  try {
    const { progenyList, initialHorseName, directProgenyWinPercentage } = await fetchProgenyReport(horseId, maxGenerations);

    const titleName = initialHorseName === horseId ? horseId : `${initialHorseName} (ID: ${horseId})`;

    if (!progenyList || progenyList.length === 0) {
      let followUpMessage = `No progeny found for ${titleName} within ${maxGenerations} generations.`;
      if (typeof directProgenyWinPercentage === 'number') { // Check if the percentage was calculated (e.g. initial horse was found)
          followUpMessage += `\nDirect Progeny Winner Rate (Gen 1): ${directProgenyWinPercentage.toFixed(2)}%`;
      }
      await interaction.followUp(followUpMessage);
      return;
    }

    let description = `Showing up to ${maxGenerations} generations, ordered by podium finishes.`;
    if (typeof directProgenyWinPercentage === 'number') {
        description += `\n**Direct Progeny Winner Rate: ${directProgenyWinPercentage.toFixed(2)}%**`;
    }

    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(`Progeny Report for ${titleName}`)
      .setDescription(description)
      .setTimestamp();

    // Max 25 fields per embed
    const fieldsToShow = progenyList.slice(0, 25);

    fieldsToShow.forEach(progeny => {
      embed.addFields({
        name: `${progeny.name} (Gen ${progeny.generation})`,
        value: `ID: [${progeny.id}](${progeny.pfl_url})\nPodiums: ${progeny.podium_finishes} | Wins: ${progeny.total_wins}`,
        inline: false
      });
    });
    
    if (progenyList.length > 25) {
        embed.setFooter({ text: `Showing ${fieldsToShow.length} of ${progenyList.length} progeny. More results were found.` });
    }


    await interaction.followUp({ embeds: [embed] });

  } catch (error) {
    console.error(`❌ Error in /progeny handler for horse ID ${horseId}:`, error);
    await interaction.followUp({ content: `An error occurred while fetching progeny for horse ID: ${horseId}. Please try again later.`, ephemeral: true });
  }
};