const puppeteer = require("puppeteer");
const fs = require("fs");

const horseUrl = process.argv[2];
if (!horseUrl) {
  console.error("❌ Please provide a horse URL as an argument.");
  process.exit(1);
}

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  console.log(`🔄 Loading horse page: ${horseUrl}`);
  await page.goto(horseUrl, { waitUntil: "networkidle2", timeout: 60000 });

  try {
    // ✅ Grab the embedded JSON inside <script id="__NEXT_DATA__">
    const jsonData = await page.$eval("#__NEXT_DATA__", el => el.textContent);
    const parsed = JSON.parse(jsonData);

    // Navigate to the horse data object
    const horseJson = parsed?.props?.pageProps?.horse;
    if (!horseJson) {
      throw new Error("Horse data not found in pageProps");
    }

    // Map data to clean structure
    const data = {
      id: horseJson.id || null,
      name: horseJson.name || null,
      grade: horseJson.racing?.grade || null,
      heart: horseJson.racing?.heart || null,
      speed: horseJson.racing?.speed || null,
      start: horseJson.racing?.start || null,
      finish: horseJson.racing?.finish || null,
      temper: horseJson.racing?.temper || null,
      stamina: horseJson.racing?.stamina || null,
      direction: horseJson.racing?.direction?.value || null,
      surface: horseJson.racing?.surface?.value || null,
      condition: horseJson.racing?.condition?.value || null,
      age: horseJson.age || null,
      gender: horseJson.gender || null,
      tier: horseJson.tier || null,
      owner: horseJson.stableName || null
    };

    // Save to JSON
    const filename = `horse_${data.id}.json`;
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`✅ Horse data scraped successfully: ${filename}`);
    
  } catch (err) {
    console.error("❌ Error extracting horse data:", err.message);
  }

  await browser.close();
})();