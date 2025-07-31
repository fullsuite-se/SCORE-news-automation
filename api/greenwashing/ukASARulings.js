const isVercelEnvironment = !!process.env.AWS_REGION;

async function getBrowserModules() {
  const puppeteer = await import('puppeteer-core');
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
    puppeteer,
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
        args: chromiumArgs,
        defaultViewport: chromiumDefaultViewport,
        executablePath: executablePath,
        headless: true,
      }
    : {
        headless: true,
        defaultViewport: null,
        slowMo: 50,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      };

  let browser;
  const baseUrl = 'https://www.asa.org.uk';
  const url = `${baseUrl}/codes-and-rulings/rulings.html?q=environmental+claims&sort_order=recent&from_date=&to_date=`;

  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    console.log(`Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    console.log('Waiting for ruling items to load...');
    await page.waitForSelector('li.icon-listing-item', { timeout: 15000 });
    console.log('Ruling items found.');

    const articles = await page.evaluate((origin) => {
      const results = [];
      const seenUrls = new Set(); // For deduplication
      const items = document.querySelectorAll('li.icon-listing-item');

      items.forEach(item => {
        let title = null;
        let url = null;
        let date = 'N/A';

        const linkEl = item.querySelector('a');
        const titleEl = item.querySelector('h4.heading');

        const metaSpans = item.querySelectorAll('ul.meta-listing > li > span');
        if (metaSpans.length >= 3 && metaSpans[2]) {
          date = metaSpans[2].textContent.trim();
        }

        if (linkEl) {
          url = new URL(linkEl.getAttribute('href'), origin).href;
        }

        if (titleEl) {
          title = titleEl.textContent.trim();
        }

        if (title && url && !seenUrls.has(url)) {
          seenUrls.add(url);
          results.push({ title, url, date });
        }
      });

      console.log(`Found ${results.length} articles on listing page.`);
      return results.slice(0, 10);
    }, baseUrl);

    if (articles.length === 0) {
      console.log('No articles found on the page after scraping.');
      return res.status(200).json({ message: 'No articles found' });
    }

    console.log(`Scraped ${articles.length} articles (limited to 10).`);
    res.status(200).json(articles);

  } catch (err) {
    console.error('Scraping failed:', err.message);
    console.error(err);
    res.status(500).json({ error: 'Scraping failed', details: err.message });
  } finally {
    console.log('Closing browser.');
    if (browser) {
      await browser.close();
    }
  }
}
