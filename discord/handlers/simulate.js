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
  if (
    interaction.type !== InteractionType.ModalSubmit ||
    interaction.customId !== 'simulate_modal'
  ) return;

  console.log(`🧬 /simulate submitted by ${interaction.user.username}`);
  await interaction.deferReply();

  const mareId = interaction.fields.getTextInputValue('mare_id');
  const studId = interaction.fields.getTextInputValue('stud_id');
  const runs = parseInt(interaction.fields.getTextInputValue('runs') || '1000');

  try {
    const res = await fetch(`${BASE_URL}/api/simulate-breeding?mareId=${mareId}&studId=${studId}&runs=${runs}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();

    const { mare, stud, result } = data;
    const traitLines = ['start', 'speed', 'stamina', 'finish', 'heart', 'temper']
      .map(trait => traitLine(trait, result[trait]))
      .filter(Boolean)
      .join('\n');

    const radarBuffer = await generateRadarChart(result, `${mare.id}-${stud.id}.png`);
    const attachment = new AttachmentBuilder(radarBuffer, { name: 'radar.png' });

    const embed = new EmbedBuilder()
      .setTitle(`🧬 Simulated Breeding: ${mare.name} x ${stud.name}`)
      .setColor(0x00AEEF)
      .setDescription(`Simulated **${runs} foals**:\n🔸 **${mare.name}**\n🔹 **${stud.name}**\n\n${traitLines}`)
      .addFields(
        { name: '🏇 Direction', value: formatStarsBlock('Direction', result.directionStars), inline: true },
        { name: '🏟️ Surface', value: formatStarsBlock('Surface', result.surfaceStars), inline: true },
        { name: '📈 Subgrade', value: formatSubgradeBlock(result.subgrade), inline: true }
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