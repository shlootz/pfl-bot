const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

const width = 600;
const height = 600;
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

// Use the comprehensive DETAILED_TRAIT_SCALE
const DETAILED_TRAIT_SCALE = {
  'D-': 0, 'D': 1, 'D+': 2,
  'C-': 3, 'C': 4, 'C+': 5,
  'B-': 6, 'B': 7, 'B+': 8,
  'A-': 9, 'A': 10, 'A+': 11,
  'S-': 12, 'S': 13, 'S+': 14,
  'SS-': 15, 'SS': 16, 'SS+': 17,
  'SSS-': 18, 'SSS': 19
};
const DETAILED_SCALE_MAX_VAL = 19; // Max value in DETAILED_TRAIT_SCALE (for SSS)

async function generateRadarChart(result, mare, stud, filename = 'radar.png') {
  const traits = ['start', 'speed', 'stamina', 'finish', 'heart', 'temper'];

  // 🔤 Label each trait with its grade range
  const labels = traits.map((t) => {
    const stat = result[t]; // result[t] contains {min, max, median, p75, ssOrBetterChance}
    return stat ? `${t.toUpperCase()}\n${stat.min} → ${stat.max}` : `${t.toUpperCase()}\nN/A`;
  });

  // 📊 Foal trait median values using DETAILED_TRAIT_SCALE
  const foalValues = traits.map(t => DETAILED_TRAIT_SCALE[result[t]?.median] ?? 0);

  // 📈 Average values of Mare + Stud using DETAILED_TRAIT_SCALE
  const getGradeValue = (grade) => DETAILED_TRAIT_SCALE[grade] ?? 0; // Default to 0 if grade not in scale
  const averageValues = traits.map((t) => {
    const mareVal = getGradeValue(mare?.racing?.[t]);
    const studVal = getGradeValue(stud?.racing?.[t]);
    // Ensure mareVal and studVal are numbers before averaging
    const numMareVal = typeof mareVal === 'number' ? mareVal : (DETAILED_TRAIT_SCALE['C'] || 4); // Default to C if undefined
    const numStudVal = typeof studVal === 'number' ? studVal : (DETAILED_TRAIT_SCALE['C'] || 4);
    return ((numMareVal + numStudVal) / 2); // Keep as number for chart.js, it will format
  });

  // 🧬 Center text data - updated field names
  const averageFoalGrade = result.averageFoalGrade || 'N/A';
  
  // Prioritize studScore from simulation result (what simulateBreeding used).
  // Fallback to score on the stud object passed directly to generateRadarChart, if available.
  let scoreForDisplay = result.studScore;
  if ((scoreForDisplay === 'N/A' || scoreForDisplay === undefined || scoreForDisplay === null) && stud?.score !== undefined && stud?.score !== null) {
    scoreForDisplay = stud.score;
  }
  // Final fallback if still not found
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
          suggestedMax: DETAILED_SCALE_MAX_VAL, // Use the max value from the new scale
          ticks: {
            display: true, // Optionally display ticks for the new scale
            stepSize: 2 // Example step size
          },
          pointLabels: {
            font: { size: 13 },
            color: '#333'
          },
          grid: { circular: true }
        }
      },
      plugins: {
        legend: { display: false },
        // Pass updated values to centerText plugin
        centerText: { grade: averageFoalGrade, score: scoreForDisplay, sub: avgSubgrade }
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