const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const path = require('path');

const width = 600;
const height = 600;
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

const gradeMap = { F: 1, D: 2, C: 3, B: 4, A: 5, S: 6, 'S+': 7, 'SS-': 8, SS: 9 };

async function generateRadarChart(traitStats, filename = 'radar.png') {
  const traits = ['start', 'speed', 'stamina', 'finish', 'heart', 'temper'];
  const labels = traits.map(t => t.toUpperCase());
  const values = traits.map(t => gradeMap[traitStats[t]?.median] || 0);

  const config = {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: 'Median Trait Grade',
        data: values,
        backgroundColor: 'rgba(0, 174, 239, 0.3)',
        borderColor: 'rgba(0, 174, 239, 1)',
        pointBackgroundColor: 'rgba(0, 174, 239, 1)',
        borderWidth: 2
      }]
    },
    options: {
      scales: {
        r: {
          suggestedMin: 0,
          suggestedMax: 9,
          ticks: { display: false },
          pointLabels: { font: { size: 14 } },
          grid: { circular: true }
        }
      },
      plugins: { legend: { display: false } }
    }
  };

  return await chartJSNodeCanvas.renderToBuffer(config, 'image/png');
}

module.exports = { generateRadarChart };