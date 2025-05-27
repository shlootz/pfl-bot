const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

module.exports = async function handleGo(interaction) {
  // 1. Slash command: /go
  if (interaction.isChatInputCommand() && interaction.commandName === 'go') {
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('btn_breed').setLabel('🐴 Breed Mare').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('btn_topmares').setLabel('💖 Top Mares for Sale').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('btn_elite').setLabel('🔥 Elite Studs').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('btn_winners').setLabel('🏆 Top Winners').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('btn_simulate').setLabel('🧬 Simulate Breeding').setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('btn_help').setLabel('❓ Help').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ content: '🚀 Choose a feature:', components: [row1, row2], ephemeral: true });
    return;
  }

  // 2. Button Interactions
  if (!interaction.isButton()) return;

  const showModal = async (modal) => await interaction.showModal(modal);

  switch (interaction.customId) {
    case 'btn_breed': {
      const modal = new ModalBuilder()
        .setCustomId('breed_modal')
        .setTitle('Breed Mare')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('mare_id')
              .setLabel('Enter Mare ID')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('race_target')
              .setLabel('Enter Race Target (e.g. kentucky-derby)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue('Kentucky Derby')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('top_x')
              .setLabel('Top X Studs')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue('10')
          )
        );
      return showModal(modal);
    }

    case 'btn_topmares': {
      const modal = new ModalBuilder()
        .setCustomId('topmares_modal')
        .setTitle('Top Mares For Sale')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('top_x').setLabel('Top X').setStyle(TextInputStyle.Short).setValue('20')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('direction').setLabel('Direction (LeftTurning / RightTurning)').setStyle(TextInputStyle.Short).setValue('LeftTurning')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('surface').setLabel('Surface (Dirt / Turf)').setStyle(TextInputStyle.Short).setValue('Dirt')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('min_sub').setLabel('Min Subgrade (e.g. +1)').setStyle(TextInputStyle.Short).setValue('+1')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('min_stat').setLabel('Min Trait Grade (e.g. S)').setStyle(TextInputStyle.Short).setValue('S')
          )
        );
      return showModal(modal);
    }

    case 'btn_elite': {
      const modal = new ModalBuilder()
        .setCustomId('elitestuds_modal')
        .setTitle('Elite Studs')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('top_x').setLabel('Top X').setStyle(TextInputStyle.Short).setValue('10')
          )
        );
      return showModal(modal);
    }

    case 'btn_winners': {
      const modal = new ModalBuilder()
        .setCustomId('winners_modal')
        .setTitle('Top Stud Winners')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('top_x').setLabel('Top X').setStyle(TextInputStyle.Short).setValue('10')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('direction').setLabel('Direction').setStyle(TextInputStyle.Short).setValue('LeftTurning')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('surface').setLabel('Surface').setStyle(TextInputStyle.Short).setValue('Dirt')
          )
        );
      return showModal(modal);
    }

    case 'btn_simulate': {
      const modal = new ModalBuilder()
        .setCustomId('simulate_modal')
        .setTitle('Simulate Breeding')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('mare_id').setLabel('Mare ID').setStyle(TextInputStyle.Short)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('stud_id').setLabel('Stud ID').setStyle(TextInputStyle.Short)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('runs').setLabel('Simulation Runs').setStyle(TextInputStyle.Short).setValue('1000')
          )
        );
      return showModal(modal);
    }

    case 'btn_help': {
      await interaction.deferUpdate();
      return interaction.followUp({ content: '/help', ephemeral: true });
    }

    default:
      return interaction.reply({ content: '❌ Unknown button.', ephemeral: true });
  }
};