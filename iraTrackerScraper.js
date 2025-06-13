const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function iraTrackerScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://iratracker.org/actions/';

  try {
    console.log('Navigating to IRA Tracker Actions page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    await page.waitForSelector('div.facetwp-template', { timeout: 15000 });
    console.log('Article container loaded.');

    const articles = await page.evaluate(() => {
      const container = document.querySelector('div.facetwp-template');
      const articlesList = [];

      if (!container) return [];

      const entries = container.querySelectorAll('article');

      entries.forEach(entry => {
        const titleEl = entry.querySelector('h2.entry-title a.entry-title-link');
        const title = titleEl?.textContent.trim() || null;
        const url = titleEl?.href || null;

        const dateEl = entry.querySelector('div.action-date');
        const date = dateEl?.textContent.trim() || 'Date not found';

        if (title && url) {
          articlesList.push({ title, url, date });
        }
      });

      return articlesList;
    });

    if (articles.length === 0) {
      console.log('No articles found!');
      return;
    }

    const limitedArticles = articles.slice(0, 10);

    const filename = 'iraTracker.json';
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

iraTrackerScraper();
