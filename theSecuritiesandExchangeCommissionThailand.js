// pages/api/scrape-sec-thailand.js

// Detect if the function is running in the Vercel (AWS Lambda) environment.
const isVercelEnvironment = !!process.env.AWS_REGION;

/**
 * Dynamically imports the necessary browser modules based on the execution environment.
 * Uses 'puppeteer-core' and '@sparticuz/chromium' when deployed on Vercel,
 * and standard 'puppeteer' for local development convenience.
 */
async function getBrowserModules() {
  if (isVercelEnvironment) {
    // For Vercel deployment, load lightweight puppeteer-core and Chromium binary
    const puppeteer = await import('puppeteer-core');
    const { default: ChromiumClass } = await import('@sparticuz/chromium');

    console.log('--- Debugging ChromiumClass object (Vercel Environment) ---');
    console.log('Type of ChromiumClass:', typeof ChromiumClass);
    console.log('ChromiumClass.executablePath is a function:', typeof ChromiumClass.executablePath === 'function');
    console.log('ChromiumClass.args:', ChromiumClass.args);
    console.log('ChromiumClass.defaultViewport:', ChromiumClass.defaultViewport);
    console.log('--- End ChromiumClass Debug (Vercel Environment) ---');

    let executablePathValue = null;
    // @sparticuz/chromium's executablePath can be a function or a direct string
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
    // For local development, use the full 'puppeteer' package which includes Chromium
    const puppeteer = await import('puppeteer');
    return {
      puppeteer,
      // Standard recommended arguments for running Puppeteer locally, especially in containers
      chromiumArgs: ['--no-sandbox', '--disable-setuid-sandbox'],
      chromiumDefaultViewport: null, // Let Puppeteer determine default viewport
      executablePath: undefined // Puppeteer will use its own bundled Chromium
    };
  }
}

/**
 * Next.js API route handler for scraping SEC Thailand search results.
 * This function will be executed as a serverless function on Vercel.
 *
 * @param {object} req - The incoming request object.
 * @param {object} res - The outgoing response object.
 */
export default async function handler(req, res) {
  let browser; // Declare browser variable to ensure it's accessible in finally block
  const url = 'https://secsearch.sec.or.th/?search=sustainability';

  try {
    // Get the appropriate Puppeteer setup based on the environment
    const { puppeteer, chromiumArgs, chromiumDefaultViewport, executablePath } = await getBrowserModules();

    console.log('--- Puppeteer Launch Debug Info ---');
    console.log('Is Vercel Environment:', isVercelEnvironment);
    console.log('Chromium Args:', chromiumArgs);
    console.log('Chromium Default Viewport:', chromiumDefaultViewport);
    console.log('Executable Path:', executablePath);
    console.log('--- End Debug Info ---');

    // Crucial check for Vercel deployment: ensure a valid Chromium executable path is found
    if (isVercelEnvironment && (!executablePath || typeof executablePath !== 'string' || executablePath.trim() === '')) {
      console.error('ERROR: In Vercel environment, executablePath is not valid:', executablePath);
      return res.status(500).json({
        success: false,
        error: 'Puppeteer launch failed: Missing or invalid Chromium executable path for Vercel environment.'
      });
    }

    // Define Puppeteer launch options
    const launchOptions = isVercelEnvironment
      ? {
          args: chromiumArgs,           // Arguments from @sparticuz/chromium
          defaultViewport: chromiumDefaultViewport, // Viewport from @sparticuz/chromium
          executablePath: executablePath, // Path to the Vercel-compatible Chromium binary
          headless: true,               // Always run headless on serverless
        }
      : {
          headless: false,              // For local debugging, set to false to see the browser
          defaultViewport: null,        // Let Puppeteer choose default
          args: ['--no-sandbox', '--disable-setuid-sandbox'], // Recommended for local/Docker
        };

    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));

    // Launch the browser instance
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    console.log(`Navigating to ${url}...`);
    // Navigate to the target URL, waiting for the DOM to be loaded
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

    console.log('Waiting for articles selector (div.result.col-12.col-sm-9.col-md-9 label.rank)...');
    try {
      // Wait for the specific selector that indicates articles are loaded
      await page.waitForSelector('div.result.col-12.col-sm-9.col-md-9 label.rank', { timeout: 45000 });
      console.log('Selector found. Proceeding to scrape.');
    } catch (selectorError) {
      console.error(`ERROR: Selector not found or timed out: ${selectorError.message}`);
      // Capture a screenshot on timeout for debugging (only works locally with headless:false or specific setup)
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
    // Extract article data using page.evaluate
    const articles = await page.evaluate(() => {
      // Log inside evaluate to see what the browser's console sees
      console.log('Executing page.evaluate...');
      const items = Array.from(document.querySelectorAll('div.result.col-12.col-sm-9.col-md-9 label.rank'));
      console.log(`Found ${items.length} potential article containers.`); // Log inside evaluate for client-side context
      const results = [];
      const seenUrls = new Set(); // To avoid potential duplicates

      items.forEach(item => {
        const anchor = item.querySelector('a');
        const url = anchor?.getAttribute('href') || null;
        // Replace multiple spaces with a single space for cleaner title
        const title = anchor?.textContent?.trim().replace(/\s+/g, ' ') || null;

        // Log individual item extraction for debugging
        // console.log('Processing item:', { title, url });

        // Only add articles with valid title and URL, and if not a duplicate
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
      // Respond with a success status but indicate no data
      return res.status(200).json({
        success: true,
        message: 'No articles found with the specified selectors.',
        data: []
      });
    } else {
      console.log(`Successfully scraped ${articles.length} articles.`);
      // Return the scraped data as a JSON response
      return res.status(200).json({
        success: true,
        data: articles
      });
    }

  } catch (err) {
    console.error('Error during scraping (catch block):', err);
    // Respond with a 500 Internal Server Error for any exceptions
    return res.status(500).json({
      success: false,
      error: 'Scraping failed',
      details: err.message || 'An unknown error occurred during scraping.'
    });
  } finally {
    // Ensure the browser instance is closed, regardless of success or failure
    if (browser) {
      console.log('Closing browser...');
      await browser.close();
    }
  }
}
