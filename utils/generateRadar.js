const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

const width = 600;
const height = 600;
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

const gradeMap = { F: 1, D: 2, C: 3, B: 4, A: 5, S: 6, 'S+': 7, 'SS-': 8, SS: 9 };

async function generateRadarChart(result, mare, stud, filename = 'radar.png') {
  const traits = ['start', 'speed', 'stamina', 'finish', 'heart', 'temper'];

  // 🔤 Label each trait with its grade range
  const labels = traits.map((t) => {
    const stat = result[t];
    return stat ? `${t.toUpperCase()}\n${stat.min} → ${stat.max}` : `${t.toUpperCase()}\nN/A`;
  });

  // 📊 Foal trait median values
  const foalValues = traits.map(t => gradeMap[result[t]?.median] || 0);

  // 📈 Average values of Mare + Stud
  const getGradeValue = (grade) => gradeMap[grade] ?? 0;
  const averageValues = traits.map((t) => {
    const mareVal = getGradeValue(mare?.racing?.[t]);
    const studVal = getGradeValue(stud?.racing?.[t]);
    return ((mareVal + studVal) / 2).toFixed(2);
  });

  // 🧬 Center text data
  const grade = result.grade || stud?.stats?.grade || 'N/A';
  const score = result.score || stud?.score || 'N/A';
  const sub = result.subgrade?.avg || 'N/A';

  const config = {
    type: 'radar',
    data: {
      labels,
      datasets: [
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
          suggestedMax: 9,
          ticks: { display: false },
          pointLabels: {
            font: { size: 13 },
            color: '#333'
          },
          grid: { circular: true }
        }
      },
      plugins: {
        legend: { display: false },
        centerText: { grade, score, sub }
      }
    },
    plugins: [
      // Solid white background
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
      // Central info overlay
      {
        id: 'centerText',
        beforeDraw: (chart) => {
          const { ctx, width, height } = chart;
          const { grade, score, sub } = chart.config.options.plugins.centerText;

          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#333';

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

  return await chartJSNodeCanvas.renderToBuffer(config, 'image/png');
}

module.exports = { generateRadarChart };