const isVercelEnvironment = !!process.env.AWS_REGION; 

/**
 * Dynamically imports puppeteer-core and @sparticuz/chromium (or chromium-min locally).
 * This function handles the specifics of getting the correct executable path
 * for a headless Chromium browser, which is essential for serverless environments.
 * @returns {Promise<{puppeteer: object, chromiumArgs: string[], chromiumDefaultViewport: object, executablePath: string|null}>}
 */

async function getBrowserModules() {
  const puppeteer = await import('puppeteer-core');
  const { default: ChromiumClass } = await import('@sparticuz/chromium');

  console.log('--- Debugging ChromiumClass object (Vercel) ---');
  console.log('Type of ChromiumClass:', typeof ChromiumClass);
  console.log('Keys of ChromiumClass:', Object.keys(ChromiumClass));
  console.log('Full ChromiumClass object:', ChromiumClass);
  // @sparticuz/chromium's executablePath is a function that returns the path.
  console.log('ChromiumClass.executablePath is a function:', typeof ChromiumClass.executablePath === 'function');
  console.log('ChromiumClass.args:', ChromiumClass.args);
  console.log('ChromiumClass.defaultViewport:', ChromiumClass.defaultViewport);
  console.log('--- End ChromiumClass Debug (Vercel) ---');

  let executablePathValue = null;
  if (typeof ChromiumClass.executablePath === 'function') {
    // If it's a function, call it to get the path (it's often async).
    executablePathValue = await ChromiumClass.executablePath();
  } else {
    // Fallback in case it's a direct property, though less common for this library.
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
 * Vercel Serverless Function for scraping AP News US Supreme Court articles.
 * This function fetches article titles, URLs, and publication dates.
 * It's designed to be invoked via an HTTP request.
 * @param {object} req - The Vercel request object.
 * @param {object} res - The Vercel response object.
 */
export default async function (req, res) {
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

  const launchOptions = isVercelEnvironment
    ? {
        args: chromiumArgs, 
        defaultViewport: chromiumDefaultViewport, 
        executablePath: executablePath, 
        headless: true,
      }
    : {
        // For local development, Puppeteer can often find an installed Chrome/Chromium.
        headless: true,
        slowMo: 50, // Added for local debugging to slow down operations.
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'], // Recommended args for robustness.
      };

  let browser; // Declare browser here so it's accessible in the finally block.

  try {
    console.log('Attempting to launch Puppeteer with options:', JSON.stringify(launchOptions, null, 2));
    browser = await puppeteer.launch(launchOptions); 

    const page = await browser.newPage();
    const url = 'https://apnews.com/hub/us-supreme-court'; 

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }); 
    await page.waitForSelector('div.PagePromo-content', { timeout: 15000 });

    // Extract article titles and URLs from the listing page.
    const articles = await page.evaluate(() => {
      const articleDivs = Array.from(document.querySelectorAll('div.PagePromo-content'));

      // Map div elements to raw article objects (title, url) and filter out invalid ones.
      const rawArticles = articleDivs.map(div => {
        const linkEl = div.querySelector('a.Link');
        const titleEl = div.querySelector('span.PagePromoContentIcons-text');

        const url = linkEl?.href || null;
        const title = titleEl?.textContent.trim() || null;

        return { title, url };
      }).filter(article => article.title && article.url); // Ensure title and URL exist.

      // Deduplicate articles based on their URL to avoid duplicates.
      const seenUrls = new Set();
      return rawArticles.filter(article => {
        if (seenUrls.has(article.url)) return false; // If URL already seen, filter out.
        seenUrls.add(article.url); // Add new URL to seen set.
        return true;
      });
    });

    // If no articles are found, send a 200 OK response with a message.
    if (articles.length === 0) {
      console.log('No articles found');
      return res.status(200).json({ message: 'No articles found' });
    }

    const detailedArticles = [];

    // Loop through a limited number of articles (max 10) to get detailed info.
    for (let i = 0; i < Math.min(articles.length, 10); i++) {
      const { title, url } = articles[i]; // Destructure title and URL.
      try {
        const articlePage = await browser.newPage(); // Open a new page for each article.
        // Navigate to the individual article URL.
        await articlePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Extract the publication date from the article page.
        const date = await articlePage.evaluate(() => {
          const dateEl1 = document.querySelector('div.Page-dateModified'); // First date selector.
          const dateEl2 = document.querySelector('[span-data-date]'); // Second date selector.
          // Return the trimmed text content from either element, or 'Date not found'.
          return (dateEl1?.textContent || dateEl2?.textContent || 'Date not found').trim();
        });

        detailedArticles.push({ title, url, date }); // Add detailed article to array.
        await articlePage.close(); // Close the article page to save resources.
      } catch (err) {
        // Log a warning if a date cannot be retrieved for a specific article.
        console.warn(`Failed to retrieve date for article ${i + 1} (${url}): ${err.message}`);
        detailedArticles.push({ title, url, date: 'Date not found' }); // Add with placeholder.
      }
    }

    // Optional: Deduplicate detailed articles again by title, just to be extra safe.
    const seenTitles = new Set();
    const deduplicatedArticles = detailedArticles.filter(article => {
      if (seenTitles.has(article.title)) return false;
      seenTitles.add(article.title);
      return true;
    });

    // Send the scraped and deduplicated articles as a JSON response.
    res.status(200).json(deduplicatedArticles);

  } catch (err) {
    // Catch any errors during the scraping process or Puppeteer launch.
    console.error('Error during scraping or Puppeteer launch:', err);
    // Send a 500 Internal Server Error response.
    res.status(500).json({ error: 'Scraping failed', details: err.message });
  } finally {
    // Ensure the browser is closed even if an error occurs.
    if (browser) {
      await browser.close();
    }
  }
}
