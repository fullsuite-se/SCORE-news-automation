const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function columbiaClimateScraper() {
  const browser = await puppeteer.launch({ headless: false, defaultViewport: null, slowMo: 50 });
  const page = await browser.newPage();
  const url = 'https://climate.law.columbia.edu/node/1890';

  try {
    console.log('Navigating to Columbia Climate Law page...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });

    await page.waitForSelector('h2.field-content a', { timeout: 15000 });

    const articles = await page.evaluate(() => {
      const articleLinks = document.querySelectorAll('h2.field-content a');
      const seen = new Set();
      const items = [];

      articleLinks.forEach(link => {
        const url = link.href;
        const title = link.textContent.trim();

        if (url && title && !seen.has(url)) {
          seen.add(url);
          items.push({ title, url });
        }
      });

      return items.slice(0, 10);
    });

    if (!articles.length) {
      console.log('No articles found!');
      return;
    }

    console.log(`Extracting publication dates from ${articles.length} articles...`);

    for (const article of articles) {
      try {
        const articlePage = await browser.newPage();
        await articlePage.goto(article.url, { waitUntil: 'domcontentloaded', timeout: 0 });

        const date = await articlePage.evaluate(() => {
          const timeEl = document.querySelector('div.views-field.views-field-field-cu-date time');
          return timeEl ? timeEl.getAttribute('datetime') : 'Date not found';
        });

        article.date = date;
        await articlePage.close();
      } catch (err) {
        console.error(`Error extracting date for ${article.url}: ${err.message}`);
        article.date = 'Date not found';
      }
    }

    const filename = 'columbiaClimate.json';
    const filePath = path.join(process.cwd(), filename);
    fs.writeFileSync(filePath, JSON.stringify(articles, null, 2), 'utf8');

    console.log(`\n JSON saved to: ${filePath}`);
    console.log(` ${articles.length} articles scraped.`);
  } catch (err) {
    console.error(' Scraper failed:', err);
  } finally {
    await browser.close();
  }
}

columbiaClimateScraper();
