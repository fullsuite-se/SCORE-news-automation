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
  const url = 'https://www.asic.gov.au/newsroom/search/?tag=sustainable%20finance';

  try {
    const { puppeteer, launchOptions } = await getBrowserModules();

    console.log('--- Puppeteer Launch Information ---');
    console.log('Is Vercel Environment:', isVercelEnvironment);
    console.log('Launch Options:', JSON.stringify(launchOptions, null, 2));
    console.log('--- End Launch Info ---');
    
    console.log('Attempting to launch Puppeteer browser...');
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    console.log(`Navigating to ASIC Newsroom search results: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const articleListContainerSelector = 'ul#nr-list';
    console.log(`Waiting for individual article items to load: ${articleListContainerSelector} li...`);
    try {
      await page.waitForSelector(`${articleListContainerSelector} li`, { timeout: 60000 });
      console.log('Individual article items found. Starting scraping process.');
    } catch (error) {
      console.error('ERROR: No article items found within timeout:', error.message);
      return res.status(500).json({ success: false, error: 'Scraping failed: Article items not found.' });
    }

    const articles = await page.evaluate((listContainerSel) => {
      const items = Array.from(document.querySelectorAll(`${listContainerSel} li`));
      const seenUrls = new Set();
      const results = [];

      items.forEach(item => {
        let title = null;
        let url = null;
        let date = null;

        const linkEl = item.querySelector('h3 a');
        if (linkEl) {
          title = linkEl.textContent.trim();
          url = new URL(linkEl.href, window.location.origin).href;
        }

        const dateEl = item.querySelector('p.nr-date');
        if (dateEl) {
          date = dateEl.textContent.trim();
          date = date.replace(/^Date:\s*/i, '');
        }

        if (title && url && date && !seenUrls.has(url)) {
          seen.add(url);
          results.push({ title, url, date });
        }
      });
      console.log(`Found ${results.length} articles on listing page.`);
      return results.slice(0, 10);
    }, articleListContainerSelector);

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