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

export default async function handler(req, res) {
  let browser;
  const initialUrl = 'https://apnews.com/climate-and-environment';

  try {
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
        error: 'Puppeteer launch failed: Missing or invalid Chromium executable path for Vercel environment.',
        details: 'Ensure @sparticuz/chromium is correctly integrated and can locate the Chromium binary.'
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
          headless: false, 
          slowMo: 50, 
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
        };

    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage(); 

    console.log(`Navigating to initial URL: ${initialUrl}...`);
    await page.goto(initialUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    console.log('Waiting for initial articles selector (div.PagePromo-content)...');
    try {
      await page.waitForSelector('div.PagePromo-content', { timeout: 15000 });
      console.log('Initial articles selector found. Proceeding to scrape listing page.');
    } catch (selectorError) {
      console.error(`ERROR: Initial selector not found or timed out: ${selectorError.message}`);
      if (!isVercelEnvironment && browser && page) {
         try {
             await page.screenshot({ path: 'screenshot_initial_selector_timeout.png' });
             console.log('Screenshot saved to screenshot_initial_selector_timeout.png');
         } catch (screenshotErr) {
             console.error('Failed to take screenshot:', screenshotErr.message);
         }
      }
      return res.status(500).json({
        error: 'Scraping failed: Initial article listing selector not found or timed out.',
        details: selectorError.message
      });
    }

    const articles = await page.evaluate(() => {
      console.log('Executing page.evaluate for initial articles...');
      const articleDivs = Array.from(document.querySelectorAll('div.PagePromo-content'));
      console.log(`Found ${articleDivs.length} potential article containers on listing page.`);
      const raw = articleDivs.map(div => {
        const linkEl = div.querySelector('a.Link');
        const titleEl = div.querySelector('span.PagePromoContentIcons-text');

        const url = linkEl?.href || null;
        const title = titleEl?.textContent.trim() || null;

        return { title, url };
      }).filter(article => article.title && article.url);

      const seen = new Set();
      const deduplicatedRaw = raw.filter(article => {
        if (seen.has(article.url)) return false;
        seen.add(article.url);
        return true;
      });
      console.log(`Finished initial processing. Collected ${deduplicatedRaw.length} unique articles from listing.`);
      return deduplicatedRaw;
    });

    if (articles.length === 0) {
      console.log('No articles found on listing page after evaluation.');
      return res.status(200).json([]); // Return empty array directly
    }

    console.log(`Found ${articles.length} articles from listing. Proceeding to scrape details for up to 10 articles.`);
    const detailedArticles = [];

    for (let i = 0; i < Math.min(articles.length, 10); i++) {
      const { title, url } = articles[i];
      if (!url) {
          console.warn(`Skipping article ${i + 1} due to missing URL: ${title}`);
          continue;
      }
      try {
        console.log(`Navigating to detailed article page: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const date = await page.evaluate(() => {
          console.log('Executing page.evaluate for date extraction...');
          const dateEl1 = document.querySelector('div.Page-dateModified');
          const dateEl2 = document.querySelector('[span-data-date]');
          const extractedDate = (dateEl1?.textContent || dateEl2?.textContent || '').trim();
          console.log('Extracted date:', extractedDate);
          return extractedDate;
        });

        detailedArticles.push({ title, url, date });
        console.log(`Successfully scraped details for: ${title}`);
      } catch (err) {
        console.warn(`Failed to retrieve date for article ${i + 1} (${url}): ${err.message}`);
        detailedArticles.push({ title, url, date: '' });
      }
    }

    const seenTitles = new Set();
    const finalDeduplicatedArticles = detailedArticles.filter(article => {
      if (seenTitles.has(article.title)) return false;
      seenTitles.add(article.title);
      return true;
    });

    console.log(`Returning ${finalDeduplicatedArticles.length} final unique articles.`);
    res.status(200).json(finalDeduplicatedArticles); // Return the final array directly

  } catch (err) {
    console.error('Error during scraping or Puppeteer launch (main catch block):', err);
    res.status(500).json({ error: 'Scraping failed', details: err.message || 'An unknown error occurred.' });
  } finally {
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
    }
  }
}
