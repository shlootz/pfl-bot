const { simulateBreeding } = require('./scripts/simulateBreeding');
const mare = await queryHorseById('MareUUID');
const stud = await queryHorseById('StudUUID');
const results = simulateBreeding(mare, stud, 1000);
console.log(results);