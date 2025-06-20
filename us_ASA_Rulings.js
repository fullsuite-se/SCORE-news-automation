const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function usASARRulingsScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://www.asa.org.uk/codes-and-rulings/rulings.html?q=environmental+claims&sort_order=recent&from_date=&to_date=';

  try {
    console.log('Navigating to ASA Rulings...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for ruling items to load
    await page.waitForSelector('li.icon-listing-item', { timeout: 15000 });

    const articles = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('li.icon-listing-item'));
      return items.slice(0, 10).map(item => {
        const linkEl = item.querySelector('a');
        const titleEl = item.querySelector('h4.heading');

        const metaSpans = item.querySelectorAll('ul.meta-listing > li > span');
        const date = metaSpans.length >= 3 ? metaSpans[2].textContent.trim() : 'N/A';

        const url = linkEl ? linkEl.href : null;
        const title = titleEl ? titleEl.textContent.trim() : null;

        return { title, url, date };
      }).filter(article => article.title && article.url);
    });

    if (articles.length === 0) {
      console.log('No articles found!');
      return;
    }

    // Save output
    const filename = 'us_asa_rulings.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');
    console.log(`JSON file saved at: ${fullPath}`);
    console.log('Number of rulings saved:', articles.length);
  } catch (err) {
    console.error('Scraping failed:', err.message);
  } finally {
    console.log('Closing browser...');
    await browser.close();
  }
}

usASARRulingsScraper();
