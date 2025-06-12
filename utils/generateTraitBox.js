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
  const p10Values = [];
  const p90Values = [];
  const medians = [];

  traits.forEach(trait => {
    const stat = result[trait];
    if (!stat) {
      p10Values.push(0);
      p90Values.push(0);
      medians.push(null);
    } else {
      p10Values.push(DETAILED_TRAIT_SCALE[stat.p10] ?? 0);
      p90Values.push(DETAILED_TRAIT_SCALE[stat.p90] ?? 0);
      medians.push(DETAILED_TRAIT_SCALE[stat.median] ?? 0);
    }
  });

  const config = {
    type: 'bar',
    data: {
      labels: traits.map(t => t.toUpperCase()),
      datasets: [{
        label: 'Trait Range',
        data: new Array(traits.length).fill(1),
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
          text: `${mare.name} x ${stud.name} — Foal Trait Distribution (P10–P90 Range w/ Median)`,
          font: { size: 16 }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const i = ctx.dataIndex;
              const p10 = p10Values[i];
              const p90 = p90Values[i];
              const median = medians[i];
              const label = ctx.label;
              return `${label}: ${GRADE_LABELS[p10]} → 🎯 ${GRADE_LABELS[median]} → ${GRADE_LABELS[p90]}`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear', // ✅ critical fix
          min: 0,
          max: 19,
          ticks: {
            stepSize: 1,
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
          const tickHeight = (y.getPixelForTick(1) - y.getPixelForTick(0)) * 0.6;

          traits.forEach((_, i) => {
            const trait = traits[i];
            const stat = result[trait];
            if (!stat) return;

            const safe = val => Math.max(0, Math.min(19, val));

            const p10 = safe(DETAILED_TRAIT_SCALE[stat.p10]);
            const p90 = safe(DETAILED_TRAIT_SCALE[stat.p90]);
            const median = safe(DETAILED_TRAIT_SCALE[stat.median]);
            const min = safe(DETAILED_TRAIT_SCALE[stat.min]);
            const max = safe(DETAILED_TRAIT_SCALE[stat.max]);

            const yPos = y.getPixelForTick(i);
            const xMin = x.getPixelForValue(Math.min(p10, p90));
            const xMax = x.getPixelForValue(Math.max(p10, p90));
            const boxWidth = Math.max(xMax - xMin, 1);

            // 🔷 Blue P10–P90 range box
            ctx.save();
            ctx.fillStyle = 'rgba(0, 174, 239, 0.6)';
            ctx.fillRect(xMin, yPos - tickHeight / 2, boxWidth, tickHeight);
            ctx.restore();

            // ⚫ Black median line
            const xMedian = x.getPixelForValue(median);
            ctx.save();
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(xMedian, yPos - tickHeight / 2);
            ctx.lineTo(xMedian, yPos + tickHeight / 2);
            ctx.stroke();
            ctx.restore();

            // ➖ Whiskers: Min/Max as small black ticks
            const xWhiskerMin = x.getPixelForValue(min);
            const xWhiskerMax = x.getPixelForValue(max);
            const whiskerHeight = tickHeight * 0.25;

            ctx.save();
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(xWhiskerMin, yPos - whiskerHeight);
            ctx.lineTo(xWhiskerMin, yPos + whiskerHeight);
            ctx.moveTo(xWhiskerMax, yPos - whiskerHeight);
            ctx.lineTo(xWhiskerMax, yPos + whiskerHeight);
            ctx.stroke();
            ctx.restore();
          });
        }
      }
    ]
  };

  console.log('📦 RAW result snapshot (as passed to traitbox):');
  traits.forEach(trait => {
    const stat = result[trait];
    console.log(`${trait.toUpperCase()}:`, stat);
  });

  return await chartJSNodeCanvas.renderToBuffer(config);
}

module.exports = { generateTraitBoxImage };