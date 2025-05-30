//simulate.js

const {
  InteractionType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require('discord.js');
const fetch = require('node-fetch');
const { generateRadarChart } = require('../../utils/generateRadar');
const { generateTraitBoxImage } = require('../../utils/generateTraitBox');
const { generateFleetFigureTrendChart } = require('../../utils/generateFleetFigureTrendChart');

const BASE_URL = process.env.HOST?.replace(/\/$/, '');

const DETAILED_TRAIT_SCALE = {
  'D-': 0, 'D': 1, 'D+': 2,
  'C-': 3, 'C': 4, 'C+': 5,
  'B-': 6, 'B': 7, 'B+': 8,
  'A-': 9, 'A': 10, 'A+': 11,
  'S-': 12, 'S': 13, 'S+': 14,
  'SS-': 15, 'SS': 16, 'SS+': 17,
  'SSS-': 18, 'SSS': 19
};
const DETAILED_SCALE_MAX_VAL = 19;
const VISUAL_BAR_LENGTH = 9;

const starBar = (value) => {
  const stars = Math.round(parseFloat(value));
  return '⭐'.repeat(stars) + '▫️'.repeat(3 - stars);
};

const formatStarsBlock = (label, stats) => {
  if (!stats || stats.avg == null) return `**${label}**: N/A`;
  return `**${label}**: ${starBar(stats.avg)} (${stats.avg} avg, ${stats.min}–${stats.max})`;
};

const formatSubgradeBlock = (sub) => {
  if (!sub || sub.min == null || sub.max == null || sub.avg == null) {
    return '**Subgrade**: N/A';
  }
  return `**Subgrade**: 🔽 ${sub.min} → 🔼 ${sub.max} (📊 Avg: ${sub.avg})`;
};

const traitEmojis = {
  start: '🟢', speed: '🔵', stamina: '🟠',
  finish: '🟣', heart: '❤️', temper: '😤'
};

const gradeToBlock = (grade) => {
  const numericValue = DETAILED_TRAIT_SCALE[grade];
  if (numericValue === undefined) return 0;
  const scaledValue = Math.round(numericValue / (DETAILED_SCALE_MAX_VAL / (VISUAL_BAR_LENGTH - 1)));
  return Math.max(0, Math.min(VISUAL_BAR_LENGTH - 1, scaledValue));
};

const TRAIT_GRADES = Object.keys(DETAILED_TRAIT_SCALE);

const traitLine = (trait, stats) => {
  if (!stats) return null;

  const minGrade = stats.min ?? 'N/A';
  const maxGrade = stats.max ?? 'N/A';
  const medianGrade = stats.median ?? 'N/A';
  const ssChance = stats.ssOrBetterChance != null ? `${stats.ssOrBetterChance}%` : 'N/A';

  const minVal = DETAILED_TRAIT_SCALE[minGrade] ?? 0;
  const maxVal = DETAILED_TRAIT_SCALE[maxGrade] ?? 0;
  const medianVal = DETAILED_TRAIT_SCALE[medianGrade] ?? 0;

  const bar = Array.from({ length: 20 }, (_, i) => {
    if (i === medianVal) return '🔹';
    if (i >= minVal && i <= maxVal) return '▓';
    return '░';
  }).join('');

  const labelLine = `${traitEmojis[trait] || '🔹'} ${trait.toUpperCase().padEnd(10)}`;
  const barLine = `${bar}   (${minGrade.padEnd(4)}) → 🎯 ${medianGrade.padEnd(4)} → (${maxGrade.padEnd(4)})   🧬 ${ssChance}`;
  return `${labelLine}\n${barLine}`;
};

const formatFoalPreferences = (result) => {
  const prefs = [];

  // Direction
  if (typeof result.LeftTurning === 'number') prefs.push(`Left: ${result.LeftTurning.toFixed(2)}`);
  if (typeof result.RightTurning === 'number') prefs.push(`Right: ${result.RightTurning.toFixed(2)}`);

  // Surface
  if (typeof result.Dirt === 'number') prefs.push(`Dirt: ${result.Dirt.toFixed(2)}`);
  if (typeof result.Turf === 'number') prefs.push(`Turf: ${result.Turf.toFixed(2)}`);

  // Condition
  if (typeof result.Soft === 'number') prefs.push(`Soft: ${result.Soft.toFixed(2)}`);
  if (typeof result.Firm === 'number') prefs.push(`Firm: ${result.Firm.toFixed(2)}`);

  return prefs.length ? prefs.join(', ') : 'N/A';
};

module.exports = async function handleSimulate(interaction) {
  let mareId, studId, runs;
  let shouldProcess = false;

  if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'simulate_modal') {
    shouldProcess = true;
    console.log(`🧬 simulate_modal submitted by ${interaction.user.username}`);
    mareId = interaction.fields.getTextInputValue('mare_id');
    studId = interaction.fields.getTextInputValue('stud_id');
    runs = parseInt(interaction.fields.getTextInputValue('runs') || '1000');
  } else if (interaction.isButton() && interaction.customId.startsWith('run_10k_sim:')) {
    shouldProcess = true;
    console.log(`🧬 run_10k_sim button clicked by ${interaction.user.username}`);
    const parts = interaction.customId.split(':');
    mareId = parts[1];
    studId = parts[2];
    runs = 10000;
  } else {
    return;
  }

  if (!shouldProcess) return;
  if (!interaction.replied && !interaction.deferred) {
    await interaction.deferReply();
  } else {
    console.warn(`Interaction ${interaction.id} was already replied or deferred.`);
  }

  console.log(`   Simulating with Mare ID: ${mareId}, Stud ID: ${studId}, Runs: ${runs}`);

  try {
    const res = await fetch(`${BASE_URL}/api/simulate-breeding?mareId=${mareId}&studId=${studId}&runs=${runs}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    const { mare, stud, result } = data;
    console.dir(result, { depth: null });

    console.log('[DEBUG] Sim result keys:', Object.keys(result));

    const CORE_TRAITS_FOR_DISPLAY = ['start', 'speed', 'stamina', 'finish', 'heart', 'temper'];
    const traitLines = CORE_TRAITS_FOR_DISPLAY
      .map(trait => traitLine(trait, result[trait]))
      .filter(Boolean)
      .join('\n');

    const radarBuffer = await generateRadarChart(result, mare, stud, `${mare.id}-${stud.id}.png`);
    const radarAttachment = new AttachmentBuilder(radarBuffer, { name: 'radar.png' });

    const traitBoxBuffer = await generateTraitBoxImage(result, mare, stud);
    const traitBoxAttachment = new AttachmentBuilder(traitBoxBuffer, { name: 'traitbox.png' });

    const ffStats = {};
    const addHorseToFFStats = (horse, label) => {
      const age = horse.age;
      const ff = horse.history?.averageFleetFigure;
      if (typeof age !== 'number' || typeof ff !== 'number') return;
      if (!ffStats[age]) ffStats[age] = {};
      ffStats[age][label] = { median: ff };
    };

    addHorseToFFStats(mare, mare.name);
    addHorseToFFStats(stud, stud.name);

    const ffTrendBuffer = await generateFleetFigureTrendChart(ffStats, mare.name, stud.name);
    const ffTrendAttachment = new AttachmentBuilder(ffTrendBuffer, { name: 'ff-trend.png' });

    const embed = new EmbedBuilder()
      .setTitle(`🧬 Simulated Breeding: ${mare.name} x ${stud.name}`)
      .setColor(0x00AEEF)
      .setDescription(`Simulated **${runs} foals**:\n🔸 **${mare.name}**\n🔹 **${stud.name}**\n\n${traitLines}`)
      .addFields(
       // { name: '🏇 Direction', value: formatStarsBlock('Direction', result.directionStars), inline: true },
       // { name: '🏟️ Surface', value: formatStarsBlock('Surface', result.surfaceStars), inline: true },
        { name: '📈 Subgrade', value: formatSubgradeBlock(result.subgrade), inline: true },
        { name: '🥉 Podium %', value: `${result.expectedPodium}%`, inline: true },
        { name: '🥇 Win %', value: `${result.expectedWin}%`, inline: true },
        { name: '🎯 Foal Preference', value: formatFoalPreferences(result), inline: false }
      )
      .setImage('attachment://radar.png')
      .setImage('attachment://traitbox.png') // Displays the trait box in the embed
      .setFooter({ text: 'Photo Finish Breeding Predictor' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('🔗 View Mare').setStyle(ButtonStyle.Link).setURL(`https://photofinish.live/horses/${mare.id}`),
      new ButtonBuilder().setLabel('🔗 View Stud').setStyle(ButtonStyle.Link).setURL(`https://photofinish.live/horses/${stud.id}`)
    );

    //await interaction.followUp({ embeds: [embed], components: [row], files: [radarAttachment, ffTrendAttachment, traitBoxAttachment] });
    await interaction.followUp({ embeds: [embed], components: [row], files: [radarAttachment] });
  } catch (err) {
    console.error('❌ Simulation failed:', err);
    await interaction.followUp('❌ Failed to run simulation. Please try again.');
  }
};
