const isLambda = !!process.env.AWS_REGION;

async function getBrowserModules() {
  const puppeteer = await import('puppeteer-core');
  const { default: ChromiumClass } = await import('@sparticuz/chromium-min');

  console.log('--- Debugging ChromiumClass object ---');
  console.log('Type of ChromiumClass:', typeof ChromiumClass);
  console.log('Keys of ChromiumClass:', Object.keys(ChromiumClass));
  console.log('Full ChromiumClass object:', ChromiumClass);
  console.log('ChromiumClass.executablePath is a function:', typeof ChromiumClass.executablePath === 'function');
  console.log('ChromiumClass.args:', ChromiumClass.args);
  console.log('ChromiumClass.defaultViewport:', ChromiumClass.defaultViewport);
  console.log('--- End ChromiumClass Debug ---');

  // Correctly call executablePath as a function to get the path string
  // Ensure we await the result as executablePath() is async
  let executablePathValue = null;
  if (typeof ChromiumClass.executablePath === 'function') {
    executablePathValue = await ChromiumClass.executablePath();
  } else {
    // Fallback in case it's not a function (though logs suggest it is), but it should ideally be a function returning the path
    executablePathValue = ChromiumClass.executablePath;
  }

  return {
    puppeteer,
    chromiumArgs: ChromiumClass.args, // Renamed to avoid confusion
    chromiumDefaultViewport: ChromiumClass.defaultViewport, // Renamed
    executablePath: executablePathValue // Use the correctly obtained path
  };
}

export default async function (req, res) {
  // Destructure the correctly named variables from getBrowserModules
  const { puppeteer, chromiumArgs, chromiumDefaultViewport, executablePath } = await getBrowserModules();

  // --- Crucial Debugging and Validation ---
  console.log('--- Puppeteer Launch Debug Info ---');
  console.log('isLambda:', isLambda);
  console.log('chromiumArgs (from @sparticuz/chromium-min):', chromiumArgs);
  console.log('chromiumDefaultViewport (from @sparticuz/chromium-min):', chromiumDefaultViewport);
  console.log('Executable Path (from @sparticuz/chromium-min):', executablePath);
  console.log('--- End Debug Info ---');

  // Explicitly check if executablePath is valid when in a Lambda environment
  if (isLambda && (!executablePath || typeof executablePath !== 'string' || executablePath.trim() === '')) {
    console.error('ERROR: In Lambda environment, executablePath is not valid:', executablePath);
    return res.status(500).json({
      error: 'Puppeteer launch failed: Missing or invalid Chromium executable path for Lambda environment.',
      details: 'Ensure @sparticuz/chromium-min is correctly deployed and can locate the Chromium binary.'
    });
  }

  const launchOptions = isLambda
    ? {
        args: chromiumArgs, // Use the correct variable name
        defaultViewport: chromiumDefaultViewport, // Use the correct variable name
        executablePath: executablePath, // Use the correctly obtained path
        headless: true, // Chromium for serverless is always headless
      }
    : {
        // For local development, Puppeteer will typically find Chrome/Chromium if installed
        headless: true,
        slowMo: 50,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
        // executablePath is not strictly needed here if a system browser is found,
        // but can be added for explicit local path if desired.
      };

  let browser; // Declare browser outside try-block for finally access

  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    const url = 'https://apnews.com/climate-and-environment';

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('div.PagePromo-content', { timeout: 15000 });

    // Extract up to 10 articles from the listing
    const articles = await page.evaluate(() => {
      const articleDivs = Array.from(document.querySelectorAll('div.PagePromo-content'));
      const raw = articleDivs.map(div => {
        const linkEl = div.querySelector('a.Link');
        const titleEl = div.querySelector('span.PagePromoContentIcons-text');

        const url = linkEl?.href || null;
        const title = titleEl?.textContent.trim() || null;

        return { title, url };
      }).filter(article => article.title && article.url);

      // Deduplicate by URL
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

    // Optional: deduplicate again by title (to be extra safe)
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
    if (browser) { // Ensure browser exists before trying to close it
      await browser.close();
    }
  }
}
