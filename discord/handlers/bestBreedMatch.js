/**
 * discord/handlers/bestBreedMatch.js
 *
 * Handles the Discord slash command or modal for best breed match.
 */

const {
  InteractionType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const { findBestBreedingPartners } = require('../../utils/bestMatchService');

module.exports = async function handleBestBreedMatch(interaction) {
  let mareId;
  let topXStudsInput;
  let minStarsInput;

  console.log(`🧾 /Best Breed Match submitted by ${interaction.user.username}`);

  if (
    interaction.type === InteractionType.ApplicationCommand &&
    interaction.commandName === 'bestbreedmatch'
  ) {
    mareId = interaction.options.getString('mare_id');
    topXStudsInput = interaction.options.getInteger('top_x_studs');
    minStarsInput = interaction.options.getInteger('min_stars');
    console.log(
      `🌟 /bestbreedmatch slash command initiated for Mare ID: ${mareId}, Top X: ${topXStudsInput}`
    );
  } else if (
    interaction.type === InteractionType.ModalSubmit &&
    interaction.customId === 'bestbreedmatch_modal'
  ) {
    mareId = interaction.fields.getTextInputValue('mare_id');
    topXStudsInput = interaction.fields.getTextInputValue('top_x_studs');
    minStarsInput = interaction.fields.getTextInputValue('min_stars');
    console.log(
      `🌟 bestbreedmatch_modal submitted for Mare ID: ${mareId}, Top X: ${topXStudsInput}`
    );
  } else {
    return; // Ignore unrelated interactions
  }

  const topXStuds = parseInt(topXStudsInput, 10);
  if (isNaN(topXStuds) || topXStuds <= 0) {
    await interaction.reply({
      content:
        '❌ Invalid number for "Top X Studs". Please provide a positive integer.',
      ephemeral: true
    });
    return;
  }

  let minStars = 0;
  if (minStarsInput !== undefined && minStarsInput !== null) {
    minStars = parseFloat(minStarsInput);
    if (isNaN(minStars) || minStars < 0) {
      await interaction.reply({
        content:
          '❌ Invalid value for "Min Stars". Please provide a non-negative number.',
        ephemeral: true
      });
      return;
    }
  }
  console.log(`✅ Parsed minStars: ${minStars}`);

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
      await interaction.followUp({
        content: `❌ ${error}`,
        ephemeral: true
      });
      return;
    }

    if (!sortedResults?.length || studsProcessedCount === 0) {
      await interaction.followUp({
        content: `⚠️ No suitable stud matches or simulation results found for mare **${mareName}** (ID: ${mareId}).`,
        ephemeral: true
      });
      return;
    }

    let filteredResults = sortedResults;

    if (minStars > 0) {
      filteredResults = sortedResults.filter((result) => {
        const totalStars =
          result.bestFoal?.preferences?.totalStars != null
            ? parseFloat(result.bestFoal.preferences.totalStars)
            : 0;
        return totalStars >= minStars;
      });
    }

    if (filteredResults.length === 0) {
      await interaction.followUp({
        content: `⚠️ No results found where projected foal preferences reach at least **${minStars}** stars.`,
        ephemeral: true
      });
      return;
    }

    await interaction.followUp({
      content: `✅ Found **${filteredResults.length}** stud(s) above minimum ${minStars} stars for **${mareName}** (ID: ${mareId}). Simulations run: ${totalSimsRun}. Displaying top ${Math.min(
        5,
        filteredResults.length
      )} results:`,
      ephemeral: false
    });

    const resultsToShow = filteredResults.slice(0, 5);

    for (const result of resultsToShow) {
      // Format projected traits
      const foalTraitsString = Object.entries(result.bestFoal.traits)
        .map(
          ([key, value]) =>
            `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`
        )
        .join(', ');

      // Format projected preferences dynamically
      let foalPrefsString = 'N/A';

      if (result.bestFoal?.preferences) {
        const prefs = result.bestFoal.preferences;

        const preferenceKeys = [
          'LeftTurning',
          'RightTurning',
          'Dirt',
          'Turf',
          'Firm',
          'Soft'
        ];

        const lines = [];

        for (const key of preferenceKeys) {
          const value = prefs[key];
          if (value != null && value > 0) {
            const label = key
              .replace('Turning', '')
              .replace('Right', 'Right ')
              .replace('Left', 'Left ')
              .trim();
            lines.push(`🎯${label}: ${value.toFixed(2)}`);
          }
        }

        lines.push(`🌟Total Stars: ${prefs.totalStars ?? '0.00'}`);

        foalPrefsString = lines.join('\n');
      }

      const studEmbed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle(`Match: ${mareName} x ${result.stud.name}`)
        .addFields(
          {
            name: 'Stud',
            value: `[${result.stud.name} (ID: ${result.stud.id})](https://photofinish.live/horses/${result.stud.id})`
          },
          {
            name: 'Best Foal Projected Grade',
            value: `${result.bestFoal.overallGradeString} (Subgrade: ${result.bestFoal.subgrade})`,
            inline: true
          },
          {
            name: 'Weighted Trait Score',
            value: `${result.bestFoal.weightedScore.toFixed(2)}`,
            inline: true
          },
          {
            name: 'Projected Traits',
            value: foalTraitsString,
            inline: false
          },
          {
            name: 'Projected Preferences',
            value: foalPrefsString,
            inline: false
          }
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

      await interaction.followUp({
        embeds: [studEmbed],
        components: [row]
      });
    }

    if (filteredResults.length > resultsToShow.length) {
      await interaction.followUp({
        content: `📦 Showing top ${resultsToShow.length} of ${filteredResults.length} stud matches. More results were found.`,
        ephemeral: true
      });
    }
  } catch (err) {
    console.error(
      `❌ Error in /bestbreedmatch handler for mare ID ${mareId}:`,
      err
    );
    await interaction.followUp({
      content: `❌ An error occurred while evaluating best breed matches for mare ID: ${mareId}. Please try again later.`,
      ephemeral: true
    });
  }
};