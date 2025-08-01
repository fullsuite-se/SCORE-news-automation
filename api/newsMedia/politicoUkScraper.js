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
  const baseUrl = 'https://www.politico.eu/section/energy-uk/';

  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    console.log(`Navigating to: ${baseUrl}`);
    await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    console.log('Waiting for post containers...');
    await page.waitForSelector('div.card__content', { timeout: 60000 });
    console.log('Post containers found.');

    const articles = await page.evaluate(() => {
      const results = [];
      const seenUrls = new Set(); // Added for deduplication
      const newsItems = document.querySelectorAll('div.card__content');

      newsItems.forEach(container => {
        let title = null;
        let url = null;
        let date = null;

        const aTag = container.querySelector('h2.card__title a');
        const dateEl = container.querySelector('div.date-time.card__date-time.after-title span.date-time__date');

        if (aTag) {
          title = aTag.textContent.trim();
          url = new URL(aTag.getAttribute('href'), window.location.origin).href;
        }

        if (dateEl) {
          date = dateEl.textContent.trim();
        }

        if (title && url && date) {
          if (!seenUrls.has(url)) { // Check for unique URLs
            seenUrls.add(url);
            results.push({ title, url, date });
          }
        }
      });

      console.log(`Found ${results.length} articles on listing page.`);
      return results.slice(0, 10);
    });

    if (articles.length === 0) {
      console.log('No articles found on the page after scraping.');
      return res.status(200).json({ message: 'No articles found' });
    }

    console.log(`Returning ${articles.length} articles.`);
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
