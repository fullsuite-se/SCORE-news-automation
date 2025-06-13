
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function acccNewsScraper() {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://www.accc.gov.au/news-centre?type=accc_news&query=environmental&custom_action=%2Fviews%2Fajax';

  try {
    console.log('Navigating to ACCC News Centre...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Wait for article cards
    await page.waitForSelector('div.accc-news.accc-date-card.accc-date-card--full-width', { timeout: 15000 });
    console.log('News items found.');

    const articles = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('div.accc-news.accc-date-card.accc-date-card--full-width'));

      return nodes.map(node => {
        // Title and URL
        const linkEl = node.querySelector('a.accc-date-card__link');
        const url = linkEl ? 'https://www.accc.gov.au' + linkEl.getAttribute('href') : null;

        const titleEl = node.querySelector('.field.field--name-node-title');
        const title = titleEl ? titleEl.textContent.trim() : null;

        // Optional: Summary
        const summaryEl = node.querySelector('.field.field--name-field-acccgov-summary');
        const summary = summaryEl ? summaryEl.textContent.trim() : null;

        // Cleaned Date
        const dateEl = node.querySelector('.field.field--name-dynamic-token-fieldnode-accc-node-post-date');
        let date = dateEl ? dateEl.textContent.trim() : null;
        if (date) {
          date = date.replace(/\s+/g, ' ').replace(/^Published\s*/i, '').trim(); // Remove newlines & "Published"
        }

        return { title, url, summary, date };
      }).filter(article => article.title && article.url);
    });

    if (articles.length === 0) {
      console.log('No articles found!');
      return;
    }

    const limitedArticles = articles.slice(0, 10);

    // Save to JSON
    const filename = 'acccEnvironmentalNews.json';
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

acccNewsScraper();