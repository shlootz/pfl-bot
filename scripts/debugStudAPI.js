require('dotenv').config();
const axios = require('axios');

(async () => {
  const response = await axios.post(
    'https://api.photofinish.live/pfl-pro/marketplace-api/stud-listings',
    {
      limit: 1,
      sortParameters: { criteria: 'Price', order: 'Descending' },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.PFL_API_KEY,
      },
    }
  );

  console.dir(response.data, { depth: null });
})();