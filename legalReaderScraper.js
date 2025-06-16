const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function legalReaderScraper() {
  const browser = await puppeteer.launch({ headless: false, defaultViewport: null, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://www.legalreader.com/lawsuits-litigation/';

  try {
    console.log('Navigating to Legal Reader Lawsuits & Litigation page...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });

    await page.waitForSelector('div.col-md-8', { timeout: 10000 });

    const articles = await page.evaluate(() => {
      const containers = document.querySelectorAll('div.col-md-8');
      const seen = new Set();
      const results = [];

      containers.forEach(div => {
        const titleTag = div.querySelector('h2.post-title a');
        const dateTag = div.querySelector('span.byline span.date');

        if (!titleTag) return;

        const url = titleTag.href;
        const title = titleTag.textContent.trim();
        const date = dateTag ? dateTag.textContent.trim() : 'Date not found';

        if (!seen.has(url)) {
          seen.add(url);
          results.push({ title, url, date });
        }
      });

      return results.slice(0, 10);
    });

    if (!articles.length) {
      console.log('No articles found!');
      return;
    }

    const filename = 'legalReader.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');

    console.log(`\n JSON saved at: ${fullPath}`);
    console.log(` ${articles.length} articles scraped.`);
  } catch (err) {
    console.error('Error scraping:', err);
  } finally {
    await browser.close();
  }
}

legalReaderScraper();
