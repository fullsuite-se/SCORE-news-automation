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
  const url = 'https://www.superbancos.gob.pa/en/search/node?keys=ISSB';

  try {
    const { puppeteer, launchOptions } = await getBrowserModules();

    console.log('--- Puppeteer Launch Information ---');
    console.log('Is Vercel Environment:', isVercelEnvironment);
    console.log('Launch Options:', JSON.stringify(launchOptions, null, 2));
    console.log('--- End Launch Info ---');
    
    console.log('Attempting to launch Puppeteer browser...');
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const blockedResources = ['image', 'font', 'stylesheet'];
      if (blockedResources.includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    console.log(`Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });

    const articleListContainerSelector = 'div.region.region-content ol';
    const articleItemSelector = `${articleListContainerSelector} li`;
    console.log(`Waiting for individual article items to load: ${articleItemSelector}...`);

    try {
      await page.waitForSelector(articleItemSelector, { timeout: 30000 });
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

        const titleUrlEl = item.querySelector('h3 a');
        if (titleUrlEl) {
          title = titleUrlEl.textContent.trim();
          url = new URL(titleUrlEl.href, window.location.origin).href;
        }

        if (title && url && !seenUrls.has(url)) {
          seenUrls.add(url);
          results.push({ title, url });
        }
      });
      console.log(`[Browser Context] Found ${results.length} articles on listing page.`);
      return results;
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
