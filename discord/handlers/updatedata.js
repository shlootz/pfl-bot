// const { exec } = require('child_process'); // No longer using exec
const { fetchStuds } = require('../../scripts/fetchStuds');
const { fetchMarketPlaceMares } = require('../../scripts/fetchMarketPlaceMares');

module.exports = async function handleUpdateData(interaction) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'updatedata') return;

  const authorizedUserId = process.env.OWNER_USER_ID;
  if (interaction.user.id !== authorizedUserId) {
    return interaction.reply({
      content: '🚫 You are not authorized to run this command.',
      ephemeral: true
    });
  }

  await interaction.reply({ content: '🔄 Starting data update process. This may take a few minutes...\nFetching studs data first...', ephemeral: false });

  let studReport = { newStuds: 0, updatedStuds: 0, newlyListedStuds: 0, totalProcessedFromApi: 0, error: null };
  let mareReport = { newMarketplaceMares: 0, updatedMarketplaceMares: 0, totalProcessedFromApi: 0, error: null };
  let overallSuccess = true;

  try {
    console.log('Starting fetchStuds...');
    studReport = await fetchStuds();
    if (studReport.error) {
      console.error(`❌ Error during fetchStuds: ${studReport.error}`);
      overallSuccess = false;
    }
    console.log('fetchStuds complete. Report:', studReport);
    await interaction.editReply('Studs data processed. Now fetching marketplace mares data...');

    console.log('Starting fetchMarketPlaceMares...');
    mareReport = await fetchMarketPlaceMares();
    if (mareReport.error) {
      console.error(`❌ Error during fetchMarketPlaceMares: ${mareReport.error}`);
      overallSuccess = false;
    }
    console.log('fetchMarketPlaceMares complete. Report:', mareReport);

    let summaryMessage = '📊 **Data Update Report** 📊\n\n';

    summaryMessage += '**Studs Data:**\n';
    if (studReport.error) {
      summaryMessage += `  - ❌ Error: ${studReport.error}\n`;
    } else {
      summaryMessage += `  - New studs added: ${studReport.newStuds}\n`;
      summaryMessage += `  - Existing studs updated: ${studReport.updatedStuds}\n`;
      summaryMessage += `  - New studs listed for breeding: ${studReport.newlyListedStuds}\n`;
      summaryMessage += `  - Total stud API listings processed: ${studReport.totalProcessedFromApi}\n`;
    }
    summaryMessage += '\n';

    summaryMessage += '**Marketplace Mares Data:**\n';
    if (mareReport.error) {
      summaryMessage += `  - ❌ Error: ${mareReport.error}\n`;
    } else {
      summaryMessage += `  - New marketplace mares added: ${mareReport.newMarketplaceMares}\n`;
      summaryMessage += `  - Existing marketplace mares updated: ${mareReport.updatedMarketplaceMares}\n`;
      summaryMessage += `  - Total mare API listings processed: ${mareReport.totalProcessedFromApi}\n`;
    }
    summaryMessage += '\n';

    if (overallSuccess) {
      summaryMessage += '✅ Data update process completed.';
    } else {
      summaryMessage += '⚠️ Data update process completed with one or more errors. Please check logs.';
    }

    await interaction.followUp(summaryMessage);

  } catch (error) {
    console.error(`❌ Critical error in handleUpdateData: ${error.message}`, error);
    await interaction.followUp({ content: `❌ A critical error occurred during the data update process: ${error.message}. Please check the logs.`, ephemeral: true });
  }
};