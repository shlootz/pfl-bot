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
const extractIDFromURL = require('../utils/extractIDFromURL');

// Trait scale used for sorting and grade filtering
const DETAILED_TRAIT_SCALE = {
  'D-': 0, 'D': 1, 'D+': 2,
  'C-': 3, 'C': 4, 'C+': 5,
  'B-': 6, 'B': 7, 'B+': 8,
  'A-': 9, 'A': 10, 'A+': 11,
  'S-': 12, 'S': 13, 'S+': 14,
  'SS-': 15, 'SS': 16, 'SS+': 17,
  'SSS-': 18, 'SSS': 19
};

module.exports = async function handleBestBreedMatch(interaction) {
  let mareId;
  let topXStudsInput;
  let minStarsInput;
  let targetDistance;
  let minGradeInput;

  console.log(`🧾 /Best Breed Match submitted by ${interaction.user.username}`);

  if (
    interaction.type === InteractionType.ApplicationCommand &&
    interaction.commandName === 'bestbreedmatch'
  ) {
    mareId = extractIDFromURL(interaction.options.getString('mare_id'));
    topXStudsInput = interaction.options.getInteger('top_x_studs');
    minStarsInput = interaction.options.getInteger('min_stars');
    targetDistance = interaction.options.getInteger('distance_target') ?? 10;
    minGradeInput = interaction.options.getString('min_grade') ?? 'C';
    console.log(
      `🌟 /bestbreedmatch slash command initiated for Mare ID: ${mareId}, Top X: ${topXStudsInput}, Target Distance: ${targetDistance}, Min Grade: ${minGradeInput}`
    );
  } else if (
    interaction.type === InteractionType.ModalSubmit &&
    interaction.customId === 'bestbreedmatch_modal'
  ) {
    mareId = extractIDFromURL(interaction.fields.getTextInputValue('mare_id'));
    topXStudsInput = interaction.fields.getTextInputValue('top_x_studs');
    minStarsInput = interaction.fields.getTextInputValue('min_stars');
    targetDistance = parseInt(interaction.fields.getTextInputValue('distance_target') || '10', 10);
    minGradeInput = interaction.fields.getTextInputValue('min_grade') || 'C';
    console.log(
      `🌟 bestbreedmatch_modal submitted for Mare ID: ${mareId}, Top X: ${topXStudsInput}, Target Distance: ${targetDistance}, Min Grade: ${minGradeInput}`
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

  const minGradeNumeric = DETAILED_TRAIT_SCALE[minGradeInput] ?? 0;
  console.log(`✅ Parsed minGrade: ${minGradeInput} (${minGradeNumeric})`);

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

    // Add distance delta to each result
    const resultsWithDelta = sortedResults.map(result => {
      let topDistance = null;

      if (
        result.bestFoal?.shapeDistanceMatches &&
        result.bestFoal.shapeDistanceMatches.distances?.length
      ) {
        topDistance = result.bestFoal.shapeDistanceMatches.distances[0].distance;
      }

      const distanceDelta = topDistance != null
        ? Math.abs(topDistance - targetDistance)
        : 9999;

      return {
        ...result,
        distanceDelta
      };
    });

    let filteredResults = resultsWithDelta;

    // Filter by minimum grade
    filteredResults = filteredResults.filter(result => {
      const grade = result.bestFoal?.overallGradeString;
      const gradeNumeric = DETAILED_TRAIT_SCALE[grade] ?? 0;
      return gradeNumeric >= minGradeNumeric;
    });

    if (filteredResults.length === 0) {
      await interaction.followUp({
        content: `⚠️ No results found meeting minimum grade **${minGradeInput}**.`,
        ephemeral: true
      });
      return;
    }

    // Filter by minimum stars
    if (minStars > 0) {
      filteredResults = filteredResults.filter(result => {
        const totalStars =
          result.bestFoal?.preferences?.totalStars != null
            ? parseFloat(result.bestFoal.preferences.totalStars)
            : 0;
        return totalStars >= minStars;
      });
    }

    if (filteredResults.length === 0) {
      await interaction.followUp({
        content: `⚠️ No results found meeting minimum grade **${minGradeInput}** and minimum stars **${minStars}**.`,
        ephemeral: true
      });
      return;
    }

    // Sort by:
    // 1) distance delta
    // 2) grade
    // 3) weighted trait score
    filteredResults.sort((a, b) => {
      if (a.distanceDelta !== b.distanceDelta) {
        return a.distanceDelta - b.distanceDelta;
      }

      const gradeA = DETAILED_TRAIT_SCALE[a.bestFoal.overallGradeString] ?? 0;
      const gradeB = DETAILED_TRAIT_SCALE[b.bestFoal.overallGradeString] ?? 0;

      if (gradeB !== gradeA) {
        return gradeB - gradeA;
      }
      return b.bestFoal.weightedScore - a.bestFoal.weightedScore;
    });

    await interaction.followUp({
      content: `✅ Found **${filteredResults.length}** stud(s) above min grade **${minGradeInput}** and minimum ${minStars} stars for **${mareName}** (ID: ${mareId}). Simulations run: ${totalSimsRun}. Displaying top ${Math.min(
        5,
        filteredResults.length
      )} results:`,
      ephemeral: false
    });

    const resultsToShow = filteredResults.slice(0, 10);

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

        const labelMap = {
          LeftTurning: 'Left',
          RightTurning: 'Right',
          Dirt: 'Dirt',
          Turf: 'Turf',
          Firm: 'Firm',
          Soft: 'Soft'
        };

        const lines = [];

        for (const key of preferenceKeys) {
          const value = prefs[key];
          if (value != null && value > 0) {
            const label = labelMap[key] || key;
            lines.push(`🎯 ${label}: ${value.toFixed(2)}`);
          }
        }

        lines.push(`🌟 Total Stars: ${prefs.totalStars ?? '0.00'}`);

        foalPrefsString = lines.join('\n');
      }

      // Format shape & distance projection
      let shapeDistanceString = 'N/A';
      if (
        result.bestFoal?.shapeDistanceMatches &&
        result.bestFoal.shapeDistanceMatches.shapeString
      ) {
        const shapeStr = result.bestFoal.shapeDistanceMatches.shapeString;
        const distances = result.bestFoal.shapeDistanceMatches.distances || [];

        let topDistanceStr = 'N/A';
        if (distances.length > 0) {
          const top = distances[0];
          topDistanceStr = `🏇 **${top.distance}F** → ${top.probability.toFixed(1)}%`;
        }

        const allDistances = distances
          .slice(0, 5)
          .map(
            (d) =>
              `• ${d.distance}F → ${d.probability.toFixed(1)}%`
          )
          .join('\n');

        shapeDistanceString = `**Shape:** \`${shapeStr}\`\n**Best Match:** ${topDistanceStr}\n${allDistances}`;
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
          },
          {
            name: 'Shape → Distance Projection',
            value: shapeDistanceString,
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