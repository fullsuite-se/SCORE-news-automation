const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function alMonitorScraper() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    slowMo: 50,
  });

  const page = await browser.newPage();
  const url = 'https://www.al-monitor.com/contents/trending-topics/environment-and-nature';

  try {
    console.log(' Navigating to Al-Monitor...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });

    await page.waitForSelector('div.card__heading', { timeout: 10000 });

    const articles = await page.evaluate(() => {
      const seen = new Set();
      const articleNodes = document.querySelectorAll('div.card__heading');
      const results = [];

      articleNodes.forEach(node => {
        const linkElem = node.querySelector('a.heading__link');
        const title = linkElem?.textContent?.trim() || null;
        let url = linkElem?.getAttribute('href') || null;

        if (url && !url.startsWith('http')) {
          url = 'https://www.al-monitor.com' + url;
        }

        if (title && url && !seen.has(title)) {
          seen.add(title);
          results.push({ title, url });
        }
      });

      return results.slice(0, 10);
    });

    const finalResults = [];

    for (const article of articles) {
      const articlePage = await browser.newPage();
      try {
        await articlePage.goto(article.url, { waitUntil: 'domcontentloaded', timeout: 0 });
        await articlePage.waitForSelector('div.node__author_data div.node__dates', { timeout: 5000 });

        const date = await articlePage.evaluate(() => {
          const dateElem = document.querySelector('div.node__author_data div.node__dates');
          return dateElem?.textContent?.trim() || null;
        });

        if (date) {
          article.date = date;
          finalResults.push(article);
        } else {
          console.log(` Skipping paywalled or undated article: ${article.url}`);
        }
      } catch (err) {
        console.log(` Skipping article due to error or paywall: ${article.url}`);
      } finally {
        await articlePage.close();
      }
    }

    const filename = 'alMonitor.json';
    const filepath = path.join(process.cwd(), filename);
    fs.writeFileSync(filepath, JSON.stringify(finalResults, null, 2), 'utf8');

    console.log(` Scraped ${finalResults.length} articles and saved to ${filename}`);
  } catch (err) {
    console.error(' Error during scraping:', err.message);
  } finally {
    await browser.close();
  }
}

alMonitorScraper();

//Can only scrape articles not locked behind a paywall. Skips paywall exclusive articles.
