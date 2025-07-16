const isVercelEnvironment = !!process.env.AWS_REGION;

async function getBrowserModules() {
  if (isVercelEnvironment) {
    const puppeteer = await import('puppeteer-core');
    const { default: ChromiumClass } = await import('@sparticuz/chromium');

    console.log('--- Debugging ChromiumClass object (Vercel Environment) ---');
    console.log('Type of ChromiumClass:', typeof ChromiumClass);
    console.log('ChromiumClass.executablePath is a function:', typeof ChromiumClass.executablePath === 'function');
    console.log('ChromiumClass.args:', ChromiumClass.args);
    console.log('ChromiumClass.defaultViewport:', ChromiumClass.defaultViewport);
    console.log('--- End ChromiumClass Debug (Vercel Environment) ---');

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
  } else {
    const puppeteer = await import('puppeteer');
    return {
      puppeteer,
      chromiumArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
      chromiumDefaultViewport: null,
      executablePath: undefined 
    };
  }
}

/**
 *
 * @param {object} req - The incoming request object.
 * @param {object} res - The outgoing response object.
 */
export default async function handler(req, res) {
  let browser; 
  const url = 'https://secsearch.sec.or.th/?search=sustainability';

  try {
    const { puppeteer, chromiumArgs, chromiumDefaultViewport, executablePath } = await getBrowserModules();

    console.log('--- Puppeteer Launch Debug Info ---');
    console.log('Is Vercel Environment:', isVercelEnvironment);
    console.log('Chromium Args:', chromiumArgs);
    console.log('Chromium Default Viewport:', chromiumDefaultViewport);
    console.log('Executable Path:', executablePath);
    console.log('--- End Debug Info ---');

    if (isVercelEnvironment && (!executablePath || typeof executablePath !== 'string' || executablePath.trim() === '')) {
      console.error('ERROR: In Vercel environment, executablePath is not valid:', executablePath);
      return res.status(500).json({
        success: false,
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
          headless: false,             
          defaultViewport: null,       
          args: ['--no-sandbox', '--disable-setuid-sandbox'], 
        };

    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

    console.log('Waiting for articles selector (div.result.col-12.col-sm-9.col-md-9 label.rank)...');
    try {
      await page.waitForSelector('div.result.col-12.col-sm-9.col-md-9 label.rank', { timeout: 45000 });
      console.log('Selector found. Proceeding to scrape.');
    } catch (selectorError) {
      console.error(`ERROR: Selector not found or timed out: ${selectorError.message}`);
      if (!isVercelEnvironment && browser && page) {
         try {
             await page.screenshot({ path: 'screenshot_selector_timeout.png' });
             console.log('Screenshot saved to screenshot_selector_timeout.png');
         } catch (screenshotErr) {
             console.error('Failed to take screenshot:', screenshotErr.message);
         }
      }
      return res.status(500).json({
        success: false,
        error: 'Scraping failed: Initial selector not found or timed out.',
        details: selectorError.message
      });
    }


    console.log('Scraping articles...');
    const articles = await page.evaluate(() => {
      console.log('Executing page.evaluate...');
      const items = Array.from(document.querySelectorAll('div.result.col-12.col-sm-9.col-md-9 label.rank'));
      console.log(`Found ${items.length} potential article containers.`); // Log inside evaluate for client-side context
      const results = [];
      const seenUrls = new Set();

      items.forEach(item => {
        const anchor = item.querySelector('a');
        const url = anchor?.getAttribute('href') || null;
        const title = anchor?.textContent?.trim().replace(/\s+/g, ' ') || null;

        if (title && url && !seenUrls.has(url)) {
          seenUrls.add(url);
          results.push({ title, url });
        }
      });
      console.log(`Finished processing items. Collected ${results.length} valid articles.`); // Log inside evaluate for client-side context
      return results;
    });

    if (articles.length === 0) {
      console.log('No articles found after evaluation.');
      return res.status(200).json({
        success: true,
        message: 'No articles found with the specified selectors.',
        data: []
      });
    } else {
      console.log(`Successfully scraped ${articles.length} articles.`);
      return res.status(200).json({
        success: true,
        data: articles
      });
    }

  } catch (err) {
    console.error('Error during scraping (catch block):', err);
    return res.status(500).json({
      success: false,
      error: 'Scraping failed',
      details: err.message || 'An unknown error occurred during scraping.'
    });
  } finally {
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
    }
  }
}
