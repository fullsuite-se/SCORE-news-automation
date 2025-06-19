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
 * Vercel Serverless Function for scraping articles from Semana Sostenible.
 * This function fetches article titles, URLs, and publication dates
 * from semana.com/sostenible.
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
  const baseUrl = 'https://www.semana.com';
  const url = `${baseUrl}/sostenible/`; // Target URL for scraping.

  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions); // Launch the browser instance.
    const page = await browser.newPage();

    console.log('Navigating to Semana Sostenible page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }); // Navigate to the URL.
    // Wait for a key selector to ensure content is loaded.
    await page.waitForSelector('div.card-body', { timeout: 15000 });

    console.log('Extracting article links and titles...');
    const rawArticles = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div.card-body'));
      const seen = new Set(); // Use a Set to track seen URLs for deduplication.
      const results = []; // Array to store the scraped articles.

      cards.forEach(card => {
        // Look for h2 elements with specific classes, then for an anchor tag within them.
        const h2 = card.querySelector('h2.card-title.h2.semanaserif-extrabold, h2.card-title.h4');
        const aTag = h2 ? h2.querySelector('a[href]') : null;

        const url = aTag ? aTag.href.trim() : null;
        const title = aTag ? aTag.textContent.trim() : null;

        // Deduplicate based on a combined key of title and URL.
        const key = `${title}||${url}`;
        if (title && url && !seen.has(key)) {
          seen.add(key); // Add new key to seen set.
          results.push({ title, url }); // Add the article to results.
        }
      });

      return results; // Return the deduplicated list of articles.
    });

    const detailedArticles = []; // Array to store articles with fetched dates.

    // Loop through the raw articles, limiting to a maximum of 10, to get detailed info.
    for (const article of rawArticles) {
      if (detailedArticles.length >= 10) break; // Stop if 10 articles are already processed.

      try {
        const articlePage = await browser.newPage(); // Open a new page for each article.
        // Navigate to the individual article URL.
        await articlePage.goto(article.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Extract the publication date from the article page.
        const date = await articlePage.evaluate(() => {
          const dateContainer = document.querySelector('div.mb-5.text-xs.text-smoke-500'); // Date selector.
          return dateContainer ? dateContainer.textContent.trim() : null; // Return trimmed text or null.
        });

        if (date) { // Only push if a date was found.
          detailedArticles.push({ ...article, date }); // Add the date to the article object.
        } else {
          console.warn(`Date not found for article: ${article.url}`);
        }

        await articlePage.close(); // Close the article page to save resources.
      } catch (err) {
        // Log a warning if an error occurs during date retrieval or page navigation.
        console.warn(`Skipping article due to error: ${article.url}, Details: ${err.message}`);
        // Optionally, you could still add the article with a 'Date not found' placeholder here
        // if you want to include all articles regardless of date availability.
      }
    }

    if (detailedArticles.length === 0) {
      console.warn('No valid articles with dates found.');
      return res.status(200).json({ message: 'No articles found or no dates could be retrieved.' });
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
