// utils/generateFleetFigureTrendChart.js

const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

const width = 600;
const height = 400;
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

async function generateFleetFigureTrendChart(ffStats, mareName, studName) {
  const allAges = Object.keys(ffStats).sort((a, b) => parseInt(a) - parseInt(b));
  const parents = [mareName, studName];

  const parentSeries = {};
  for (const parent of parents) {
    parentSeries[parent] = allAges.map(age => ffStats[age]?.[parent]?.median ?? null);
  }

  const config = {
    type: 'line',
    data: {
      labels: allAges,
      datasets: [
        {
          label: mareName,
          data: parentSeries[mareName],
          borderColor: '#22D3EE',
          backgroundColor: '#22D3EE',
          fill: false,
          tension: 0.4,
          borderWidth: 2
        },
        {
          label: studName,
          data: parentSeries[studName],
          borderColor: '#FACC15',
          backgroundColor: '#FACC15',
          fill: false,
          tension: 0.4,
          borderDash: [4, 4],
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: false,
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#ccc' }
        },
        title: {
          display: true,
          text: `Fleet Figures By Age – ${mareName} & ${studName}`,
          color: '#ccc',
          font: { size: 16 }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: 'Age',
            color: '#ccc'
          },
          ticks: { color: '#ccc' }
        },
        y: {
          title: {
            display: true,
            text: 'FF Averages',
            color: '#ccc'
          },
          ticks: { color: '#ccc' }
        }
      }
    },
    plugins: [
      {
        id: 'darkBackground',
        beforeDraw: (chart) => {
          const { ctx, width, height } = chart;
          ctx.save();
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
        }
      }
    ]
  };

  return await chartJSNodeCanvas.renderToBuffer(config, 'image/png');
}

module.exports = { generateFleetFigureTrendChart };
