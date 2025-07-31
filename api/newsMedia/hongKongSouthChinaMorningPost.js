const isVercelEnvironment = !!process.env.AWS_REGION; // Or check for process.env.VERCEL

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
 * Scrolls the page down to load more content until a timeout is reached
 * or the scroll height stops changing.
 * @param {object} page - The Puppeteer page object.
 * @param {number} timeout - Maximum time in milliseconds to scroll.
 */
async function autoScroll(page, timeout = 30000) {
  const start = Date.now();
  let lastHeight = await page.evaluate('document.body.scrollHeight');
  let sameHeightCounter = 0; // Counts how many times height remained same

  while (Date.now() - start < timeout && sameHeightCounter < 3) {
    // Scroll down by one viewport height
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    // Wait for content to potentially load after scroll
    await new Promise(resolve => setTimeout(resolve, 1000));

    const newHeight = await page.evaluate('document.body.scrollHeight');

    if (newHeight === lastHeight) {
      sameHeightCounter++; // Height didn't change, increment counter
    } else {
      sameHeightCounter = 0; // Height changed, reset counter
      lastHeight = newHeight; // Update lastHeight
    }
  }
  console.log(`Auto-scrolling finished after ${Date.now() - start}ms.`);
}


/**
 * Vercel Serverless Function for scraping articles from South China Morning Post ESG topic.
 * This function fetches article titles, URLs, and publication dates.
 * It's designed to be invoked via an HTTP request.
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
  const url = 'https://www.scmp.com/topics/environmental-social-and-corporate-governance-esg'; 

  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions); 
    const page = await browser.newPage();

    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); 
    
    console.log('Initiating auto-scroll to load more content...');
    await autoScroll(page); // Use autoScroll to load dynamic content.

    console.log('Extracting articles from the page...');
    const articles = await page.evaluate(() => {
      /**
       * Helper function to extract articles from a given CSS selector.
       * @param {string} selector - The CSS selector for article containers.
       * @param {Set<string>} seen - A Set to track seen articles for deduplication.
       * @returns {Array<{title: string, url: string, date: string}>} - Array of extracted articles.
       */
      function extractArticlesFrom(selector, seen) {
        const containers = document.querySelectorAll(selector);
        const results = [];

        containers.forEach(container => {
          try {
            // Selectors specific to SCMP articles.
            const link = container.querySelector(
              'a[target="_self"].efy545l11.css-652fy1.ecgc78b0[data-qa="BaseLink-renderAnchor-StyledAnchor"]'
            );
            const headline = container.querySelector('span[data-qa="ContentHeadline-Headline"]');
            const timeEl = container.querySelector('time[data-qa="ContentActionBar-handleRenderDisplayDateTime-time"]');

            if (link && headline) { // Ensure required elements exist.
              const title = headline.textContent.trim();
              const url = link.href;
              // Extract date from datetime attribute or text content, default to 'Unknown'.
              const date = timeEl?.getAttribute('datetime') || timeEl?.textContent.trim() || 'Unknown';

              // Deduplication based on combined title and URL.
              const key = `${title}||${url}`;
              if (!seen.has(key)) {
                seen.add(key); // Add new article key to seen set.
                results.push({ title, url, date }); // Add article to results.
              }
            }
          } catch (e) {
            // console.error(`Error processing container: ${e.message}`); // Log internal errors during extraction
          }
        });

        return results;
      }

      // Define all relevant selectors for different article blocks on SCMP.
      const selectors = [
        'div.e102obc92.e1daqvjd0.css-1oukeou.e2fukww19',
        'div.e10l40di1.e1daqvjd0.css-grxlrd.efy545l13',
        'div.eimrqvo5.e1daqvjd0.css-yg8c0h.efy545l13',
        'div.e10l40di2.e1daqvjd0.css-g1onk.eqs07hl11',
      ];

      const seen = new Set(); // Master set for deduplication across all selectors.
      let allArticles = []; // Array to collect all articles.

      // Iterate through each selector and concatenate results.
      selectors.forEach(sel => {
        allArticles = allArticles.concat(extractArticlesFrom(sel, seen));
      });

      return allArticles; // Return the full list of deduplicated articles.
    });

    if (articles.length === 0) {
      console.warn('No articles found for SCMP ESG!');
      return res.status(200).json({ message: 'No articles found' });
    }

    // Limit to first 10 articles as per original script.
    const limitedArticles = articles.slice(0, 10);

    console.log(`Found and processed ${limitedArticles.length} articles.`);
    // Send the scraped and limited articles as a JSON response.
    res.status(200).json(limitedArticles);

  } catch (err) {
    // Catch any errors during the scraping process or Puppeteer launch.
    console.error('Error during scraping or Puppeteer launch:', err.message);
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
