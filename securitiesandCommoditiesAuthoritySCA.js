// pages/api/scrape-sca.js

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
 * Next.js API route handler for scraping SCA search results.
 * This function will be executed as a serverless function on Vercel.
 *
 * @param {object} req - The incoming request object.
 * @param {object} res - The outgoing response object.
 */
export default async function handler(req, res) {
  let browser; // Declare browser variable to ensure it's accessible in finally block
  const url = 'https://www.sca.gov.ae/en/search.aspx?type=all&query=sustainability';

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
          headless: true,               // Serverless functions run headless
        }
      : {
          headless: true,               // Run headless locally for consistency
          defaultViewport: null,        // Let Puppeteer choose default
          // slowMo: 50,                // Removed slowMo for production/serverless environment
          args: ['--no-sandbox', '--disable-setuid-sandbox'], // Recommended for local/Docker
        };

    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));

    // Launch the browser instance
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    console.log(`Navigating to ${url}...`);
    // Navigate to the target URL, waiting for the DOM to be loaded
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });

    console.log('Waiting for articles selector (div.col-md-4.col-sm-6.col-xs-12)...');
    // Wait for the specific selector that indicates articles are loaded
    await page.waitForSelector('div.col-md-4.col-sm-6.col-xs-12', { timeout: 20000 });

    console.log('Scraping articles...');
    // Extract article data using page.evaluate
    const articles = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div.col-md-4.col-sm-6.col-xs-12'));
      const results = [];
      const seenUrls = new Set(); // To avoid potential duplicates

      cards.forEach(card => {
        const link = card.querySelector('a');
        const timeEl = card.querySelector('div.info time.date');

        const url = link?.href || null;
        const title = link?.getAttribute('title')?.trim() || null;
        const date = timeEl?.textContent.trim() || null;

        // Only add articles with valid title and URL, and if not a duplicate
        if (title && url && !seenUrls.has(url)) {
          seenUrls.add(url);
          results.push({ title, url, date });
        }
      });
      console.log(`Found ${results.length} articles on the page.`); // Log inside evaluate for client-side context
      return results;
    });

    if (articles.length === 0) {
      console.log('No articles found.');
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
    console.error('Error during scraping:', err);
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
