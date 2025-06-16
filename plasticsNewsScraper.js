const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function plasticsNewsScraper() {
  const browser = await puppeteer.launch({ headless: false, defaultViewport: null, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://www.plasticsnews.com/';

  try {
    console.log('Navigating to Plastics News homepage...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });

    await page.waitForSelector('.feature-view-mode-2-1-2-row, .middle-article-content', { timeout: 10000 });

    const articles = await page.evaluate(() => {
      const articleNodes = [
        ...document.querySelectorAll('.feature-view-mode-2-1-2-row .feature-article-headline a.omnitrack'),
        ...document.querySelectorAll('.middle-article-content .middle-article-headline a.omnitrack')
      ];

      const seen = new Set();
      const results = [];

      articleNodes.forEach(link => {
        const url = link.href;
        const title = link.textContent.trim();

        if (!seen.has(url)) {
          seen.add(url);
          results.push({ title, url });
        }
      });

      return results.slice(0, 10);
    });

    console.log(`Found ${articles.length} articles. Fetching publication dates...`);

    for (const article of articles) {
      try {
        const articlePage = await browser.newPage();
        await articlePage.goto(article.url, { waitUntil: 'domcontentloaded', timeout: 0 });

        const date = await articlePage.evaluate(() => {
          const dateSpan = document.querySelector(
            'div[data-block-plugin-id="crain_node_timestamp"] .node-timestamp span.article-created-date'
          );
          return dateSpan ? dateSpan.textContent.trim() : 'Date not found';
        });

        article.date = date;
        await articlePage.close();
      } catch (err) {
        console.error(`Failed to get date for ${article.url}:`, err.message);
        article.date = 'Date not found';
      }
    }

    const filename = 'plasticsNews.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');

    console.log(`\nJSON saved at: ${fullPath}`);
    console.log(`${articles.length} articles scraped.`);
  } catch (err) {
    console.error('Error scraping:', err);
  } finally {
    await browser.close();
  }
}

plasticsNewsScraper();
