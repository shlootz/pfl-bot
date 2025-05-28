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

const BASE_URL = process.env.HOST?.replace(/\/$/, '');

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
  const index = ['F','D','C','B','A','S','S+','SS-','SS'].indexOf(grade);
  return Math.max(0, index);
};

const traitLine = (trait, stats) => {
  if (!stats) return null;

  const bar = '░░░░░░░░░';
  const filled = gradeToBlock(stats.median);
  const visual = bar
    .split('')
    .map((b, i) => i < filled ? '▓' : '░')
    .join('');

  return `${traitEmojis[trait] || '🔹'} **${trait.padEnd(7)}** ${visual} (${stats.min} → ${stats.max}, 🎯 ${stats.median}, 🧬 ${stats.ssOrBetterChance}%)`;
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
    return; // Not for this handler
  }

  if (!shouldProcess) {
    return;
  }

  // Only defer if not already deferred or replied to.
  // This is a safeguard, but the main issue is likely how bot.js calls handlers.
  if (!interaction.replied && !interaction.deferred) {
    await interaction.deferReply();
  } else {
    // If it's already deferred (e.g., by handleBestBreedMatch if it were to handle the button itself),
    // we can still proceed to followUp. If replied, we can't.
    // This state usually indicates the interaction was meant to be fully handled by the component's creator.
    console.warn(`Interaction ${interaction.id} was already replied or deferred when handleSimulate was called for customId ${interaction.customId}.`);
  }

  console.log(`   Simulating with Mare ID: ${mareId}, Stud ID: ${studId}, Runs: ${runs}`);

  try {
    const res = await fetch(`${BASE_URL}/api/simulate-breeding?mareId=${mareId}&studId=${studId}&runs=${runs}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();

    const { mare, stud, result } = data;

    // Debug logs
    console.log('[DEBUG] Sim result keys:', Object.keys(result));
    console.log('[DEBUG] Heart:', result.heart);
    console.log('[DEBUG] Start:', result.start);
    console.log('[DEBUG] Temper:', result.temper);
    console.log('[DEBUG] Grade:', result.grade);
    console.log('[DEBUG] Subgrade:', result.subgrade);
    console.log('[DEBUG] Podium:', result.expectedPodium, 'Win:', result.expectedWin);

    const traitLines = ['start', 'speed', 'stamina', 'finish', 'heart', 'temper']
      .map(trait => traitLine(trait, result[trait]))
      .filter(Boolean)
      .join('\n');

    const radarBuffer = await generateRadarChart(result, mare, stud, `${mare.id}-${stud.id}.png`);
    const attachment = new AttachmentBuilder(radarBuffer, { name: 'radar.png' });

    const embed = new EmbedBuilder()
      .setTitle(`🧬 Simulated Breeding: ${mare.name} x ${stud.name}`)
      .setColor(0x00AEEF)
      .setDescription(`Simulated **${runs} foals**:\n🔸 **${mare.name}**\n🔹 **${stud.name}**\n\n${traitLines}`)
      .addFields(
        { name: '🏇 Direction', value: formatStarsBlock('Direction', result.directionStars), inline: true },
        { name: '🏟️ Surface', value: formatStarsBlock('Surface', result.surfaceStars), inline: true },
        { name: '📈 Subgrade', value: formatSubgradeBlock(result.subgrade), inline: true },
        { name: '🥉 Podium %', value: `${result.expectedPodium}%`, inline: true },
        { name: '🥇 Win %', value: `${result.expectedWin}%`, inline: true }
      )
      .setImage('attachment://radar.png')
      .setFooter({ text: 'Photo Finish Breeding Predictor' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('🔗 View Mare').setStyle(ButtonStyle.Link).setURL(`https://photofinish.live/horses/${mare.id}`),
      new ButtonBuilder().setLabel('🔗 View Stud').setStyle(ButtonStyle.Link).setURL(`https://photofinish.live/horses/${stud.id}`)
    );

    await interaction.followUp({ embeds: [embed], components: [row], files: [attachment] });
  } catch (err) {
    console.error('❌ Simulation failed:', err);
    await interaction.followUp('❌ Failed to run simulation. Please try again.');
  }
};