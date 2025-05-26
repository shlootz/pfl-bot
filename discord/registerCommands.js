// registerCommands.js
require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

// Define commands
const commands = [
  new SlashCommandBuilder().setName('breed').setDescription('Breed a mare with optimal studs'),
  new SlashCommandBuilder().setName('winners').setDescription('View top studs by biggest purse with filters'),
  new SlashCommandBuilder().setName('topmaresforsale').setDescription('Find top mares for sale based on filters'),
  new SlashCommandBuilder().setName('elitestuds').setDescription('Show top elite studs by trait grade'),
  new SlashCommandBuilder().setName('updatedata').setDescription('Refresh bot database (authorized only)'),
  new SlashCommandBuilder().setName('help').setDescription('List all available bot commands and usage'),
  new SlashCommandBuilder().setName('go').setDescription('Quick access to all features')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

// Determine deployment mode
const isGlobal = process.env.GLOBAL_DEPLOY === 'true' || process.argv.includes('--global');

(async () => {
  try {
    if (isGlobal) {
      console.log('🌍 Deploying commands globally...');
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );
      console.log('✅ Global commands registered');
    } else {
      console.log('🏠 Deploying commands to guild...');
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log(`✅ Guild commands registered for GUILD_ID: ${process.env.GUILD_ID}`);
    }
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
})();