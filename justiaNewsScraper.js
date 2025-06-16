const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function justiaNewsScraper() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    slowMo: 50,
  });

  const page = await browser.newPage();
  const url = 'https://news.justia.com/';

  try {
    console.log('Navigating to Justia News...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });

    await page.waitForSelector('div.inner-wrapper.entry[itemprop="blogPost"], p.supreme-content', { timeout: 10000 });

    const articles = await page.evaluate(() => {
      const seen = new Set();
      const results = [];

      // Scrape internal Justia articles
      const internalNodes = document.querySelectorAll('div.inner-wrapper.entry[itemprop="blogPost"]');
      internalNodes.forEach(node => {
        const anchor = node.querySelector('a[href]');
        const titleTag = node.querySelector('strong.heading-5[itemprop="name"]');
        const timeTag = node.querySelector('time.post-date.published');

        if (!anchor || !titleTag || !timeTag) return;

        const url = anchor.href;
        const title = titleTag.innerText.trim();
        const date = timeTag.textContent.trim();

        if (!seen.has(url)) {
          seen.add(url);
          results.push({ title, url, date });
        }
      });

      // Scrape external articles (from p.supreme-content)
      const externalNodes = document.querySelectorAll('p.supreme-content');
      externalNodes.forEach(p => {
        const anchor = p.querySelector('a[href][target="_blank"]');
        const spans = p.querySelectorAll('span');

        if (!anchor || spans.length < 2) return;

        const url = anchor.href;
        const title = anchor.innerText.trim();
        const date = spans[1].innerText.trim();

        if (!seen.has(url)) {
          seen.add(url);
          results.push({ title, url, date });
        }
      });

      return results.slice(0, 10);
    });

    if (!articles.length) {
      console.log('No articles found!');
      return;
    }

    const filename = 'justiaNews.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');

    console.log(`\n JSON saved at: ${fullPath}`);
    console.log(` ${articles.length} articles scraped.`);
  } catch (err) {
    console.error('Error scraping:', err);
  } finally {
    await browser.close();
  }
}

justiaNewsScraper();
