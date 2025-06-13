const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function americaEconomiaScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();

  const url = 'https://www.americaeconomia.com/en';

  try {
    console.log('Navigating to AmericaEconomía …');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for link containers
    await page.waitForSelector('div.field-content, span.field-content', { timeout: 15000 });
    console.log('Article link containers found.');

    const articles = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('div.field-content, span.field-content'));
      const seen = new Set();
      const results = [];

      for (const el of elements) {
        const link = el.querySelector('a');
        if (!link) continue;
        const href = link.href;
        const title = link.textContent.trim();

        if (title && href && !seen.has(href)) {
          seen.add(href);
          results.push({ title, url: href });
        }
      }

      return results;
    });

    if (!articles.length) {
      console.log('No articles found.');
      return;
    }

    const limited = articles.slice(0, 10);
    console.log(`Found ${limited.length} articles. Fetching publication dates…`);

    for (const art of limited) {
      try {
        const articlePage = await browser.newPage();
        await articlePage.goto(art.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const date = await articlePage.evaluate(() => {
          const spanDate = document.querySelector('span[property="schema:dateCreated"]')?.getAttribute('content');
          const nodeDate = document.querySelector('#node-date')?.textContent.trim();
          return spanDate || nodeDate || 'Date not found';
        });

        art.date = date;
        await articlePage.close();
      } catch (e) {
        art.date = 'Error retrieving date';
      }
    }

    const filename = 'americaeconomia.json';
    fs.writeFileSync(path.join(process.cwd(), filename), JSON.stringify(limited, null, 2), 'utf8');
    console.log(`\nSaved JSON to ${filename} with ${limited.length} articles.`);

  } catch (err) {
    console.error('Error scraping:', err.message);
  } finally {
    console.log('Closing browser...');
    await browser.close();
  }
}

americaEconomiaScraper();
