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
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      };

  let browser;
  const startUrl = 'https://codici.org/category/argomenti/comunicati-stampa/';

  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    const articles = [];
    const seen = new Set();
    let currentPageUrl = startUrl;

    while (articles.length < 10 && currentPageUrl) {
      console.log(`Navigating to ${currentPageUrl} (Articles found so far: ${articles.length})...`);
      await page.goto(currentPageUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      await page.waitForSelector('div.col-md-8', { timeout: 10000 });

      const newArticles = await page.evaluate(() => {
        const nodes = document.querySelectorAll('div.col-md-8');
        const results = [];

        nodes.forEach(node => {
          const anchor = node.querySelector('h4.title.arc-title a');
          const dateAnchor = node.querySelector('span.mg-blog-date a');

          const title = anchor?.textContent.trim();
          const url = anchor?.href?.trim();
          const date = dateAnchor?.textContent.trim() || 'No date found';

          if (title && url) {
            results.push({ title, url, date });
          }
        });
        return results;
      });

      for (const article of newArticles) {
        if (!seen.has(article.url)) {
          seen.add(article.url);
          articles.push(article);
          if (articles.length === 10) break;
        }
      }

      if (articles.length < 10) {
        const nextPageHref = await page.evaluate(() => {
          const nextLink = document.querySelector('a.next.page-numbers');
          return nextLink ? nextLink.href : null;
        });

        currentPageUrl = nextPageHref;
        if (!currentPageUrl) {
            console.log('No next page found. Stopping pagination.');
            break;
        }
      }
    }

    if (articles.length === 0) {
      console.warn('No articles found.');
      return res.status(200).json({ message: 'No articles found' });
    }

    console.log(`Returning ${articles.length} articles.`);
    res.status(200).json(articles);

  } catch (err) {
    console.error('Scraping failed:', err.message);
    res.status(500).json({ error: 'Scraping failed', details: err.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
