const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function telegraphScraper() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    slowMo: 50,
  });

  const page = await browser.newPage();
  const url = 'https://www.telegraph.co.uk/climate-change/';

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });

    await page.waitForSelector('div.card__content[data-test="article-comment-content"]', { timeout: 10000 });

    const articles = await page.evaluate(() => {
      const articleNodes = document.querySelectorAll('div.card__content[data-test="article-comment-content"]');
      const seen = new Set();
      const results = [];

      articleNodes.forEach(node => {
        const linkTag = node.querySelector('a.list-headline__link');
        const timeTag = node.querySelector('time.card__date');

        if (!linkTag) return;

        const url = linkTag.href.trim();
        const titleSpan = linkTag.querySelector('span[data-test="headline"] span');
        const title = titleSpan?.textContent?.trim() || linkTag.textContent?.trim();
        const date = timeTag?.textContent?.trim() || 'Date not found';

        //deduplication
        const key = `${title}||${url}`;
        if (title && url && !seen.has(key)) {
          seen.add(key);
          results.push({ title, url, date });
        }
      });

      return results;
    });

    //returns 10 articles
    const limitedArticles = articles.slice(0, 10);

    if (!limitedArticles.length) {
      console.warn('No valid articles found.');
      return;
    }

    const filename = 'telegraphScraper.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(limitedArticles, null, 2), 'utf8');

    console.log(`\nJSON file saved at: ${fullPath}`);
  } catch (err) {
    console.error('Error scraping:', err);
  } finally {
    await browser.close();
  }
}

// Optional scroll helper (not used in main function, but available)
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });
}

telegraphScraper();
