const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function mekongEyeScraper() {
  const browser = await puppeteer.launch({
    headless: false,    //setting it true skips the articles 
    defaultViewport: null,
    slowMo: 50,
  });

  const page = await browser.newPage();
  const url = 'https://www.mekongeye.com/category/regions';

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });
    await page.waitForSelector('div.entry-container', { timeout: 20000 });

    const articles = await page.evaluate(() => {
      const nodes = document.querySelectorAll('div.entry-container');
      const seen = new Set();
      const results = [];

      nodes.forEach(article => {
        const header = article.querySelector('header.entry-header');
        const meta = article.querySelector('div.entry-meta time.entry-date.published');

        const anchor = header?.querySelector('a[rel="bookmark"]');
        let url = anchor?.getAttribute('href')?.trim();
        const title = anchor?.textContent?.trim();

        const date = meta?.getAttribute('datetime') || meta?.textContent?.trim() || null;

        //deduplication
        const uniqueKey = `${title}||${url}`;
        if (title && url && date && !seen.has(uniqueKey)) {
          seen.add(uniqueKey);
          results.push({ title, url, date });
        }
      });

      //returns 10 articles
      return results.slice(0, 10);
    });

    if (articles.length === 0) {
      console.log('No articles found.');
      return;
    }

    const filename = 'mekongEye.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');
    console.log(`\nJSON file saved at: ${fullPath}`);

  } catch (err) {
    console.error('Error during scraping:', err);
  } finally {
    await browser.close();
  }
}

mekongEyeScraper();
