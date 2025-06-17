const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

async function iisdScraper() {
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: null,
    slowMo: 50,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const baseUrl = 'https://enb.iisd.org';
  const url = `${baseUrl}/archives`;

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    );
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    await page.waitForSelector('div.views-row', { timeout: 10000 });

    const articleLinks = await page.evaluate(() => {
      const results = [];
      const seen = new Set();
      const containers = document.querySelectorAll('div.views-row');

      containers.forEach(container => {
        const link = container.querySelector('h3.c-list-item__heading > a.c-list-item__heading-link');
        const href = link?.href?.trim();
        if (href && !seen.has(href)) {
          seen.add(href);
          results.push(href);
        }
      });

      return results.slice(0, 10);
    });

    if (articleLinks.length === 0) {
      console.warn(' No article links found.');
      return;
    }

    const articles = [];
    const seenUrls = new Set();

    for (const link of articleLinks) {
      if (seenUrls.has(link)) continue;
      seenUrls.add(link);

      const newPage = await browser.newPage();
      try {
        await newPage.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
        );
        await newPage.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const title = await newPage.title();
        if (title && title.trim() !== 'Just a moment...') {
          articles.push({
            title: title.trim(),
            url: link
          });
        } else {
          console.warn(`  Skipped Cloudflare-protected page: ${link}`);
        }
      } catch (err) {
        console.warn(`  Failed to fetch article at ${link}: ${err.message}`);
      } finally {
        await newPage.close();
        await new Promise(res => setTimeout(res, 500)); // polite delay
      }
    }

    if (articles.length === 0) {
      console.warn(' No valid articles collected.');
      return;
    }

    const filename = 'iisd-enb-archives.json';
    const fullPath = path.join(process.cwd(), filename);
    fs.writeFileSync(fullPath, JSON.stringify(articles, null, 2), 'utf8');
    console.log(`\n JSON saved at: ${fullPath}`);

  } catch (err) {
    console.error('  Error during scraping:', err.message);
  } finally {
    await browser.close();
  }
}

iisdScraper();
