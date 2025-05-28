const { InteractionType, EmbedBuilder } = require('discord.js');
const { fetchProgenyReport } = require('../../utils/progenyService');

const DEFAULT_MAX_GENERATIONS = 3;

module.exports = async function handleProgeny(interaction) {
  if (interaction.type !== InteractionType.ApplicationCommand || interaction.commandName !== 'progeny') {
    return;
  }

  const horseId = interaction.options.getString('horse_id');
  const maxGenerations = interaction.options.getInteger('max_generations') ?? DEFAULT_MAX_GENERATIONS;

  console.log(`🐴 /progeny command initiated by ${interaction.user.username} for horse ID: ${horseId}, max generations: ${maxGenerations}`);
  await interaction.deferReply();

  try {
    const progenyList = await fetchProgenyReport(horseId, maxGenerations);

    if (!progenyList || progenyList.length === 0) {
      await interaction.followUp(`No progeny found for horse ID: ${horseId} within ${maxGenerations} generations.`);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(`Progeny Report for Horse ID: ${horseId}`)
      .setDescription(`Showing up to ${maxGenerations} generations, ordered by podium finishes.`)
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