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
  const baseUrl = 'https://www.gov.uk/search/guidance-and-regulation?organisations%5b%5d=department-for-environment-food-rural-affairs&parent=department-for-environment-food-rural-affairs';

  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    await page.waitForSelector('li.gem-c-document-list__item', { timeout: 10000 });

    const articles = await page.evaluate(() => {
      const items = document.querySelectorAll('li.gem-c-document-list__item');
      const seen = new Set();
      const results = [];

      items.forEach(item => {
        const titleDiv = item.querySelector('div.gem-c-document-list__item-title');
        if (titleDiv) {
          const link = titleDiv.querySelector('a.govuk-link');
          if (link) {
            const href = link.getAttribute('href');
            const title = link.textContent.trim();
            const url = new URL(href, window.location.origin).href;

            if (title && href && !seen.has(url)) {
              seen.add(url);
              results.push({ title, url });
            }
          }
        }
      });

      console.log(`Found ${results.length} articles on listing page.`);
      return results.slice(0, 10);
    });

    for (let article of articles) {
      try {
        const articlePage = await browser.newPage();
        await articlePage.goto(article.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const date = await articlePage.evaluate(() => {
          const dtElements = Array.from(document.querySelectorAll('dl.gem-c-metadata__list dt.gem-c-metadata__term'));
          for (const dt of dtElements) {
            if (dt.textContent.trim() === 'Published') {
              const dd = dt.nextElementSibling;
              if (dd && dd.classList.contains('gem-c-metadata__definition')) {
                return dd.textContent.trim();
              }
            }
          }
          return 'Date unavailable';
        });

        article.date = date;
        await articlePage.close();
      } catch (err) {
        console.warn(`Failed to fetch date for: ${article.url}. Details: ${err.message}`);
        article.date = 'Date unavailable';
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
