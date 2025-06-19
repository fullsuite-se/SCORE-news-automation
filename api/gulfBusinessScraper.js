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
  const url = 'https://gulfbusiness.com/section/climate/';

  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });

    await page.waitForSelector('div.post-title', { timeout: 10000 });

    const links = await page.evaluate(() => {
      const articles = document.querySelectorAll('div.post-title h4 a');
      const seen = new Set();
      const results = [];

      articles.forEach(a => {
        const rawUrl = a.getAttribute('href')?.trim();
        const url = rawUrl?.startsWith('http') ? rawUrl : `https://gulfbusiness.com${rawUrl}`;
        const title = a.querySelector('span')?.textContent?.trim();

        const uniqueKey = `${title}||${url}`;
        if (title && url && !seen.has(uniqueKey)) {
          seen.add(uniqueKey);
          results.push({ title, url });
        }
      });
      return results.slice(0, 15);
    });

    const results = [];

    for (const article of links) {
      const articlePage = await browser.newPage();
      try {
        await articlePage.goto(article.url, { waitUntil: 'domcontentloaded', timeout: 0 });

        await articlePage.waitForSelector('div.author-and-date div.thb-post-date', { timeout: 7000 });
        const date = await articlePage.$eval('div.author-and-date div.thb-post-date', el =>
          el.textContent.trim()
        );

        if (date) {
          results.push({ title: article.title, url: article.url, date });
        } else {
            console.log(`Date element not found for article: ${article.url}`);
        }
      } catch (err) {
        console.log(`Skipping article due to error or access restriction: ${article.url}, Details: ${err.message}`);
      } finally {
        await articlePage.close();
      }

      if (results.length === 10) break;
    }

    if (results.length === 0) {
      console.log('No valid articles with dates found.');
      return res.status(200).json({ message: 'No articles found' });
    }

    res.status(200).json(results);

  } catch (err) {
    console.error('Error during scraping:', err.message);
    res.status(500).json({ error: 'Scraping failed', details: err.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
