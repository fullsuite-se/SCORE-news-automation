const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function climateInTheCourtsScraper() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    slowMo: 50,
  });

  const page = await browser.newPage();
  const url = 'https://www.climateinthecourts.com/tag/news/';

  try {
    console.log(' Navigating to Climate in the Courts...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });

    await page.waitForSelector('article.gh-card', { timeout: 10000 });

    // Autoscroll for 3 seconds
    await autoScroll(page, 3000);

    const articles = await page.evaluate(() => {
      const nodes = document.querySelectorAll('article.gh-card');
      const seen = new Set();
      const results = [];

      nodes.forEach(article => {
        const wrapper = article.querySelector('.gh-card-wrapper');
        if (!wrapper) return;

        const titleTag = wrapper.querySelector('h3.gh-card-title');
        const dateTag = wrapper.querySelector('footer time.gh-card-date');
        const anchorTag = article.querySelector('a.gh-card-link');

        let url = anchorTag?.getAttribute('href')?.trim() || null;
        if (url && !url.startsWith('http')) {
          url = 'https://www.climateinthecourts.com' + url;
        }

        const title = titleTag?.textContent?.trim() || null;
        const date = dateTag?.getAttribute('datetime') || dateTag?.textContent?.trim() || null;

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

    const filename = 'climateInTheCourts.json';
    const filepath = path.join(process.cwd(), filename);
    fs.writeFileSync(filepath, JSON.stringify(articles, null, 2), 'utf8');

    console.log(` Scraped ${articles.length} articles and saved to ${filepath}`);
  } catch (err) {
    console.error(' Error during scraping:', err);
  } finally {
    await browser.close();
  }
}

// Auto-scroll for a fixed duration
async function autoScroll(page, duration = 3000) {
  await page.evaluate(async (scrollTime) => {
    return new Promise(resolve => {
      const start = Date.now();
      const interval = setInterval(() => {
        window.scrollBy(0, 1000);
        if (Date.now() - start > scrollTime) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }, duration);
}

climateInTheCourtsScraper();
