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
  const baseUrl = 'https://www.aasb.gov.au/News.aspx';

  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    await Promise.race([
      page.waitForSelector('div.box', { timeout: 10000 }),
      page.waitForSelector('div.news-article', { timeout: 10000 })
    ]);
    console.log('Found at least one type of article container.');

    const articles = await page.evaluate(() => {
      const results = [];
      const seen = new Set(); // For deduplication

      const boxNewsBlocks = document.querySelectorAll('div.box');
      boxNewsBlocks.forEach(block => {
        let title = null;
        let url = null;
        let date = null;

        const titleEl = block.querySelector('h3.nobefore.nomargin');
        if (titleEl) {
          title = titleEl.textContent.trim();
        }

        const urlEl = block.querySelector('a.arrow');
        if (urlEl) {
          url = new URL(urlEl.getAttribute('href'), window.location.origin).href;
        }

        const dayEl = block.querySelector('.calendar .day');
        const monthEl = block.querySelector('.calendar .month');
        const yearEl = block.querySelector('.calendar .year');

        if (dayEl && monthEl && yearEl) {
          const day = dayEl.textContent.trim();
          const month = monthEl.textContent.trim();
          const year = yearEl.textContent.trim();
          date = `${day} ${month} ${year}`;
        }

        if (title && url && date && !seen.has(url)) {
          seen.add(url);
          results.push({ title, url, date });
        }
      });

      const newsArticleBlocks = document.querySelectorAll('div.news-article');
      newsArticleBlocks.forEach(block => {
        let title = null;
        let url = null;
        let date = null;

        const titleEl = block.querySelector('h3');
        if (titleEl) {
          title = titleEl.textContent.trim();
        }

        const urlEl = block.querySelector('.teaser a[href*="/news/"]');
        if (urlEl) {
          url = new URL(urlEl.getAttribute('href'), window.location.origin).href;
        }

        const dateEl = block.querySelector('.teaser .date');
        if (dateEl) {
          date = dateEl.textContent.trim();
        }

        if (title && url && date && !seen.has(url)) { // Use the common 'seen' Set for deduplication
          seen.add(url);
          results.push({ title, url, date });
        }
      });

      console.log(`Found ${results.length} articles on listing page.`);
      return results.slice(0, 10);
    });

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
