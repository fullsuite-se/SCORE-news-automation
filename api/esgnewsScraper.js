const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function esgnewsScraper() {
  const browser = await puppeteer.launch({ headless: true, defaultViewport: null, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://esgnews.com/';

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });

    await page.waitForSelector('div.tw-max-w-sm.md\\:tw-max-w-prose', { timeout: 10000 });

    const articles = await page.evaluate(() => {
      const nodes = document.querySelectorAll('div.tw-max-w-sm.md\\:tw-max-w-prose');
      const seen = new Set();
      const results = [];

      nodes.forEach(node => {
        const linkTag = node.querySelector('h2 a');
        const timeTag = node.querySelector('time');

        if (!linkTag) return;

        const url = linkTag.href;
        const title = linkTag.textContent.trim();
        const date = timeTag ? timeTag.getAttribute('datetime') || timeTag.textContent.trim() : 'Date not found';

        //deduplication
         const uniqueKey = `${title}||${url}`;
        if (!seen.has(uniqueKey)) {
          seen.add(uniqueKey);
          results.push({ title, url, date });
        }
      });

      //returns 10 articles
      return results.slice(0, 10);
    });

    if (!articles.length) {
      console.log('No articles found!');
      return;
    }

    // Visit each article to get updated/accurate date from article page if needed
    for (let article of articles) {
      try {
        const articlePage = await browser.newPage();
        await articlePage.goto(article.url, { waitUntil: 'domcontentloaded', timeout: 0 });

        const date = await articlePage.evaluate(() => {
          const dateSpan = document.querySelector('time[datetime]');
          return dateSpan ? dateSpan.getAttribute('datetime') || dateSpan.textContent.trim() : null;
        });

        if (date) {
          article.date = date;
        }

        await articlePage.close();
      } catch (err) {
        console.warn(`Could not fetch date for ${article.url}`);
      }
    }

    const filename = 'esgnews.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');

    console.log(`\n JSON saved at: ${fullPath}`);
  } catch (err) {
    console.error('Error scraping:', err);
  } finally {
    await browser.close();
  }
}

esgnewsScraper();
