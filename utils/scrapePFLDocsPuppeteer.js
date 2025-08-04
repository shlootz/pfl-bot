const puppeteer = require("puppeteer");
const fs = require("fs");

const URL = "https://developers.photofinish.live/#9aa1e0c2-55a5-4307-9aad-df252f3bf1ae";

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  console.log("🔄 Loading PFL PRO API docs...");
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });

  // Wait for content to load (tweak selector if needed)
  await page.waitForSelector("body", { timeout: 10000 });

  // Extract visible text and group by sections
  const docs = await page.evaluate(() => {
    const elements = document.querySelectorAll("h1, h2, h3, h4, p, pre, code");
    return Array.from(elements).map(el => ({
      tag: el.tagName,
      text: el.innerText.trim()
    })).filter(item => item.text.length > 0);
  });

  fs.writeFileSync("pfl_pro_api_docs.json", JSON.stringify(docs, null, 2));
  console.log("✅ Scraping completed. File saved: pfl_pro_api_docs.json");

  await browser.close();
})();