const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function forwardLawReviewScraper() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    slowMo: 50,
  });
  const page = await browser.newPage();
  const url = 'https://forwardlawreview.com/category/news/';

  try {
    console.log('Navigating to Forward Law Review News page...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });

    await page.waitForSelector('div.td-module-meta-info', { timeout: 10000 });

    const articles = await page.evaluate(() => {
      const articleNodes = document.querySelectorAll('div.td-module-meta-info');
      const seen = new Set();
      const results = [];

      articleNodes.forEach(node => {
        const linkTag = node.querySelector('h3.entry-title.td-module-title > a');
        const timeTag = node.querySelector('div.td-editor-date time');

        if (!linkTag || !timeTag) return;

        const url = linkTag.href.trim();
        const title = linkTag.getAttribute('title')?.trim() || linkTag.textContent.trim();
        const date = timeTag.getAttribute('datetime') || timeTag.textContent.trim();

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

    const filename = 'forwardLawReview.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');

    console.log(`\n JSON saved at: ${fullPath}`);
    console.log(` ${articles.length} articles scraped.`);
  } catch (err) {
    console.error(' Error scraping:', err);
  } finally {
    await browser.close();
  }
}

forwardLawReviewScraper();
