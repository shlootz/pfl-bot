const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

const width = 1000;
const height = 1200;
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

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
const TRAIT_GRADES = Object.keys(DETAILED_TRAIT_SCALE);

async function generateRadarChart(result, mare, stud, histograms, filename = 'radar.png', runs = 1000) {
  const traits = ['start', 'speed', 'stamina', 'finish', 'heart', 'temper'];

  const labels = traits.map((t) => {
    const stat = result[t];
    return stat ? `${t.toUpperCase()}\n${stat.min} → ${stat.max}` : `${t.toUpperCase()}\nN/A`;
  });

  const foalValues = traits.map(t => DETAILED_TRAIT_SCALE[result[t]?.median] ?? 0);

  const getGradeValue = (grade) => DETAILED_TRAIT_SCALE[grade] ?? DETAILED_TRAIT_SCALE['C'];
  const averageValues = traits.map((t) => {
    const mareVal = getGradeValue(mare?.racing?.[t]);
    const studVal = getGradeValue(stud?.racing?.[t]);
    return ((mareVal + studVal) / 2);
  });

  const minValues = traits.map(t => DETAILED_TRAIT_SCALE[result[t]?.min] ?? null);
  const maxValues = traits.map(t => DETAILED_TRAIT_SCALE[result[t]?.max] ?? null);

  const averageFoalGrade = result.averageFoalGrade || 'N/A';
  let scoreForDisplay = result.studScore;
  if ((scoreForDisplay === 'N/A' || scoreForDisplay === undefined || scoreForDisplay === null) && stud?.score !== undefined && stud?.score !== null) {
    scoreForDisplay = stud.score;
  }
  if (scoreForDisplay === undefined || scoreForDisplay === null) {
    scoreForDisplay = 'N/A';
  }
  const avgSubgrade = result.subgrade?.avg || 'N/A';

  const config = {
    type: 'radar',
    data: {
      labels,
      datasets: [
        {
          label: 'Foal Min (Wick)',
          data: minValues,
          backgroundColor: 'rgba(0,0,0,0)',
          borderColor: 'rgba(255,165,0,0.5)',
          borderDash: [3, 3],
          borderWidth: 1.5,
          pointRadius: 0
        },
        {
          label: 'Foal Max (Wick)',
          data: maxValues,
          backgroundColor: 'rgba(0,0,0,0)',
          borderColor: 'rgba(255,165,0,1)',
          borderWidth: 1.5,
          pointRadius: 0
        },
        {
          label: 'Foal Median',
          data: foalValues,
          backgroundColor: 'rgba(0, 174, 239, 0.3)',
          borderColor: 'rgba(0, 174, 239, 1)',
          pointBackgroundColor: 'rgba(0, 174, 239, 1)',
          borderWidth: 2
        },
        {
          label: 'Parents Avg',
          data: averageValues,
          backgroundColor: 'rgba(34, 197, 94, 0.2)',
          borderColor: 'rgba(34, 197, 94, 1)',
          pointBackgroundColor: 'rgba(34, 197, 94, 1)',
          borderDash: [5, 5],
          borderWidth: 2
        }
      ]
    },
    options: {
      scales: {
        r: {
          suggestedMin: 0,
          suggestedMax: DETAILED_SCALE_MAX_VAL,
          ticks: {
            display: true,
            stepSize: 2
          },
          pointLabels: {
            font: { size: 13 },
            color: '#333'
          },
          grid: { circular: true }
        }
      },
      plugins: {
        legend: { display: true },
        centerText: { grade: averageFoalGrade, score: scoreForDisplay, sub: avgSubgrade, title: `${mare.name} (${mare.racing?.grade}) x ${stud.name} (${stud.racing?.grade})`, subtitle: `${runs} Simulated Foals` }
      }
    },
    plugins: [
      {
        id: 'backgroundColor',
        beforeDraw: (chart) => {
          const { ctx, width, height } = chart;
          ctx.save();
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
        }
      },
      {
        id: 'centerText',
        beforeDraw: (chart) => {
          const { ctx, width, height } = chart;
          const { grade, score, sub, title, subtitle } = chart.config.options.plugins.centerText;

          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#333';

          ctx.font = 'bold 24px sans-serif';
          ctx.fillText(title, width / 2, 50);

          ctx.font = 'italic 16px sans-serif';
          ctx.fillText(subtitle, width / 2, 75);

          ctx.font = 'bold 22px sans-serif';
          ctx.fillText(`Grade: ${grade}`, width / 2, height / 2 - 20);

          ctx.font = '16px sans-serif';
          ctx.fillText(`Score: ${score}`, width / 2, height / 2 + 6);
          ctx.fillText(`Sub: ${sub}`, width / 2, height / 2 + 26);
          ctx.restore();
        }
      }
    ]
  };

  const buffer = await chartJSNodeCanvas.renderToBuffer(config, 'image/png');

  return buffer;
}

module.exports = { generateRadarChart };