const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

module.exports = async function handleGo(interaction) {
  const validCustomIds = [
    'btn_breed',
    'btn_topmares',
    'btn_elite',
    'btn_winners',
    'btn_simulate',
    'btn_addmare',
    'btn_progeny',
    'btn_bestbreedmatch',
    'btn_help'
  ];

  // Early exit unless /go command or recognized button
  if (
    !(interaction.isChatInputCommand() && interaction.commandName === 'go') &&
    !(interaction.isButton() && validCustomIds.includes(interaction.customId))
  ) {
    return;
  }

  // Slash command: /go
  if (interaction.isChatInputCommand() && interaction.commandName === 'go') {
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('btn_breed').setLabel('🐴 Breed Mare').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('btn_topmares').setLabel('💖 Top Mares for Sale').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('btn_elite').setLabel('🔥 Elite Studs').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('btn_winners').setLabel('🏆 Top Winners').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('btn_simulate').setLabel('🧬 Simulate Breeding').setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('btn_addmare').setLabel('➕ Add Mare(s)').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('btn_progeny').setLabel('📜 Progeny List').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('btn_bestbreedmatch').setLabel('🌟 Best Breed Match').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('btn_help').setLabel('❓ Help').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      content: '🚀 Choose a feature:',
      components: [row1, row2],
      ephemeral: true
    });
    return;
  }

  // Button Interactions
  if (!interaction.isButton()) return;

  const showModal = async (modal) => await interaction.showModal(modal);

  switch (interaction.customId) {
    case 'btn_breed':
      return showModal(
        new ModalBuilder()
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
          )
      );

    case 'btn_addmare':
      return showModal(
        new ModalBuilder()
          .setCustomId('addmare_modal')
          .setTitle('Add Mare(s) to DB')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('mare_ids')
                .setLabel('Mare ID(s) (comma separated)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
            )
          )
      );

    case 'btn_topmares':
      return showModal(
        new ModalBuilder()
          .setCustomId('topmares_modal')
          .setTitle('Top Mares For Sale')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('top_x').setLabel('Top X').setStyle(TextInputStyle.Short).setValue('20')
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('direction').setLabel('Direction (LeftTurning / RightTurning)').setStyle(TextInputStyle.Short).setValue('LeftTurning').setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('surface').setLabel('Surface (Dirt / Turf)').setStyle(TextInputStyle.Short).setValue('Dirt').setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('min_sub').setLabel('Min Subgrade (e.g. +1)').setStyle(TextInputStyle.Short).setValue('+1').setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('min_stat').setLabel('Min Trait Grade (e.g. S)').setStyle(TextInputStyle.Short).setValue('S').setRequired(false)
            )
          )
      );

    case 'btn_elite':
      return showModal(
        new ModalBuilder()
          .setCustomId('elitestuds_modal')
          .setTitle('Elite Studs')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('top_x').setLabel('Top X').setStyle(TextInputStyle.Short).setValue('10')
            )
          )
      );

    case 'btn_winners':
      return showModal(
        new ModalBuilder()
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
          )
      );

    case 'btn_simulate':
      return showModal(
        new ModalBuilder()
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
          )
      );

    case 'btn_help':
      await interaction.deferUpdate();
      return interaction.followUp({ content: '/help', ephemeral: true });

    case 'btn_progeny':
      return showModal(
        new ModalBuilder()
          .setCustomId('progeny_modal')
          .setTitle('Horse Progeny List')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('horse_id')
                .setLabel('Enter Horse ID')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder('e.g., 8e986818-a2b8-479f-95f5-36ac0959b981')
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('max_generations')
                .setLabel('Max Generations (Optional, default 3)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setValue('3')
            )
          )
      );

    case 'btn_bestbreedmatch':
      return showModal(
        new ModalBuilder()
          .setCustomId('bestbreedmatch_modal')
          .setTitle('Best Breed Match Finder')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('mare_id')
                .setLabel('Enter Mare ID')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder('e.g., mare-uuid-1234')
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('top_x_studs')
                .setLabel('Number of Top Studs to Simulate')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue('10000')
            )
          )
      );

    default:
      return interaction.reply({ content: '❌ Unknown button.', ephemeral: true });
  }
};