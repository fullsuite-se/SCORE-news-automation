import puppeteerExtra from 'puppeteer-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteerExtra.use(stealthPlugin());

const isVercelEnvironment = !!process.env.AWS_REGION;

async function getBrowserModules() {
  if (isVercelEnvironment) {
    const { default: ChromiumClass } = await import('@sparticuz/chromium');
    
    const executablePathValue = await ChromiumClass.executablePath();
    
    return {
      puppeteer: puppeteerExtra, // puppeteer-extra will use puppeteer-core on Vercel
      launchOptions: {
        args: ChromiumClass.args,
        defaultViewport: ChromiumClass.defaultViewport,
        executablePath: executablePathValue,
        headless: 'new', // Must be 'new' for serverless functions
      }
    };
  } else {
    const puppeteerInstance = puppeteerExtra;
    return {
      puppeteer: puppeteerInstance,
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
  const url = 'https://www.hkicpa.org.hk/en/News/News-Release';
  const baseUrl = 'https://www.hkicpa.org.hk/';

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

    const articleListContainerSelector = 'div#blist';
    const articleItemSelector = `${articleListContainerSelector} div[tabindex="0"]`;
    console.log(`Waiting for individual article items to load: ${articleItemSelector}...`);

    try {
      await page.waitForSelector(articleItemSelector, { timeout: 15000 });
      console.log('Individual article items found. Starting scraping process.');
    } catch (error) {
      console.error('ERROR: No article items found within timeout:', error.message);
      return res.status(500).json({ success: false, error: 'Scraping failed: Article items not found.' });
    }

    const articles = await page.evaluate((baseURL) => {
      const items = Array.from(document.querySelectorAll(`div#blist div[tabindex="0"]`));
      const seenUrls = new Set();
      const results = [];

      items.forEach(item => {
        let title = null;
        let url = null;
        let date = 'N/A';
        
        const titleEl = item.querySelector('div.wrap h2');
        const linkEl = item.querySelector('a[href]');
        const dateEl = item.querySelector('div.btm strong');

        if (titleEl) {
          title = titleEl.textContent.trim();
        }

        if (linkEl && linkEl.href) {
          url = new URL(linkEl.href, baseURL).href;
        }
        
        if (dateEl) {
          date = dateEl.textContent.trim();
        }

        if (title && url && !seenUrls.has(url)) {
          seenUrls.add(url);
          results.push({ title, url, date });
        }
      });
      console.log(`[Browser Context] Found ${results.length} articles on listing page.`);
      return results;
    }, baseUrl);

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
      console.log('Closing browser...');
      await browser.close();
    }
  }
}