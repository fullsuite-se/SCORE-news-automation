const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function belgiumJepScraper() {
  const browser = await puppeteer.launch({
    headless: true,
    slowMo: 50,
    defaultViewport: null
  });

  try {
    const page = await browser.newPage();
    const url = 'https://www.jep.be/fr/decisions-du-jep/?_onderzoekscriteria=environnement';
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    const articles = await page.evaluate(() => {
      const seen = new Set();
      const items = Array.from(document.querySelectorAll('h3 > a'));
      const results = [];

      for (const link of items) {
        const href = link.href;
        const titleFont = link.querySelector('font');
        const title = titleFont ? titleFont.textContent.trim() : link.textContent.trim();

        if (href && title && !seen.has(href)) {
          seen.add(href);
          results.push({ title, url: href });
        }

        if (results.length >= 10) break;
      }

      return results;
    });

    for (let i = 0; i < articles.length; i++) {
      try {
        const articlePage = await browser.newPage();
        await articlePage.goto(articles[i].url, { waitUntil: 'networkidle2', timeout: 60000 });

        const date = await articlePage.evaluate(() => {
          const dateDivs = Array.from(document.querySelectorAll('div.jet-listing-dynamic-field__content'));
          if (!dateDivs.length) return null;

          const lastDiv = dateDivs[dateDivs.length - 1];
          const fullText = lastDiv.innerText.trim();
          const cleaned = fullText.replace(/Date de clôture\s*:?\s*/i, '').trim();
          const match = cleaned.match(/(\d{1,2}\s+[a-zéûîèêôîàäëïöüç]+\s+\d{4})/i);
          return match ? match[1] : cleaned;
        });

        articles[i].date = date || 'N/A';
        await articlePage.close();

      } catch (err) {
        console.warn(`Failed to fetch date for: ${articles[i].url}`);
        articles[i].date = 'N/A';
      }
    }

    const filename = 'belgiumJepArticles.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');
    console.log(`\n JSON saved at: ${fullPath}`);

  } catch (err) {
    console.error('Scraping failed:', err.message);
  } finally {
    await browser.close();
  }
}

belgiumJepScraper();
