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

async function autoScroll(page, duration = 3000) {
  await page.evaluate(async (scrollTime) => {
    return new Promise(resolve => {
      const start = Date.now();
      const interval = setInterval(() => {
        window.scrollBy(0, window.innerHeight); // Scroll by viewport height for better loading
        if (Date.now() - start > scrollTime) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }, duration);
  console.log(`Auto-scrolling finished after ${duration}ms.`);
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
  const url = 'https://www.climateinthecourts.com/tag/news/';
  const baseUrl = 'https://www.climateinthecourts.com';

  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });
    await page.waitForSelector('article.gh-card', { timeout: 10000 });

    await autoScroll(page, 3000);

    const articles = await page.evaluate((baseUrl) => {
      const nodes = document.querySelectorAll('article.gh-card');
      const seen = new Set();
      const results = [];

      nodes.forEach(article => {
        const wrapper = article.querySelector('.gh-card-wrapper');
        if (!wrapper) return;

        const titleTag = wrapper.querySelector('h3.gh-card-title');
        const dateTag = wrapper.querySelector('footer time.gh-card-date');
        const anchorTag = article.querySelector('a.gh-card-link');

        let url = anchorTag?.getAttribute('href')?.trim() || null;
        if (url && !url.startsWith('http')) {
          url = baseUrl + url;
        }

        const title = titleTag?.textContent?.trim() || null;
        const date = dateTag?.getAttribute('datetime') || dateTag?.textContent?.trim() || null;

        const uniqueKey = `${title}||${url}`;
        if (title && url && date && !seen.has(uniqueKey)) {
          seen.add(uniqueKey);
          results.push({ title, url, date });
        }
      });

      console.log(`Found ${results.length} articles on listing page.`);
      return results.slice(0, 10);
    }, baseUrl); // Pass baseUrl to the evaluate function

    if (articles.length === 0) {
      console.log('No articles found.');
      return res.status(200).json({ message: 'No articles found' });
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
