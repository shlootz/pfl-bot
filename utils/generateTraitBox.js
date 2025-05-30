const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const Chart = require('chart.js');

const width = 1200;
const height = 600;
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
const GRADE_LABELS = Object.keys(DETAILED_TRAIT_SCALE);
const traits = ['start', 'speed', 'stamina', 'finish', 'heart', 'temper'];

async function generateTraitBoxImage(result, mare, stud) {
  const config = {
    type: 'bar',
    data: {
      labels: traits.map(t => t.toUpperCase()),
      datasets: traits.map((trait, idx) => {
        const stat = result[trait];
        if (!stat) return null;

        const min = DETAILED_TRAIT_SCALE[stat.min] ?? 0;
        const max = DETAILED_TRAIT_SCALE[stat.max] ?? 0;
        const median = DETAILED_TRAIT_SCALE[stat.median] ?? 0;

        return {
          label: trait.toUpperCase(),
          data: [max - min],
          base: min,
          backgroundColor: 'rgba(0, 174, 239, 0.6)',
          borderColor: 'rgba(0, 174, 239, 1)',
          borderWidth: 1,
          barThickness: 20,
          datalabels: { display: false },
          custom: { median },
        };
      }).filter(Boolean)
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `${mare.name} (${mare.grade}) x ${stud.name} (${stud.grade})\nTrait Range (Min–Max) with Median Marker`,
          font: { size: 18 }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const min = ctx.raw.base;
              const max = min + ctx.raw;
              const median = ctx.dataset.custom?.median;
              const label = ctx.dataset.label;
              return `${label}: ${GRADE_LABELS[min]} → 🎯 ${GRADE_LABELS[median]} → ${GRADE_LABELS[max]}`;
            }
          }
        }
      },
      scales: {
        x: {
          min: 0,
          max: 19,
          ticks: {
            callback: val => GRADE_LABELS[val] ?? val
          },
          title: {
            display: true,
            text: 'Grade Scale (D- to SSS)'
          },
          grid: { color: '#ccc' }
        },
        y: {
          title: { display: true, text: 'Trait' },
          grid: { display: false }
        }
      }
    },
    plugins: [{
      id: 'backgroundColor',
      beforeDraw: (chart) => {
        const { ctx, width, height } = chart;
        ctx.save();
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    }, {
      id: 'drawMedians',
      afterDatasetsDraw(chart) {
        const { ctx, data, chartArea, scales: { x, y } } = chart;

        data.datasets.forEach((dataset, i) => {
          const median = dataset.custom?.median;
          if (median == null) return;

          const yPos = y.getPixelForValue(i);
          const xPos = x.getPixelForValue(median);

          ctx.save();
          ctx.strokeStyle = 'black';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(xPos, yPos - 10);
          ctx.lineTo(xPos, yPos + 10);
          ctx.stroke();
          ctx.restore();
        });
      }
    }]
  };

  return await chartJSNodeCanvas.renderToBuffer(config);
}

module.exports = { generateTraitBoxImage };