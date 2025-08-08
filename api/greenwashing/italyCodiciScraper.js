const isVercelEnvironment = !!process.env.AWS_REGION;

async function getBrowserModules() {
  await import('puppeteer-extra-plugin-stealth/evasions/chrome.app/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/chrome.csi/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/chrome.loadTimes/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/chrome.runtime/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/defaultArgs/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/iframe.contentWindow/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/media.codecs/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/navigator.hardwareConcurrency/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/navigator.languages/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/navigator.permissions/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/navigator.plugins/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/navigator.vendor/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/navigator.webdriver/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/sourceurl/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/user-agent-override/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/webgl.vendor/index.js');
  await import('puppeteer-extra-plugin-stealth/evasions/window.outerdimensions/index.js');

  const puppeteer = (await import('puppeteer-extra')).default;
  // stealth plugin to hide puppeteer
  const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
  puppeteer.use(StealthPlugin());

  const UserPreferencesPlugin = (await import('puppeteer-extra-plugin-user-preferences')).default;
  puppeteer.use(UserPreferencesPlugin());
  const UserDataDirPlugin = (await import('puppeteer-extra-plugin-user-data-dir')).default;
  puppeteer.use(UserDataDirPlugin());
  
  const recaptchaPluginModule = await import('puppeteer-extra-plugin-recaptcha');
  const RecaptchaPlugin = recaptchaPluginModule.default;

  if (isVercelEnvironment) {
    const { default: Chromium } = await import('@sparticuz/chromium');
    
    puppeteerInstance = StealthPlugin;
    // Apply the stealth plugin to the puppeteer-core instance
    puppeteerInstance.use(StealthPlugin());

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
    // Apply all plugins for local development
    puppeteerInstance.use(stealthPlugin());
    puppeteerInstance.use(
      RecaptchaPlugin({
        provider: { id: '2captcha', token: 'YOUR_2CAPTCHA_API_KEY' },
        visualFeedback: true,
      })
    );

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

    console.log(`Navigating to ASIC Newsroom search results: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // --- CAPTCHA Solving Logic (Enabled locally, skipped on Vercel) ---
    if (!isVercelEnvironment && typeof page.solveRecaptchas === 'function') {
      console.log('Checking for reCAPTCHA or hCaptcha challenges...');
      await page.solveRecaptchas();
      console.log('CAPTCHA solving attempted. Proceeding with scraping...');
      await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {});
    }
    // --- End CAPTCHA Logic ---

    const articleListContainerSelector = 'ul#nr-list';
    console.log(`Waiting for article list container: ${articleListContainerSelector}...`);
    try {
      await page.waitForSelector(articleListContainerSelector, { timeout: 15000 });
      console.log('Article list container found.');
    } catch (error) {
      console.error('ERROR: Article list container not found within timeout:', error.message);
      return res.status(500).json({ success: false, error: 'Scraping failed: Article list container not found.' });
    }

    console.log('Starting scraping process within the article list container.');
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
      console.log('Closing browser...');
      await browser.close();
    }
  }
}
