const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function valorESGScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://valor.globo.com/esg/';

  try {
    console.log('Navigating to Valor ESG page...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for content to load
    await page.waitForSelector('div.highlight__content');

    console.log('Extracting article links and titles...');
    const articles = await page.evaluate(() => {
      const selectors = [
        'div.highlight__content[data-track-action="post destaque uber"]',
        'div.highlight__content[data-track-action="post destaque"]',
        'div.highlight__content[data-track-action="post franja"]',
        'div.highlight__content[data-track-action="post tematico"]',
      ];

      const seen = new Set();
      const results = [];

      selectors.forEach(selector => {
        const blocks = document.querySelectorAll(selector);
        blocks.forEach(block => {
          const anchor = block.querySelector('a[href]:not(.is-subscriber-only)');
          const titleEl = block.querySelector('h2.highlight__title');

          if (anchor && titleEl) {
            const url = anchor.href;
            const title = titleEl.textContent.trim();

            if (!seen.has(url)) {
              seen.add(url);
              results.push({ title, url });
            }
          }
        });
      });

      return results;
    });

    if (!articles.length) {
      console.log('No articles found!');
      return;
    }

    console.log(`Found ${articles.length} articles. Fetching publication dates...`);

    // Limit to first 10 articles
    const limitedArticles = articles.slice(0, 10);

    for (const article of limitedArticles) {
      try {
        const articlePage = await browser.newPage();
        await articlePage.goto(article.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const date = await articlePage.evaluate(() => {
          const timeEl = document.querySelector('time[itemprop="datePublished"]');
          const fallback = document.querySelector('p.content-publication-data__updated');
          return timeEl?.getAttribute('datetime') || fallback?.textContent.trim() || 'Date not found';
        });

        article.date = date;
        await articlePage.close();
      } catch (e) {
        console.warn(`Failed to fetch date for ${article.url}: ${e.message}`);
        article.date = 'Date not found';
      }
    }

    // Save to JSON
    const filename = 'valorESG.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(limitedArticles, null, 2), 'utf8');

    console.log(`\nSaved ${limitedArticles.length} articles to: ${fullPath}`);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

valorESGScraper();
