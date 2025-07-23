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
        headless: true, // Changed from false to true for consistency in serverless environments
        slowMo: 50,
        defaultViewport: null,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      };

  let browser;
  const url = 'https://www.jep.be/fr/decisions-du-jep/?_onderzoekscriteria=environnement';

  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    const articles = await page.evaluate(() => {
      const seen = new Set();
      const items = Array.from(document.querySelectorAll('h3 > a'));
      const results = [];

      for (const link of items) {
        const href = link.href;
        const titleFont = link.querySelector('font');
        const title = titleFont ? titleFont.textContent.trim() : link.textContent.trim();

        if (href && title && !seen.has(href)) {
          seen.add(href);
          results.push({ title, url: href });
        }

        if (results.length >= 10) break;
      }
      console.log(`Found ${results.length} articles on listing page.`);
      return results;
    });

    for (let i = 0; i < articles.length; i++) {
      try {
        const articlePage = await browser.newPage();
        await articlePage.goto(articles[i].url, { waitUntil: 'networkidle2', timeout: 60000 });

        const date = await articlePage.evaluate(() => {
          const dateDivs = Array.from(document.querySelectorAll('div.jet-listing-dynamic-field__content'));
          if (!dateDivs.length) return null;

          const lastDiv = dateDivs[dateDivs.length - 1];
          const fullText = lastDiv.innerText.trim();
          const cleaned = fullText.replace(/Date de clôture\s*:?\s*/i, '').trim();
          const match = cleaned.match(/(\d{1,2}\s+[a-zéûîèêôîàäëïöüç]+\s+\d{4})/i);
          return match ? match[1] : cleaned;
        });

        articles[i].date = date || 'N/A';
        await articlePage.close();

      } catch (err) {
        console.warn(`Failed to fetch date for: ${articles[i].url}. Details: ${err.message}`);
        articles[i].date = 'N/A';
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