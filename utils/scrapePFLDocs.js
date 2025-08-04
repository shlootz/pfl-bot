const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");

const URL = "https://developers.photofinish.live/#9aa1e0c2-55a5-4307-9aad-df252f3bf1ae";

async function scrapeDocs() {
  try {
    console.log("🔄 Fetching PFL PRO API docs...");
    const { data } = await axios.get(URL);
    const $ = cheerio.load(data);

    // Extract headings and text
    let docs = [];
    $("h1, h2, h3, h4, p, pre, code").each((i, el) => {
      docs.push({
        tag: el.tagName,
        text: $(el).text().trim()
      });
    });

    // Save to JSON file
    fs.writeFileSync("pfl_pro_api_docs.json", JSON.stringify(docs, null, 2));
    console.log("✅ Scraping completed. File saved: pfl_pro_api_docs.json");

  } catch (error) {
    console.error("❌ Error scraping docs:", error.message);
  }
}

scrapeDocs();