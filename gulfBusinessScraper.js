const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function gulfBusinessScraper() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    slowMo: 50,
  });

  const page = await browser.newPage();
  const url = 'https://gulfbusiness.com/section/climate/';

  try {
    console.log(' Navigating to Gulf Business...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });

    await page.waitForSelector('div.post-title', { timeout: 10000 });

    const links = await page.evaluate(() => {
      const articles = document.querySelectorAll('div.post-title h4 a');
      const seen = new Set();
      const results = [];

      articles.forEach(a => {
        const url = a.getAttribute('href')?.trim();
        const title = a.querySelector('span')?.textContent?.trim();

        if (url && title && !seen.has(title)) {
          seen.add(title);
          results.push({ title, url });
        }
      });

      return results.slice(0, 15); // Try a few extra in case some fail
    });

    const results = [];

    for (const article of links) {
      const articlePage = await browser.newPage();
      try {
        await articlePage.goto(article.url, { waitUntil: 'domcontentloaded', timeout: 0 });

        await articlePage.waitForSelector('div.author-and-date div.thb-post-date', { timeout: 7000 });
        const date = await articlePage.$eval('div.author-and-date div.thb-post-date', el =>
          el.textContent.trim()
        );

        if (date) {
          results.push({ title: article.title, url: article.url, date });
        }
      } catch (err) {
        console.log(` Skipping article due to missing date or access restriction: ${article.url}`);
      } finally {
        await articlePage.close();
      }

      if (results.length === 10) break;
    }

    if (results.length === 0) {
      console.log(' No valid articles with dates found.');
      return;
    }

    const filename = 'gulfBusiness.json';
    const filepath = path.join(process.cwd(), filename);
    fs.writeFileSync(filepath, JSON.stringify(results, null, 2), 'utf8');

    console.log(` Scraped ${results.length} articles and saved to ${filepath}`);
  } catch (err) {
    console.error(' Error during scraping:', err);
  } finally {
    await browser.close();
  }
}

gulfBusinessScraper();
