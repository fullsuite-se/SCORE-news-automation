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
  const mainUrl = 'https://earthjustice.org/news';
  const moreReleasesUrl = 'https://earthjustice.org/library?_type=press&_library_sort=sort_by_newest';

  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    const articles = [];
    const seen = new Set();

    console.log(`Navigating to main news page: ${mainUrl}`);
    await page.goto(mainUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('.teaser__list--text', { timeout: 10000 });

    const mainArticles = await page.evaluate(() => {
      const results = [];
      const nodes = document.querySelectorAll('.teaser__list--text');

      nodes.forEach(node => {
        const titleEl = node.querySelector('h3.h3_type--editorial.m-t-5 a');
        const dateEl = node.querySelector('.teaser__list--meta span.teaser__list--date');

        if (titleEl && dateEl) {
          const title = titleEl.getAttribute('title')?.trim();
          const url = titleEl.href;
          const date = dateEl.textContent.trim();

          if (title && url && date) {
            results.push({ title, date, url });
          }
        }
      });
      console.log(`Found ${results.length} articles on main news page.`);
      return results;
    });

    for (const article of mainArticles) {
      if (!seen.has(article.url)) {
        seen.add(article.url);
        articles.push(article);
      }
      if (articles.length >= 10) break;
    }

    if (articles.length < 10) {
      console.log(`Fewer than 10 articles found (${articles.length}). Navigating to more releases page: ${moreReleasesUrl}`);
      await page.goto(moreReleasesUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('.teaser__grid', { timeout: 10000 });

      const moreArticles = await page.evaluate(() => {
        const results = [];
        const nodes = document.querySelectorAll('.teaser__grid');

        nodes.forEach(node => {
          const titleEl = node.querySelector('h3.h3_type--editorial.m-t-10 a');
          const dateEl = node.querySelector('.teaser__list--meta.m-t-5 span.teaser__list--date');

          if (titleEl && dateEl) {
            const title = titleEl.getAttribute('title')?.trim();
            const url = titleEl.href;
            const date = dateEl.textContent.trim();

            if (title && url && date) {
              results.push({ title, date, url });
            }
          }
        });
        console.log(`Found ${results.length} articles on more releases page.`);
        return results;
      });

      for (const article of moreArticles) {
        if (!seen.has(article.url)) {
          seen.add(article.url);
          articles.push(article);
        }
        if (articles.length >= 10) break;
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
