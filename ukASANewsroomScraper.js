const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function ukASANewsroomScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://www.asa.org.uk/advice-and-resources/news.html';

  try {
    console.log('Navigating to ASA News...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for articles to appear
    await page.waitForSelector('li.listing-item.news-item', { timeout: 15000 });

    const articles = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('li.listing-item.news-item'));
      return items.slice(0, 10).map(item => {
        const linkEl = item.querySelector('a.listing-item-wrapper');
        const titleEl = item.querySelector('h3.heading');
        const metaListItems = item.querySelectorAll('ul.meta-listing > li');

        const url = linkEl ? linkEl.href : null;
        const title = titleEl ? titleEl.textContent.trim() : null;
        const date = metaListItems.length > 1 ? metaListItems[1].textContent.trim() : 'N/A';

        return { title, url, date };
      }).filter(article => article.title && article.url);
    });

    if (articles.length === 0) {
      console.log('No articles found!');
      return;
    }

    // Save to JSON
    const filename = 'uk_asa_newsroom.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');
    console.log(`JSON saved to: ${fullPath}`);
    console.log('Articles saved:', articles.length);
  } catch (err) {
    console.error('Scraping failed:', err.message);
  } finally {
    console.log('Closing browser...');
    await browser.close();
  }
}

ukASANewsroomScraper();
