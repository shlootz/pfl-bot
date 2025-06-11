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
  const minValues = [];
  const maxValues = [];
  const medians = [];

  traits.forEach(trait => {
    const stat = result[trait];
    if (!stat) {
      minValues.push(0);
      maxValues.push(0);
      medians.push(null);
    } else {
      minValues.push(DETAILED_TRAIT_SCALE[stat.min] ?? 0);
      maxValues.push(DETAILED_TRAIT_SCALE[stat.max] ?? 0);
      medians.push(DETAILED_TRAIT_SCALE[stat.median] ?? 0);
    }
  });


  const config = {
    type: 'bar',
    data: {
      labels: traits.map(t => t.toUpperCase()),
      datasets: [{
        label: 'Trait Range',
        data: new Array(traits.length).fill(1), // dummy bars
        backgroundColor: 'transparent',
        borderWidth: 0,
        datalabels: { display: false }
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `${mare.name} (${mare.racing.grade}) x ${stud.name} (${stud.racing.grade})\n Foal Trait Range (Min–Max) with Median Marker`,
          font: { size: 18 }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const i = ctx.dataIndex;
              const min = minValues[i];
              const max = maxValues[i];
              const median = medians[i];
              const label = ctx.label;
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
        id: 'drawCustomBars',
        afterDatasetsDraw(chart) {
          const { ctx, scales: { x, y } } = chart;

          traits.forEach((_, i) => {
            const min = minValues[i];
            const max = maxValues[i];
            const median = medians[i];
            const yPos = y.getPixelForValue(i);
            const barHeight = y.getPixelForValue(i - 0.4) - y.getPixelForValue(i + 0.4);
            const xMin = x.getPixelForValue(min);
            const xMax = x.getPixelForValue(max);

            // Blue range box
            ctx.save();
            ctx.fillStyle = 'rgba(0, 174, 239, 0.6)';
            ctx.fillRect(xMin, yPos - barHeight / 2, xMax - xMin, barHeight);
            ctx.restore();

            // Black median line
            if (median != null) {
              const xMedian = x.getPixelForValue(median);
              ctx.save();
              ctx.strokeStyle = 'black';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(xMedian, yPos - barHeight / 2);
              ctx.lineTo(xMedian, yPos + barHeight / 2);
              ctx.stroke();
              ctx.restore();
            }
          });
        }
      }
    ]
  };

  return await chartJSNodeCanvas.renderToBuffer(config);
}

module.exports = { generateTraitBoxImage };