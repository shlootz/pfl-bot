const {
  InteractionType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const fetch = require('node-fetch');

const BASE_URL = process.env.HOST?.replace(/\/$/, '');

module.exports = async function handleWinners(interaction) {
  if (
    interaction.type !== InteractionType.ModalSubmit ||
    interaction.customId !== 'winners_modal'
  ) return;

  console.log(`🏆 /winners submitted by ${interaction.user.username}`);
  await interaction.deferReply();

  const topX = parseInt(interaction.fields.getTextInputValue('top_x') || '10');
  const direction = interaction.fields.getTextInputValue('direction')?.trim();
  const surface = interaction.fields.getTextInputValue('surface')?.trim();

  try {
    const res = await fetch(`${BASE_URL}/api/winners`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const studs = await res.json();

    const filtered = studs.filter((s) => {
      const d = s.racing?.direction?.value;
      const sfc = s.racing?.surface?.value;
      return (!direction || d === direction) && (!surface || sfc === surface);
    }).slice(0, topX);

    if (!filtered.length) return interaction.followUp('⚠️ No matching studs found.');

    for (const stud of filtered) {
      const r = stud.racing || {};
      const stats = stud.stats || {};
      const embed = new EmbedBuilder()
        .setTitle(`🏆 ${stud.name}`)
        .setColor(0xFFD700)
        .setURL(`https://photofinish.live/horses/${stud.id}`)
        .addFields(
          { name: 'Grade', value: `${r.grade || '-'} (${r.subgrade >= 0 ? '+' : ''}${r.subgrade || 0})`, inline: true },
          { name: 'Score / Reason', value: `${stud.score} | ${stud.reason}`, inline: true },
          {
            name: 'Traits',
            value: `Start: ${r.start} | Speed: ${r.speed} | Stamina: ${r.stamina}\nFinish: ${r.finish} | Heart: ${r.heart} | Temper: ${r.temper}`
          },
          { name: 'Racing Style', value: `${r.direction?.value || '-'} / ${r.surface?.value || '-'}`, inline: true },
          {
            name: 'Stats',
            value: `🏆 Wins: ${stats.wins || 0} | Majors: ${stats.majors || 0} | Podium: ${stats.podium}%\n💰 Purse: ${Math.round(stats.biggestPurse).toLocaleString()} Derby`
          }
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`check_bloodline:${stud.id}`)
          .setLabel('🧬 Check Bloodline')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setLabel('🔗 View on PFL')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://photofinish.live/horses/${stud.id}`)
      );

      await interaction.followUp({ embeds: [embed], components: [row] });
    }
  } catch (err) {
    console.error('❌ Error in /winners handler:', err);
    await interaction.followUp('❌ Failed to fetch winners.');
  }
};