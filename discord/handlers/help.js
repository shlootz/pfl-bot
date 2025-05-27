const { EmbedBuilder } = require('discord.js');

module.exports = async function handleHelp(interaction) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'help') return;

  const embed = new EmbedBuilder()
    .setTitle('📖 Bot Commands Help')
    .setColor(0x00BFFF)
    .setDescription('Here are the available commands:')
    .addFields(
      {
        name: '/breed',
        value: 'Breed a mare with optimal studs. Prompts a modal for Mare ID, Race Target, and Top X studs.'
      },
      {
        name: '/topmaresforsale',
        value: 'Shows top X mares for sale filtered by direction, surface, and min subgrade.'
      },
      {
        name: '/winners',
        value: 'Lists top studs by biggest single race purse. Optional filters for direction and surface.'
      },
      {
        name: '/simulate',
        value: 'Simulate breeding between a mare and stud. Runs multiple offspring generations and returns stat ranges.'
      },
      {
        name: '/help',
        value: 'Displays this help message with all available commands.'
      },
      {
        name: '/go',
        value: 'UI-first command. Opens interactive buttons for all bot features.'
      }
    )
    .setFooter({ text: 'Photo Finish Live Discord Bot' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
};