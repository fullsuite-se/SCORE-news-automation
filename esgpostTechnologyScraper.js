const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function esgpostTechnologyScraper() {
  const browser = await puppeteer.launch({ headless: false, defaultViewport: null, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://esgpost.com/category/technology/';

  try {
    console.log('Navigating to ESGPost Technology page...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });

    await page.waitForSelector('div.cs-entry__inner.cs-entry__content', { timeout: 10000 });

    const articles = await page.evaluate(() => {
      const nodes = document.querySelectorAll('div.cs-entry__inner.cs-entry__content');
      const seen = new Set();
      const results = [];

      nodes.forEach(node => {
        const titleTag = node.querySelector('h2.cs-entry__title a');
        const dateTag = node.querySelector('div.cs-entry__post-meta div.cs-meta-date');

        if (!titleTag) return;

        const url = titleTag.href.trim();
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

    const filename = 'esgpostTechnology.json';
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

esgpostTechnologyScraper();
