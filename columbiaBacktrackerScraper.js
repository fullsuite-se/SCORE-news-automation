const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function columbiaBacktrackerScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://climate.law.columbia.edu/content/climate-backtracker';

  try {
    console.log('Navigating to Columbia Climate Backtracker page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for article rows to load
    await page.waitForSelector('tr.ng-scope');
    console.log('Post containers found.');

    const articles = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('tr.ng-scope'));
      return rows.map(row => {
        const linkEl = row.querySelector('a[href]');
        const dateEl = row.querySelector('div[ng-bind-html="::item.date"]');

        const url = linkEl ? linkEl.href : null;
        const title = linkEl ? linkEl.textContent.trim() : null;
        const date = dateEl ? dateEl.textContent.trim() : null;

        return url && title ? { title, url, date } : null;
      }).filter(Boolean);
    });

    if (!articles.length) {
      console.log('No articles found!');
      return;
    }

    const limitedArticles = articles.slice(0, 10);

    const filename = 'columbiaBacktracker.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(limitedArticles, null, 2), 'utf8');

    console.log(`\nJSON file saved at: ${fullPath}`);
    console.log('Number of articles saved:', limitedArticles.length);
  } catch (err) {
    console.error('Error scraping:', err);
  } finally {
    console.log('Closing browser...');
    await browser.close();
  }
}

columbiaBacktrackerScraper();
