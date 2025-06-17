const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function eiaScraper() {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: null,
    slowMo: 50,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    const url = 'https://eia-international.org/news/';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    await page.waitForSelector('div.item-body', { timeout: 10000 });

    const articles = await page.evaluate(() => {
      const results = [];
      const seenUrls = new Set();
      const items = document.querySelectorAll('div.item-body');

      for (const item of items) {
        const header = item.querySelector('header.item-header a');
        const time = item.querySelector('span.metalabel time');

        if (header && header.href && time && time.dateTime) {
          const articleUrl = header.href.trim();
          const title = header.textContent.trim();
          const date = time.dateTime;

          if (!seenUrls.has(articleUrl)) {
            seenUrls.add(articleUrl);
            results.push({ title, url: articleUrl, date });
          }
        }
        
        if (results.length >= 10) break;
      }

      return results;
    });

    if (articles.length === 0) {
      console.warn('No articles found.');
      return;
    }

    const filename = 'eiaArticles.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');
    console.log(`\n JSON saved at: ${fullPath}`);

  } catch (err) {
    console.error(' Error during scraping:', err.message);
  } finally {
    await browser.close();
  }
}

eiaScraper();
