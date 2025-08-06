import fs from 'fs';
import path from 'path';
import puppeteerExtra from 'puppeteer-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(stealthPlugin());

async function getBrowserModules() {
  const puppeteerInstance = puppeteerExtra;
  return {
    puppeteer: puppeteerInstance,
    launchOptions: {
      headless: false,
      slowMo: 50,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
      ],
    }
  };
}

async function main() {
  let browser;
  const url = 'https://www.asic.gov.au/newsroom/search/?tag=sustainable%20finance';

  try {
    const { puppeteer: puppeteerToLaunch, launchOptions } = await getBrowserModules();

    console.log('--- Puppeteer Launch Information ---');
    console.log('Launch Options:', JSON.stringify(launchOptions, null, 2));
    console.log('--- End Launch Info ---');
    
    console.log('Attempting to launch Puppeteer browser...');
    browser = await puppeteerToLaunch.launch(launchOptions);
    const page = await browser.newPage();

    console.log(`Navigating to ASIC Newsroom search results: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const articleListContainerSelector = 'ul#nr-list';
    const articleItemSelector = `${articleListContainerSelector} li`;

    console.log(`Waiting for individual article items to load: ${articleItemSelector}...`);
    try {
      // CRITICAL FIX: Wait for the list items themselves, not just the container
      await page.waitForSelector(articleItemSelector, { timeout: 30000 });
      console.log('Individual article items found. Starting scraping process.');
    } catch (error) {
      console.error('ERROR: No article list items found within timeout.', error.message);
      return; 
    }

    const articles = await page.evaluate((listContainerSel) => {
      const items = Array.from(document.querySelectorAll(`${listContainerSel} li`));
      const seenUrls = new Set();
      const results = [];

      items.forEach(item => {
        const linkEl = item.querySelector('h3 a');
        const dateEl = item.querySelector('p.nr-date');

        const url = linkEl?.href;
        const title = linkEl?.textContent?.trim();
        const date = dateEl?.textContent?.trim().replace(/^Date:\s*/i, '');

        if (title && url && date && !seenUrls.has(url)) {
          seenUrls.add(url);
          results.push({ title, url, date });
        }
      });
      console.log(`[Browser Context] Found ${results.length} articles on listing page.`);
      return results.slice(0, 10);
    }, articleListContainerSelector);

    if (articles.length === 0) {
      console.warn('No articles found matching the specified criteria after scraping.');
    } else {
      console.log(`Successfully scraped ${articles.length} articles.`);
      console.log('\n--- Scraped Data Preview (First 5 Articles) ---');
      console.log(JSON.stringify(articles.slice(0, 5), null, 2));
      console.log('--- End Scraped Data Preview ---');
      
      const filename = 'asic_sustainable_finance_articles.json';
      fs.writeFileSync(path.resolve(filename), JSON.stringify(articles, null, 2), 'utf8');
      console.log(`\nData successfully saved to ${filename} at: ${path.resolve(filename)}`);
    }

  } catch (err) {
    console.error('An unhandled error occurred during the main scraping process:', err.message);
    console.error(err);
  } finally {
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
    }
  }
}

main();