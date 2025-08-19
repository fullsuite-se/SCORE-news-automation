const isVercelEnvironment = !!process.env.AWS_REGION;

async function getBrowserModules() {
  const puppeteerExtraModule = await import('puppeteer-extra');
  const puppeteerExtra = puppeteerExtraModule.default;

  const stealthPluginModule = await import('puppeteer-extra-plugin-stealth');
  const stealthPlugin = stealthPluginModule.default;
  
  const UserPreferencesPluginModule = await import('puppeteer-extra-plugin-user-preferences');
  const UserPreferencesPlugin = UserPreferencesPluginModule.default;

  const UserDataDirPluginModule = await import('puppeteer-extra-plugin-user-data-dir');
  const UserDataDirPlugin = UserDataDirPluginModule.default;

  puppeteerExtra.use(stealthPlugin());
  puppeteerExtra.use(UserPreferencesPlugin());
  puppeteerExtra.use(UserDataDirPlugin());

  if (isVercelEnvironment) {
    const { default: ChromiumClass } = await import('@sparticuz/chromium');
    
    const executablePathValue = await ChromiumClass.executablePath();
    
    return {
      puppeteer: puppeteerExtra,
      launchOptions: {
        args: ChromiumClass.args,
        defaultViewport: ChromiumClass.defaultViewport,
        executablePath: executablePathValue,
        headless: 'new',
      }
    };
  } else {
    return {
      puppeteer: puppeteerExtra,
      launchOptions: {
        headless: 'new',
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
}

export default async function handler(req, res) {
  let browser;
  const url = 'https://en.agcm.it/en/media/press-releases/';

  try {
    const { puppeteer, launchOptions } = await getBrowserModules();

    console.log('--- Puppeteer Launch Information ---');
    console.log('Is Vercel Environment:', isVercelEnvironment);
    console.log('Launch Options:', JSON.stringify(launchOptions, null, 2));
    console.log('--- End Launch Info ---');
    
    console.log('Attempting to launch Puppeteer browser...');
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    console.log(`Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const tableSelector = 'div.table-responsive table';
    const rowSelector = `${tableSelector} tbody tr`;

    console.log(`Waiting for the table to load: ${tableSelector}...`);
    try {
      await page.waitForSelector(rowSelector, { timeout: 30000 });
      console.log('Table rows found. Starting scraping process.');
    } catch (error) {
      console.error('ERROR: Table rows not found within timeout:', error.message);
      return res.status(500).json({ success: false, error: 'Scraping failed: Table rows not found.' });
    }

    const articles = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('div.table-responsive table tbody tr'));
      const seenUrls = new Set();
      const results = [];

      rows.forEach(row => {
        const dateCell = row.querySelector('td:first-child');
        const titleUrlCell = row.querySelector('td:nth-child(2) a');

        const date = dateCell ? dateCell.textContent.trim() : null;
        const title = titleUrlCell ? titleUrlCell.textContent.trim() : null;
        const url = titleUrlCell ? new URL(titleUrlCell.href, window.location.origin).href : null;

        if (title && url && date && !seenUrls.has(url)) {
          seenUrls.add(url);
          results.push({ title, url, date });
        }
      });
      console.log(`[Browser Context] Found ${results.length} articles on the page.`);
      return results;
    });

    if (articles.length === 0) {
      console.warn('No articles found matching the specified criteria after scraping.');
      return res.status(200).json({ success: true, message: 'No articles found', data: [] });
    }

    console.log(`Successfully scraped ${articles.length} articles.`);
    return res.status(200).json({ success: true, data: articles });

  } catch (err) {
    console.error('An unhandled error occurred during the main scraping process:', err.message);
    console.error(err);
    return res.status(500).json({ success: false, error: 'Scraping failed', details: err.message });
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
}