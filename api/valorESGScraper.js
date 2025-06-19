const isVercelEnvironment = !!process.env.AWS_REGION; 

/**
 * Dynamically imports puppeteer-core and @sparticuz/chromium.
 * This function ensures the correct executable path is used for a headless
 * Chromium browser in serverless environments.
 * @returns {Promise<{puppeteer: object, chromiumArgs: string[], chromiumDefaultViewport: object, executablePath: string|null}>}
 */
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

/**
 * Vercel Serverless Function for scraping Valor ESG articles.
 * This function fetches article titles, URLs, and publication dates
 * from valor.globo.com/esg.
 * @param {object} req - The Vercel request object.
 * @param {object} res - The Vercel response object.
 */
export default async function (req, res) {
  // Retrieve Puppeteer and Chromium configuration from the helper function.
  const { puppeteer, chromiumArgs, chromiumDefaultViewport, executablePath } = await getBrowserModules();

  // --- Crucial Debugging and Validation for Vercel ---
  console.log('--- Puppeteer Launch Debug Info (Vercel) ---');
  console.log('isVercelEnvironment:', isVercelEnvironment);
  console.log('chromiumArgs (from @sparticuz/chromium):', chromiumArgs);
  console.log('chromiumDefaultViewport (from @sparticuz/chromium):', chromiumDefaultViewport);
  console.log('Executable Path (from @sparticuz/chromium):', executablePath);
  console.log('--- End Debug Info (Vercel) ---');

  // Validate that a valid executablePath is available when in a serverless environment.
  if (isVercelEnvironment && (!executablePath || typeof executablePath !== 'string' || executablePath.trim() === '')) {
    console.error('ERROR: In Vercel environment, executablePath is not valid:', executablePath);
    return res.status(500).json({
      error: 'Puppeteer launch failed: Missing or invalid Chromium executable path for Vercel environment.',
      details: 'Ensure @sparticuz/chromium is correctly integrated and can locate the Chromium binary.'
    });
  }

  // Configure Puppeteer launch options based on the environment.
  const launchOptions = isVercelEnvironment
    ? {
        args: chromiumArgs, 
        defaultViewport: chromiumDefaultViewport, 
        executablePath: executablePath, 
        headless: true, 
      }
    : {
       
        headless: true, 
        slowMo: 50, 
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'], 
      };

  let browser; 
  const url = 'https://valor.globo.com/esg/'; // Target URL for scraping.

  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions); // Launch the browser instance.
    const page = await browser.newPage();

    console.log('Navigating to Valor ESG page...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for content to load, ensuring the main content block is present.
    await page.waitForSelector('div.highlight__content', { timeout: 15000 });

    console.log('Extracting article links and titles...');
    const articles = await page.evaluate(() => {
      // Define all relevant selectors for different article blocks.
      const selectors = [
        'div.highlight__content[data-track-action="post destaque uber"]',
        'div.highlight__content[data-track-action="post destaque"]',
        'div.highlight__content[data-track-action="post franja"]',
        'div.highlight__content[data-track-action="post tematico"]',
      ];

      const seenUrls = new Set(); // Use a Set to track seen URLs for deduplication.
      const results = []; // Array to store the scraped articles.

      // Iterate through each selector to find relevant article blocks.
      selectors.forEach(selector => {
        const blocks = document.querySelectorAll(selector);
        blocks.forEach(block => {
          // Find the anchor tag with an href that is not for subscribers.
          const anchor = block.querySelector('a[href]:not(.is-subscriber-only)');
          const titleEl = block.querySelector('h2.highlight__title'); // Find the title element.

          if (anchor && titleEl) { // Ensure both link and title exist.
            const url = anchor.href;
            const title = titleEl.textContent.trim();

            if (!seenUrls.has(url)) { // If the URL hasn't been seen before.
              seenUrls.add(url); // Add URL to the seen set.
              results.push({ title, url }); // Add the article to results.
            }
          }
        });
      });

      return results; // Return the deduplicated list of articles.
    });

    if (articles.length === 0) {
      console.log('No articles found for Valor ESG!');
      return res.status(200).json({ message: 'No articles found' });
    }

    console.log(`Found ${articles.length} articles. Fetching publication dates...`);

    // Limit to first 10 articles to reduce execution time and resource usage.
    const limitedArticles = articles.slice(0, 10);
    const detailedArticles = []; // Array to store articles with fetched dates.

    // Loop through the limited articles to get detailed information (publication date).
    for (const article of limitedArticles) {
      try {
        const articlePage = await browser.newPage(); // Open a new page for each article.
        // Navigate to the individual article URL.
        await articlePage.goto(article.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Extract the publication date from the article page.
        const date = await articlePage.evaluate(() => {
          const timeEl = document.querySelector('time[itemprop="datePublished"]'); // Primary date selector.
          const fallback = document.querySelector('p.content-publication-data__updated'); // Fallback date selector.
          // Return the 'datetime' attribute or trimmed text content, or 'Date not found'.
          return timeEl?.getAttribute('datetime') || fallback?.textContent.trim() || 'Date not found';
        });

        detailedArticles.push({ ...article, date }); // Add the date to the article object.
        await articlePage.close(); // Close the article page to save resources.
      } catch (e) {
        // Log a warning if a date cannot be retrieved for a specific article.
        console.warn(`Failed to fetch date for ${article.url}: ${e.message}`);
        detailedArticles.push({ ...article, date: 'Date not found' }); // Add with placeholder.
      }
    }

    // Send the scraped and detailed articles as a JSON response.
    res.status(200).json(detailedArticles);

  } catch (err) {
    // Catch any errors during the scraping process or Puppeteer launch.
    console.error('Error during scraping or Puppeteer launch:', err);
    // Send a 500 Internal Server Error response.
    res.status(500).json({ error: 'Scraping failed', details: err.message });
  } finally {
    // Ensure the browser is closed even if an error occurs.
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
}
