const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function greenpeacePHScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://www.greenpeace.org/philippines/press/';

  try {
    console.log('Navigating to Greenpeace Philippines Press page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for the article containers to load
    await page.waitForSelector('div.query-list-item-body', { timeout: 15000 });
    console.log('Article containers found.');

    // Scrape articles
    const articles = await page.evaluate(() => {
      const articleNodes = Array.from(document.querySelectorAll('div.query-list-item-body'));
      return articleNodes.map(article => {
        const titleEl = article.querySelector('h4.query-list-item-headline.wp-block-post-title a');
        const title = titleEl ? titleEl.textContent.trim() : null;
        const url = titleEl ? titleEl.href : null;

        const dateDiv = article.querySelector('div.wp-block-post-date');
        const date = dateDiv ? dateDiv.textContent.trim() : null;

        return { title, url, date };
      }).filter(article => article.title && article.url);
    });

    if (articles.length === 0) {
      console.log('No articles found!');
      return;
    }

    // Limit to 10 results
    const limitedArticles = articles.slice(0, 10);

    // Save to JSON
    const filename = 'greenpeacePH.json';
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

greenpeacePHScraper();