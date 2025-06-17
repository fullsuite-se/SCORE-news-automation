const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function ecowatchScraper() {
  const browser = await puppeteer.launch({ headless: true, defaultViewport: null, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://www.ecowatch.com/policy/';

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });

    await page.waitForSelector('div.home-category-posts__list-item', { timeout: 10000 });

    const articles = await page.evaluate(() => {
      const articleNodes = document.querySelectorAll('div.home-category-posts__list-item');
      const seen = new Set();
      const results = [];

      articleNodes.forEach(node => {
        const linkTag = node.querySelector('a');
        const titleTag = node.querySelector('h3');
        const timeTag = node.querySelector('time');

        if (!linkTag || !titleTag || !timeTag) return;

        const url = linkTag.href.trim();
        const title = titleTag.textContent.trim();
        const date = timeTag.getAttribute('datetime') || timeTag.textContent.trim();

        const uniqueKey = `${title}||${url}`;
        if (!seen.has(uniqueKey)) {
          seen.add(uniqueKey);
          results.push({ title, url, date });
        }
      });

      return results.slice(0, 10);
    });

    if (!articles.length) {
      console.log('No articles found!');
      return;
    }

    const filename = 'ecowatch.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');

    console.log(`\nJSON saved at: ${fullPath}`);
  } catch (err) {
    console.error('Error scraping:', err);
  } finally {
    await browser.close();
  }
}

ecowatchScraper();
