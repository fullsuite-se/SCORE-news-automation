const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function epaNSWScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://www.epa.nsw.gov.au/news';

  try {
    console.log('Navigating to NSW EPA News page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for the article containers
    await page.waitForSelector('div.nsw-list-item__content', { timeout: 15000 });
    console.log('Article containers found.');

    // Scrape articles
    const articles = await page.evaluate(() => {
      const articleNodes = Array.from(document.querySelectorAll('div.nsw-list-item__content'));
      return articleNodes.map(article => {
        const titleEl = article.querySelector('div.nsw-list-item__title a');
        const title = titleEl ? titleEl.textContent.trim() : null;
        const url = titleEl ? titleEl.href : null;

        const dateEl = article.querySelector('div.nsw-list-item__info');
        let date = dateEl ? dateEl.textContent.trim() : null;

        // Remove "Published on:" or similar prefix
        if (date) {
          date = date.replace(/^Published on:\s*/i, '');
        }

        return { title, url, date };
      }).filter(article => article.title && article.url);
    });

    if (articles.length === 0) {
      console.log('No articles found!');
      return;
    }

    // Limit to 10 results
    const limitedArticles = articles.slice(0, 10);

    // Save to JSON
    const filename = 'epaNSW.json';
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

epaNSWScraper();