const isVercelEnvironment = !!process.env.AWS_REGION;

async function getBrowserModules() {
  let puppeteerInstance;
  let launchOptions;

  const stealthPluginModule = await import('puppeteer-extra-plugin-stealth');
  const stealthPlugin = stealthPluginModule.default;

  if (isVercelEnvironment) {
    const puppeteerCoreModule = await import('puppeteer-core');
    const { default: Chromium } = await import('@sparticuz/chromium');
    
    puppeteerInstance = puppeteerCoreModule;
    puppeteerInstance.use(stealthPlugin());

    const executablePath = await Chromium.executablePath();
    if (!executablePath) {
      throw new Error('Chromium executable path not found on Vercel.');
    }
    
    launchOptions = {
      args: Chromium.args,
      defaultViewport: Chromium.defaultViewport,
      executablePath: executablePath,
      headless: 'new',
    };
  } else {
    const puppeteerExtraModule = await import('puppeteer-extra');
    puppeteerInstance = puppeteerExtraModule.default;
    puppeteerInstance.use(stealthPlugin());

    launchOptions = {
      headless: 'new',
      slowMo: 50,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
      ],
    };
  }

  return { puppeteer: puppeteerInstance, launchOptions };
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

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const articleListContainerSelector = 'ul#nr-list';
    console.log(`Waiting for article list container: ${articleListContainerSelector}...`);
    try {
      await page.waitForSelector(`${articleListContainerSelector} li`, { timeout: 60000 });
      console.log('Article list items found.');
    } catch (error) {
      console.error('ERROR: Article list items not found within timeout:', error.message);
      return res.status(500).json({ success: false, error: 'Scraping failed: Article items not found.' });
    }

    const articles = await page.evaluate((listContainerSel) => {
      const items = document.querySelectorAll(`${listContainerSel} li`);
      const seen = new Set();
      const results = [];

      items.forEach(item => {
        let title = null;
        let url = null;
        let date = null;

        const titleUrlEl = item.querySelector('h3 a');
        if (titleUrlEl) {
          title = titleUrlEl.textContent.trim();
          url = new URL(titleUrlEl.href, window.location.origin).href;
        }

        const dateEl = item.querySelector('p.nr-date');
        if (dateEl) {
          date = dateEl.textContent.trim();
          date = date.replace(/^Date:\s*/i, '');
        }

        if (title && url && date && !seen.has(url)) {
          seen.add(url);
          results.push({ title, url, date });
        }
      });
      console.log(`Found ${results.length} articles on listing page.`);
      return results.slice(0, 10);
    }, articleListContainerSelector);

    if (articles.length === 0) {
      console.warn('No articles found.');
      return res.status(200).json({ success: true, message: 'No articles found', data: [] });
    }

    console.log(`Successfully scraped ${articles.length} articles.`);
    res.status(200).json(articles);

  } catch (err) {
    console.error('An unhandled error occurred during the scraping process:', err.message);
    console.error(err);
    res.status(500).json({ success: false, error: 'Scraping failed', details: err.message });
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
}
