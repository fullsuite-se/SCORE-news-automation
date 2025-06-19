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
  const url = 'https://mg.co.za/section/the-green-guardian/';

  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 0 });
    await page.waitForSelector('div.main-archive-meta, div.col-12, div.col-8.padded', { timeout: 10000 });

    const articles = await page.evaluate(() => {
      const selectors = [
        'div.main-archive-meta',
        'div.col-12',
        'div.col-8.padded'
      ];

      const articleNodes = [];
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(node => articleNodes.push(node));
      });

      const seen = new Set();
      const results = [];

      articleNodes.forEach(node => {
        const linkTag = node.querySelector('h1 a, h3 a');
        const title = linkTag?.textContent?.trim() || null;
        let url = linkTag?.getAttribute('href')?.trim() || null;

        if (url && !url.startsWith('http')) {
          url = 'https://mg.co.za' + url;
        }

        const uniqueKey = `${title}||${url}`;
        if (title && url && !seen.has(uniqueKey)) {
          seen.add(uniqueKey);
          results.push({ title, url });
        }
      });

      console.log(`Found ${results.length} articles on listing page.`);
      return results.slice(0, 10);
    });

    const detailedArticles = [];
    for (const article of articles) {
      try {
        const articlePage = await browser.newPage();
        await articlePage.goto(article.url, { waitUntil: 'domcontentloaded', timeout: 0 });

        await articlePage.waitForSelector('div.meta-box-date', { timeout: 5000 });
        const date = await articlePage.$eval('div.meta-box-date', el => el.textContent.trim());
        
        detailedArticles.push({ ...article, date });

        await articlePage.close();
      } catch (err) {
        console.warn(`Skipping article "${article.title}" due to missing date or blocked page. Details: ${err.message}`);
      }
    }

    const filtered = detailedArticles.filter(a => a.date);

    if (filtered.length === 0) {
      console.log('No valid articles with dates found.');
      return res.status(200).json({ message: 'No articles found or no dates could be retrieved.' });
    }

    console.log(`Returning ${filtered.length} articles with dates.`);
    res.status(200).json(filtered);

  } catch (err) {
    console.error('Error during scraping:', err.message);
    res.status(500).json({ error: 'Scraping failed', details: err.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
