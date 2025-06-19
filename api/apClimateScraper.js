// On Vercel, process.env.AWS_REGION is typically set as well,
// so this variable will correctly be true for Vercel deployments.
const isVercelEnvironment = !!process.env.AWS_REGION; // Or check for process.env.VERCEL

async function getBrowserModules() {
  const puppeteer = await import('puppeteer-core');
  // *** CHANGE: Import from @sparticuz/chromium (without -min) ***
  const { default: ChromiumClass } = await import('@sparticuz/chromium');

  console.log('--- Debugging ChromiumClass object (Vercel) ---');
  console.log('Type of ChromiumClass:', typeof ChromiumClass);
  console.log('Keys of ChromiumClass:', Object.keys(ChromiumClass));
  console.log('Full ChromiumClass object:', ChromiumClass);
  // @sparticuz/chromium's executablePath is typically a function
  console.log('ChromiumClass.executablePath is a function:', typeof ChromiumClass.executablePath === 'function');
  console.log('ChromiumClass.args:', ChromiumClass.args);
  console.log('ChromiumClass.defaultViewport:', ChromiumClass.defaultViewport);
  console.log('--- End ChromiumClass Debug (Vercel) ---');

  let executablePathValue = null;
  if (typeof ChromiumClass.executablePath === 'function') {
    // This is typically how @sparticuz/chromium provides the path
    executablePathValue = await ChromiumClass.executablePath();
  } else {
    // Fallback, though less likely for this library
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

  // --- Crucial Debugging and Validation for Vercel ---
  console.log('--- Puppeteer Launch Debug Info (Vercel) ---');
  console.log('isVercelEnvironment:', isVercelEnvironment);
  console.log('chromiumArgs (from @sparticuz/chromium):', chromiumArgs);
  console.log('chromiumDefaultViewport (from @sparticuz/chromium):', chromiumDefaultViewport);
  console.log('Executable Path (from @sparticuz/chromium):', executablePath);
  console.log('--- End Debug Info (Vercel) ---');

  // Explicitly check if executablePath is valid for Vercel
  if (isVercelEnvironment && (!executablePath || typeof executablePath !== 'string' || executablePath.trim() === '')) {
    console.error('ERROR: In Vercel environment, executablePath is not valid:', executablePath);
    return res.status(500).json({
      error: 'Puppeteer launch failed: Missing or invalid Chromium executable path for Vercel environment.',
      details: 'Ensure @sparticuz/chromium is correctly integrated and can locate the Chromium binary.'
    });
  }

  const launchOptions = isVercelEnvironment
    ? {
        args: chromiumArgs,
        defaultViewport: chromiumDefaultViewport,
        executablePath: executablePath,
        headless: true, // Chromium for serverless is always headless
      }
    : {
        // For local development, Puppeteer will typically find Chrome/Chromium if installed
        headless: true,
        slowMo: 50,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      };

  let browser;

  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    const url = 'https://apnews.com/climate-and-environment';

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('div.PagePromo-content', { timeout: 15000 });

    const articles = await page.evaluate(() => {
      const articleDivs = Array.from(document.querySelectorAll('div.PagePromo-content'));
      const raw = articleDivs.map(div => {
        const linkEl = div.querySelector('a.Link');
        const titleEl = div.querySelector('span.PagePromoContentIcons-text');

        const url = linkEl?.href || null;
        const title = titleEl?.textContent.trim() || null;

        return { title, url };
      }).filter(article => article.title && article.url);

      const seen = new Set();
      return raw.filter(article => {
        if (seen.has(article.url)) return false;
        seen.add(article.url);
        return true;
      });
    });

    if (articles.length === 0) {
      return res.status(200).json({ message: 'No articles found' });
    }

    const detailedArticles = [];

    for (let i = 0; i < Math.min(articles.length, 10); i++) {
      const { title, url } = articles[i];
      try {
        const articlePage = await browser.newPage();
        await articlePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const date = await articlePage.evaluate(() => {
          const dateEl1 = document.querySelector('div.Page-dateModified');
          const dateEl2 = document.querySelector('[span-data-date]');
          return (dateEl1?.textContent || dateEl2?.textContent || '').trim();
        });

        detailedArticles.push({ title, url, date });
        await articlePage.close();
      } catch (err) {
        console.warn(`Failed to retrieve date for article ${i + 1}: ${err.message}`);
        detailedArticles.push({ title, url, date: '' });
      }
    }

    const seenTitles = new Set();
    const deduplicated = detailedArticles.filter(article => {
      if (seenTitles.has(article.title)) return false;
      seenTitles.add(article.title);
      return true;
    });

    res.status(200).json(deduplicated);

  } catch (err) {
    console.error('Error during scraping or Puppeteer launch:', err);
    res.status(500).json({ error: 'Scraping failed', details: err.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
