const { exec } = require('child_process');

module.exports = async function handleUpdateData(interaction) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'updatedata') return;

  const authorizedUserId = process.env.OWNER_USER_ID;
  if (interaction.user.id !== authorizedUserId) {
    return interaction.reply({
      content: '🚫 You are not authorized to run this command.',
      ephemeral: true
    });
  }

  await interaction.reply('🔄 Starting full data update. This may take a few minutes...');

  exec('bash ./run_full_pipeline.sh', (err, stdout, stderr) => {
    if (err) {
      console.error(`❌ Update script error:\n${stderr}`);
      return interaction.followUp('❌ Failed to run update script.');
    }

    console.log(`✅ Update script output:\n${stdout}`);
    interaction.followUp('✅ Data update completed successfully.');
  });
};