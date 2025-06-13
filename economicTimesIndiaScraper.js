const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function economicTimesIndiaScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://economictimes.indiatimes.com/topic/esg';

  try {
    console.log('Navigating to Economic Times ESG page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    await page.waitForSelector('div.contentD');
    console.log('Post containers found.');

    const baseUrl = 'https://economictimes.indiatimes.com';

    const articles = await page.evaluate(() => {
      const containers = Array.from(document.querySelectorAll('div.contentD'));
      return containers.map(container => {
        const linkEl = container.querySelector('a.wrapLines.l2');
        const timeEl = container.querySelector('time');

        const url = linkEl?.href?.trim() || null;
        const title = linkEl?.textContent?.trim() || null;
        const date = timeEl?.textContent?.trim() || null;

        return url && title ? { title, url, date } : null;
      }).filter(Boolean);
    });

    if (!articles.length) {
      console.log('No articles found!');
      return;
    }

    const limitedArticles = articles.slice(0, 10);
    const filename = 'economicTimesIndia.json';
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

economicTimesIndiaScraper();
