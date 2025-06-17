const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function globalComplianceNewsScraper() {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: null,
    slowMo: 50,
  });

  const page = await browser.newPage();
  const url = 'https://www.globalcompliancenews.com/category/esg/';

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });

    await page.waitForSelector('div.post-meta.post-meta-b', { timeout: 10000 });

    const articles = await page.evaluate(() => {
      const nodes = document.querySelectorAll('div.post-meta.post-meta-b');
      const seen = new Set();
      const results = [];

      nodes.forEach(article => {
        const titleTag = article.querySelector('h2.post-title-alt a');
        const dateTag = article.querySelector('div.below time.post-date');

        const title = titleTag?.textContent.trim();
        let url = titleTag?.getAttribute('href')?.trim();
        const date = dateTag?.getAttribute('datetime') || dateTag?.textContent.trim();

        if (url && !url.startsWith('http')) {
          url = 'https://www.globalcompliancenews.com' + url;
        }

        if (title && url && date && !seen.has(title)) {
          seen.add(title);
          results.push({ title, url, date });
        }
      });

      return results.slice(0, 10);
    });

    if (articles.length === 0) {
      console.log(' No articles found.');
      return;
    }

    const filename = 'globalComplianceNews.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');

    console.log(`\nJSON file saved at: ${fullPath}`);
  } catch (err) {
    console.error(' Error during scraping:', err);
  } finally {
    await browser.close();
  }
}

globalComplianceNewsScraper();
