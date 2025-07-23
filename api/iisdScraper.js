// pages/api/scrape-iisd-enb.js

const isVercelEnvironment = !!process.env.AWS_REGION; // Or check for process.env.VERCEL

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
  
  const { default: ChromiumClass } = await import('@sparticuz/chromium');
  console.log('--- Debugging ChromiumClass object (Vercel) ---');
  console.log('Type of ChromiumClass:', typeof ChromiumClass);
  console.log('Keys of ChromiumClass:', Object.keys(ChromiumClass));
  console.log('Full ChromiumClass object:', ChromiumClass);
  console.log('ChromiumClass.executablePath is a function:', typeof ChromiumClass.executablePath === 'function');
  console.log('ChromiumClass.args:', ChromiumClass.args);
  console.log('ChromiumClass.defaultViewport:', ChromiumClass.defaultViewport);
  console.log('--- End ChromiumClass Debug (Vercel) ---');
  let executablePathValue = null;
  if (typeof ChromiumClass.executablePath === 'function') {
    executablePathValue = await ChromiumClass.executablePath();
    // executablePathValue = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  } else {
    executablePathValue = ChromiumClass.executablePath;
    // executablePathValue = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  }
  console.log('EXECUTABLE PATH VALUE: ', executablePathValue);
  return {
    puppeteer,
    chromiumArgs: ChromiumClass.args,
    chromiumDefaultViewport: ChromiumClass.defaultViewport,
    executablePath: executablePathValue
  };
}

/**
 * @param {object} req - The incoming request object.
 * @param {object} res - The outgoing response object.
 */
export default async function handler(req, res) {
  let browser;
  const baseUrl = 'https://enb.iisd.org';
  const url = `${baseUrl}/archives`;

  try {
    const { puppeteer, chromiumArgs, chromiumDefaultViewport, executablePath } = await getBrowserModules();

    console.log('--- Puppeteer Launch Debug Info (Vercel) ---');
    console.log('isVercelEnvironment:', isVercelEnvironment);
    console.log('chromiumArgs (from @sparticuz/chromium):', chromiumArgs);
    console.log('chromiumDefaultViewport (from @sparticuz/chromium):', chromiumDefaultViewport);
    console.log('Executable Path (from @sparticuz/chromium):', executablePath);
    console.log('--- End Debug Info (Vercel) ---');

    if (isVercelEnvironment && (!executablePath || typeof executablePath !== 'string' || executablePath.trim() === '')) {
      console.error('ERROR: In Vercel environment, executablePath is not valid:', executablePath);
      return res.status(500).json({
        error: 'Puppeteer launch failed: Missing or invalid Chromium executable path for Vercel environment.'
      });
    }

    const launchOptions = isVercelEnvironment
      ? {
          args: chromiumArgs,
          defaultViewport: chromiumDefaultViewport,
          executablePath: executablePath,
          headless: true,
        }
      : {
          headless: true,
          slowMo: 50,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      };

    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    );

    console.log(`Navigating to initial URL: ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log('Waiting for initial articles selector (h3.brxe-vzxxxz.brxe-heading.feed_post__title)...');
    try {
      await page.waitForSelector('h3.brxe-vzxxxz.brxe-heading.feed_post__title', { timeout: 10000 });
      console.log('Initial articles selector found. Proceeding to scrape listing page.');
    } catch (selectorError) {
      console.error(`ERROR: Initial selector not found or timed out: ${selectorError.message}`);
      if (!isVercelEnvironment && browser && page) {
         try {
             await page.screenshot({ path: 'screenshot_initial_selector_timeout.png' });
             console.log('Screenshot saved to screenshot_initial_selector_timeout.png');
         } catch (screenshotErr) {
             console.error('Failed to take screenshot:', screenshotErr.message);
         }
      }
      return res.status(500).json({
        error: 'Scraping failed: Initial article listing selector not found or timed out.',
        details: selectorError.message
      });
    }

    const articleLinks = await page.evaluate(() => {
      console.log('Executing page.evaluate for initial article links...');
      const allLinks = Array.from(document.querySelectorAll('h3.brxe-vzxxxz.brxe-heading.feed_post__title'));
      const seen = new Set();
      const results = [];
      allLinks.forEach(el => {
        const aTag = el.querySelector('a[href]');
        if (!aTag) return;
        const href = aTag.href;
        if (href && !seen.has(href)) {
          seen.add(href);
          results.push(href);
        }
      });
      console.log(`Found ${results.length} unique article links on listing page.`);
      return results.slice(0, 10);
    });

    if (articleLinks.length === 0) {
      console.warn('No article links found on listing page after evaluation.');
      return res.status(200).json([]);
    }

    console.log(`Found ${articleLinks.length} article links. Proceeding to scrape details.`);
    const articles = [];

    for (const link of articleLinks) {
      try {
        console.log(`Navigating to detailed article page: ${link}`);
        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const title = await page.title();
        if (title && title.trim().toLowerCase() !== 'just a moment...') {
          articles.push({
            title: title.trim(),
            url: link,
            date: 'Date not found'
          });
          console.log(`Successfully scraped title for: ${link}`);
        } else {
          console.warn(`Skipped Cloudflare-protected page (or similar block) for: ${link}`);
        }
      } catch (err) {
        console.warn(`Failed to fetch article at ${link}: ${err.message}`);
      } finally {
        await new Promise(res => setTimeout(res, 500));
      }
    }

    if (articles.length === 0) {
      console.warn('No valid articles collected after detailed scraping.');
      return res.status(200).json([]);
    }

    console.log(`Returning ${articles.length} final articles.`);
    res.status(200).json(articles);

  } catch (err) {
    console.error('Error during scraping (main catch block):', err);
    res.status(500).json({ error: 'Scraping failed', details: err.message || 'An unknown error occurred.' });
  } finally {
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
    }
  }
}
