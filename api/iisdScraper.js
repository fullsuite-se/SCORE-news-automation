import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Apply the stealth plugin globally once for the puppeteer-extra instance.
// This should be done at the top level of the module.
puppeteer.use(StealthPlugin());

const isVercelEnvironment = !!process.env.AWS_REGION;

async function getBrowserModules() {
  // puppeteer-extra is already configured with StealthPlugin at the top level.
  // We now only need @sparticuz/chromium for the executable path and arguments.
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
  } else {
    executablePathValue = ChromiumClass.executablePath;
  }

  return {
    puppeteer, // This is the puppeteer-extra instance with StealthPlugin applied
    chromiumArgs: ChromiumClass.args,
    chromiumDefaultViewport: ChromiumClass.defaultViewport,
    executablePath: executablePathValue
  };
}

export default async function (req, res) {
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
        args: chromiumArgs, // Use args from @sparticuz/chromium which include --no-sandbox
        defaultViewport: chromiumDefaultViewport,
        executablePath: executablePath,
        headless: true,
      }
    : {
        headless: true,
        defaultViewport: null,
        slowMo: 50,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      };

  let browser;
  const baseUrl = 'https://enb.iisd.org';
  const url = `${baseUrl}/archives`;

  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    // Set User-Agent for the page. Stealth plugin handles many other detections.
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

      console.log(`Found ${results.length} article links on listing page.`);
      return results.slice(0, 10);
    });

    if (articleLinks.length === 0) {
      console.warn('No article links found.');
      return res.status(200).json({ message: 'No article links found' });
    }

    const articles = [];
    const seenUrls = new Set(); // For overall deduplication of final articles

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
        // Check if the page is potentially blocked by Cloudflare or similar
        if (title && title.trim().toLowerCase() !== 'just a moment...') {
          articles.push({
            title: title.trim(),
            url: link
          });
        } else {
          console.warn(`Skipped Cloudflare-protected page (or similar block): ${link}`);
        }
      } catch (err) {
        console.warn(`Failed to fetch article at ${link}: ${err.message}`);
      } finally {
        await newPage.close();
        await new Promise(res => setTimeout(res, 500)); // polite delay
      }
    }

    if (articles.length === 0) {
      console.warn('No valid articles collected.');
      return res.status(200).json({ message: 'No valid articles collected' });
    }

    console.log(`Returning ${articles.length} articles.`);
    res.status(200).json(articles);

  } catch (err) {
    console.error('Error during scraping:', err.message);
    res.status(500).json({ error: 'Scraping failed', details: err.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
