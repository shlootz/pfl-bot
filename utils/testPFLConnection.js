require('dotenv').config();
const fetch = require('node-fetch');

const API_URL = 'https://api.photofinish.live/pfl-pro/horse-api/horse/18c18e00-972b-45b5-b20c-a7db0b835f3f';
const API_KEY = process.env.PFL_API_KEY;
const ACCESS_TOKEN = process.env.PFL_ACCESS_TOKEN; // Make sure you have this in your .env file as well

async function testApi() {
  try {
    const response = await fetch(API_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'Authorization': `Bearer ${ACCESS_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ API Response:', data);
  } catch (error) {
    console.error('❌ API Test Failed:', error.message);
  }
}

testApi();