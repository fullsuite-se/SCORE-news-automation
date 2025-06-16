const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function greenGuardianScraper() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    slowMo: 50,
  });

  const page = await browser.newPage();
  const url = 'https://mg.co.za/section/the-green-guardian/';

  try {
    console.log(' Navigating to Mail & Guardian - The Green Guardian...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });

    await page.waitForSelector('div.main-archive-meta, div.col-12, div.col-8.padded', { timeout: 10000 });

    const articles = await page.evaluate(() => {
      const selectors = [
        'div.main-archive-meta',
        'div.col-12',
        'div.col-8.padded'
      ];

      const articleNodes = [];
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(node => articleNodes.push(node));
      });

      const seen = new Set();
      const results = [];

      articleNodes.forEach(node => {
        const linkTag = node.querySelector('h1 a, h3 a');
        const title = linkTag?.textContent?.trim() || null;
        let url = linkTag?.getAttribute('href')?.trim() || null;

        if (url && !url.startsWith('http')) {
          url = 'https://mg.co.za' + url;
        }

        if (title && url && !seen.has(title)) {
          seen.add(title);
          results.push({ title, url });
        }
      });

      return results.slice(0, 10);
    });

    for (const article of articles) {
      try {
        const articlePage = await browser.newPage();
        await articlePage.goto(article.url, { waitUntil: 'domcontentloaded', timeout: 0 });

        await articlePage.waitForSelector('div.meta-box-date', { timeout: 5000 });
        const date = await articlePage.$eval('div.meta-box-date', el => el.textContent.trim());
        article.date = date;

        await articlePage.close();
      } catch (err) {
        console.warn(` Skipping article "${article.title}" due to missing date or blocked page.`);
      }
    }

    const filtered = articles.filter(a => a.date);

    const filename = 'greenGuardian.json';
    const filepath = path.join(process.cwd(), filename);
    fs.writeFileSync(filepath, JSON.stringify(filtered, null, 2), 'utf8');

    console.log(` Scraped ${filtered.length} articles and saved to ${filepath}`);
  } catch (err) {
    console.error(' Error during scraping:', err);
  } finally {
    await browser.close();
  }
}

greenGuardianScraper();
